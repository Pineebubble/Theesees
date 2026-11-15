'use strict';
/* Sync from Zotero: the rules, without any browser or network (tested in Node by zotero-check.cjs).
   Zotero stays the place for reading and annotating. What you made there arrives here as:
   - a highlight or underline (quoted text)        → a passage under its paper
   - the same, with a comment of yours on it        → that passage + a discussion linked to it, holding the comment
   - a note with no quoted text (sticky or typed)   → a discussion under the paper
   Zotero records which is which (annotationType, annotationText, annotationComment), so nothing is guessed.
   Syncing again only adds what is new and updates what changed in Zotero. It never deletes anything in
   Theesees, never overwrites a comment you edited here, and what you deleted here does not come back.
   Records keep where they came from: paper.zoteroKey; on a passage zoteroKey (the annotation),
   zoteroAttachment + zoteroPage (to open the PDF there) and zoteroModified; on a discussion zoteroKey,
   zoteroComment (the comment as it was in Zotero) and zoteroModified. data.zoteroSeen lists everything ever
   brought in: the annotation's key for its passage, "note:"+key for its discussion. */
const zoteroNorm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const zoteroDoi=s=>String(s||'').trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//,'').replace(/^doi:\s*/,'');
const zoteroYear=s=>(String(s||'').match(/\b(1[5-9]|20)\d\d\b/)||[''])[0];
// What Theesees keeps about a paper, from a Zotero item (or, for a PDF filed on its own, its attachment).
function zoteroPaperFields(item){
 const people=(item.creators||[]),authors=people.some(c=>c.creatorType==='author')?people.filter(c=>c.creatorType==='author'):people;
 return {title:String(item.title||'').trim()||String(item.filename||'').replace(/\.pdf$/i,'')||'Untitled (from Zotero)',
  author:authors.map(c=>c.name||[c.firstName,c.lastName].filter(Boolean).join(' ')).filter(Boolean).join(', '),
  year:zoteroYear(item.date),doi:zoteroDoi(item.DOI)};
}
// The same paper already in Theesees: linked before, or the same DOI, or the same title (and year, when both have one).
function zoteroFindPaper(papers,key,f){
 const title=zoteroNorm(f.title);
 return papers.find(p=>p.zoteroKey===key)
  ||(f.doi&&papers.find(p=>!p.zoteroKey&&zoteroDoi(p.doi)===f.doi))
  ||papers.find(p=>!p.zoteroKey&&title&&zoteroNorm(p.title)===title&&(!p.year||!f.year||String(p.year)===f.year))||null;
}
function zoteroPassageFields(key,d){
 let page=null;try{const i=JSON.parse(d.annotationPosition||'{}').pageIndex;if(Number.isInteger(i))page=i+1;}catch{}
 return {quote:String(d.annotationText||'').trim(),location:d.annotationPageLabel?`p. ${d.annotationPageLabel}`:page?`PDF page ${page}`:'Zotero annotation',
  zoteroKey:key,zoteroAttachment:d.parentItem,zoteroPage:page,zoteroModified:d.dateModified||''};
}
const zoteroLink=h=>h.zoteroKey&&h.zoteroAttachment?`zotero://open-pdf/library/items/${h.zoteroAttachment}?${h.zoteroPage?`page=${h.zoteroPage}&`:''}annotation=${h.zoteroKey}`:'';
// A discussion holding one comment of yours, as "＋ Discussion" would make it. h is the passage it is about, if any.
function zoteroThread(key,d,comment,paperId,h,newId){
 const line=comment.split('\n')[0].trim(),at=d.dateModified||new Date().toISOString();
 return {id:newId(),title:line.length>70?line.slice(0,69).trimEnd()+'…':line,platform:'Personal notes / AI conversations',transcript:'',paperIds:h?[]:[paperId],passageIds:h?[h.id]:[],status:'Open',
  blocks:[{id:newId(),parentId:null,subthread:false,anchor:null,anchorQuote:'',text:comment,role:'Me',key:false,source:h?{id:h.id,paperId:h.paperId,quote:h.quote,location:h.location}:null,at,zoteroKey:key}],
  created:d.dateAdded||at,zoteroKey:key,zoteroComment:comment,zoteroModified:d.dateModified||''};
}
/* What a sync would do. annotations, attachments and tops are Zotero items ({key,data}); the attachments are
   the PDFs the annotations sit on, tops the papers those PDFs belong to. newId makes ids for new records.
   Returns {papers:[new], link:[{id,zoteroKey}], passages:[new], threads:[new], updates:[{id,fields}],
   threadUpdates:[{id,text,modified}], seen:[keys], upToDate, skipped:{empty,removedHere,noPaper}}.
   Nothing is changed until zoteroApply. */
function zoteroPlan({annotations,attachments,tops},data,newId){
 const att=new Map(attachments.map(i=>[i.key,i.data])),top=new Map(tops.map(i=>[i.key,i.data]));
 const have=new Map(data.passages.filter(h=>h.zoteroKey).map(h=>[h.zoteroKey,h])),haveThread=new Map(data.threads.filter(t=>t.zoteroKey).map(t=>[t.zoteroKey,t])),seen=new Set(data.zoteroSeen||[]);
 const plan={papers:[],link:[],passages:[],threads:[],updates:[],threadUpdates:[],seen:[],upToDate:0,skipped:{empty:0,removedHere:0,noPaper:0}},paperFor=new Map();
 const paperOf=(sourceKey,pdf)=>{
  let paper=paperFor.get(sourceKey);if(paper)return paper;
  const f=zoteroPaperFields(top.get(sourceKey)||pdf);
  paper=zoteroFindPaper(data.papers,sourceKey,f);
  if(paper){if(!paper.zoteroKey)plan.link.push({id:paper.id,zoteroKey:sourceKey});}
  else{paper={id:newId(),...f,status:'To read',keywords:[],text:'',relevance:'',pdfName:'',zoteroKey:sourceKey};plan.papers.push(paper);}
  paperFor.set(sourceKey,paper);return paper;
 };
 const order=[...annotations].sort((a,b)=>String(a.data.parentItem).localeCompare(String(b.data.parentItem))||String(a.data.annotationSortIndex).localeCompare(String(b.data.annotationSortIndex)));
 for(const {key,data:d} of order){
  if(d.itemType!=='annotation'||d.deleted)continue;
  const comment=String(d.annotationComment||'').trim(),quoted=['highlight','underline'].includes(d.annotationType)&&!!String(d.annotationText||'').trim();
  if(!quoted&&!comment){plan.skipped.empty++;continue;} // drawings, pictures of an area, empty notes
  const pdf=att.get(d.parentItem);if(!pdf||pdf.deleted){plan.skipped.noPaper++;continue;}
  const sourceKey=pdf.parentItem&&top.has(pdf.parentItem)?pdf.parentItem:d.parentItem;
  let did=false,removed=false,h=null;
  if(quoted){
   const fields=zoteroPassageFields(key,d);h=have.get(key)||null;
   if(h){if(h.zoteroModified!==fields.zoteroModified){plan.updates.push({id:h.id,fields});did=true;}}
   else if(seen.has(key))removed=true;
   else{h={id:newId(),paperId:paperOf(sourceKey,pdf).id,...fields,start:null,end:null};plan.passages.push(h);plan.seen.push(key);did=true;}
  }
  if(comment&&!(quoted&&!h)){ // a comment on a passage you deleted here stays out with it
   const t=haveThread.get(key);
   if(t){if(t.zoteroModified!==(d.dateModified||'')){plan.threadUpdates.push({id:t.id,text:comment,modified:d.dateModified||''});did=did||t.zoteroComment!==comment;}}
   else if(seen.has('note:'+key))removed=true;
   else{plan.threads.push(zoteroThread(key,d,comment,h?h.paperId:paperOf(sourceKey,pdf).id,h,newId));plan.seen.push('note:'+key);did=true;}
  }
  if(removed&&!did)plan.skipped.removedHere++;else if(!did)plan.upToDate++;
 }
 return plan;
}
function zoteroApply(plan,data){
 data.papers.push(...plan.papers);
 for(const l of plan.link){const p=data.papers.find(p=>p.id===l.id);if(p)p.zoteroKey=l.zoteroKey;}
 data.passages.push(...plan.passages);
 for(const u of plan.updates){const h=data.passages.find(h=>h.id===u.id);if(h)Object.assign(h,u.fields);}
 data.threads.push(...plan.threads);
 for(const u of plan.threadUpdates){
  const t=data.threads.find(t=>t.id===u.id);if(!t)continue;
  const b=(t.blocks||[]).find(b=>b.zoteroKey===t.zoteroKey);
  if(b&&b.text===t.zoteroComment)b.text=u.text; // only if you have not edited the comment here
  t.zoteroComment=u.text;t.zoteroModified=u.modified;
 }
 data.zoteroSeen=[...new Set([...(data.zoteroSeen||[]),...data.passages.filter(h=>h.zoteroKey).map(h=>h.zoteroKey),...data.threads.filter(t=>t.zoteroKey).map(t=>'note:'+t.zoteroKey),...plan.seen])];
}
const zoteroPlanEmpty=plan=>!plan.passages.length&&!plan.threads.length&&!plan.updates.length&&!plan.link.length&&!plan.threadUpdates.length;

if(typeof module!=='undefined')module.exports={zoteroPlan,zoteroApply,zoteroPlanEmpty,zoteroPaperFields,zoteroFindPaper,zoteroLink,zoteroDoi};
