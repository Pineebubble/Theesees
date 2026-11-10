'use strict';
/* What Ask AI knows beyond the page you're on (used by ask-claude.js):
   1. A project overview sent with every message: your research question and notes for the AI, themes, papers
      with reading status and relevance notes, thoughts and their evidence, the outline with word counts, and
      recent discussions. Titles and notes only, so it stays small.
   2. A library search for each question: the passages, PDF pages, comments, thoughts and drafts that share
      the most words with it, from all your papers, with their sources.
   3. Saving: a reply can be kept as a comment in a discussion, or turned into a thought, so it becomes part
      of the workspace (and of 1 and 2 next time). */
const AC_OVERVIEW_MAX=30000,AC_LIBRARY_MAX=40000,AC_LIBRARY_ITEMS=24;
const acClip=(s,n)=>{s=String(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s;};

// --- 1. Project overview --------------------------------------------------------------------------------
function acOverview(){
 const a=typeof aboutData==='function'?aboutData():{},parts=[];
 const who=[a.name&&a.name!=='The researcher'?a.name:'',a.field].filter(Boolean).join(', ');
 if(who||a.question)parts.push(`Researcher: ${who||'(not set)'}${a.question?`\nResearch question: ${a.question}`:''}`);
 if(data.aiNotes?.trim())parts.push(`What the researcher wants the assistant to know:\n${data.aiNotes.trim()}`);
 const read=data.papers.filter(p=>p.status==='Read').length,reading=data.papers.filter(p=>p.status==='Reading').length;
 const words=(data.outline?.parts||[]).reduce((n,p)=>n+(typeof partWords==='function'?partWords(p):0),0);
 parts.push(`Progress: ${data.papers.length} papers (${read} read, ${reading} reading), ${data.passages.length} saved passages, ${data.threads.length} discussions, ${(data.claims||[]).filter(c=>c.status!=='Abandoned').length} thoughts, ${words.toLocaleString()} words drafted.`);
 if(data.keywords.length)parts.push('Themes:\n'+data.keywords.map(k=>`- ${k.title}${k.note?` — ${acClip(k.note,160)}`:''} (${data.papers.filter(p=>p.keywords.includes(k.id)).length} papers)`).join('\n'));
 if(data.papers.length)parts.push('Papers:\n'+data.papers.slice(0,200).map(p=>{const ks=p.keywords.map(getKeyword).filter(Boolean).map(k=>k.title);const hs=data.passages.filter(h=>h.paperId===p.id).length;return `- ${acClip(p.title,140)} — ${acClip(p.author,60)||'?'} (${p.year||'n.d.'}) [${p.status}]${ks.length?`; themes: ${ks.join(', ')}`:''}${hs?`; ${hs} passages`:''}${p.relevance?`; why it matters: ${acClip(p.relevance,200)}`:''}`;}).join('\n'));
 const live=(data.claims||[]).filter(c=>c.status!=='Abandoned');
 if(live.length)parts.push('Thoughts (the researcher’s claims):\n'+live.slice(0,120).map(c=>{const ev=c.evidence||[],n=r=>ev.filter(e=>e.relation===r).length;return `- [${c.status}] ${acClip(c.text,240)}${ev.length?` (evidence: ${n('supports')} supports, ${n('challenges')} challenges, ${n('qualifies')} qualifies)`:' (no evidence linked yet)'}`;}).join('\n'));
 const ps=data.outline?.parts||[];
 if(ps.length){const nums=typeof partNumbers==='function'?partNumbers():{};parts.push('Outline of the thesis text:\n'+ps.map(s=>`${s.level===2?'  ':''}- ${nums[s.id]||''} ${s.title}${s.note?` — ${acClip(s.note,160)}`:''} (${(typeof partWords==='function'?partWords(s):0).toLocaleString()} words, ${s.claimIds.length} thoughts placed)`).join('\n'));}
 const last=t=>[t.created,...(t.blocks||[]).map(b=>b.at)].filter(Boolean).sort().at(-1)||'';
 const ts=[...data.threads].sort((x,y)=>last(y).localeCompare(last(x))).slice(0,12);
 if(ts.length)parts.push('Recent discussions:\n'+ts.map(t=>{const b=(t.blocks||[]).filter(b=>!b.deleted).at(-1);const ps=typeof threadPapers==='function'?threadPapers(t).map(p=>p.title):[];return `- “${acClip(t.title,120)}”${ps.length?` on ${ps.map(x=>acClip(x,60)).join(', ')}`:''}${b?` — latest: ${acClip(b.text,180)}`:''}`;}).join('\n'));
 return parts.join('\n\n').slice(0,AC_OVERVIEW_MAX);
}

// --- 2. Library search ----------------------------------------------------------------------------------
const AC_STOP=new Set('a an the and or but if of to in on at by for from with about into over under as is are was were be been being do does did have has had this that these those it its they them their there here what which who whom whose when where why how can could should would will shall may might must not no yes i me my we our you your he she his her than then so such very more most less least some any each all both few many much other another same also just only even still yet again ever never always often too please tell give show find explain summarise summarize compare list paper papers article articles text says say think does doesn what whats short long brief briefly bullet bullets point points cite cited citing source sources comes come far bear bears relate relates related collected collect gathered found help write sentence sentences paragraph words word answer question questions based according use using way ways thing things'.split(' '));
function acKeywords(q){
 const out=[];String(q).replace(/"([^"]+)"|([\p{L}\p{N}][\p{L}\p{N}'’-]*)/gu,(m,phrase,word)=>{
  if(phrase){const t=foldMap(phrase.trim()).f;if(t)out.push(t);return;}
  const w=foldMap(word).f.replace(/['’]s$/,'');
  if(/[㐀-鿿぀-ヿ가-힯]/.test(w)){for(let i=0;i+2<=w.length;i++)out.push(w.slice(i,i+2));} // Chinese/Japanese/Korean: pairs of characters
  else if(w.length>=3&&!AC_STOP.has(w))out.push(w);
 });
 return [...new Set(out)].slice(0,16);
}
// Everything searchable, as small labelled pieces.
function acLibraryItems(skipPaper){
 const items=[],cite=p=>`${acClip(p.title,90)} (${acClip(String(p.author||'').split(/,|;| and /)[0],40)||'?'}, ${p.year||'n.d.'})`;
 for(const h of data.passages){const p=getPaper(h.paperId);if(p)items.push({kind:'Passage',src:`${cite(p)}, ${h.location}`,text:h.quote});}
 for(const p of data.papers){
  if(p.id===skipPaper)continue;
  const pdf=typeof searchPdfText!=='undefined'?searchPdfText.get(p.id):null;
  if(pdf&&p.pdfName)pdf.pages.forEach((t,i)=>{if(t.trim())items.push({kind:'PDF',src:`${cite(p)}, ${pdf.labels?.[i]&&pdf.labels[i]!==String(i+1)?'p. '+pdf.labels[i]:'p. '+(i+1)}`,text:t,long:true});});
  else if(p.text)p.text.split(/\n\s*\n/).forEach(t=>{if(t.trim())items.push({kind:'Source text',src:cite(p),text:t,long:true});});
  if(p.relevance)items.push({kind:'Your note on a paper',src:cite(p),text:p.relevance});
 }
 for(const t of data.threads){
  if(t.note)items.push({kind:'Discussion note',src:`“${acClip(t.title,80)}”`,text:t.note});
  for(const b of (t.blocks||[]).filter(b=>!b.deleted))items.push({kind:b.role==='AI'?'AI reply in a discussion':'Your comment',src:`“${acClip(t.title,80)}”${b.source?.quote?`, on “${acClip(b.source.quote,80)}”`:''}`,text:b.text});
 }
 for(const c of (data.claims||[]))if(c.status!=='Abandoned')items.push({kind:`Thought (${c.status})`,src:'',text:c.text});
 const nums=typeof partNumbers==='function'?partNumbers():{};
 for(const s of (data.outline?.parts||[])){const d=typeof draftPlain==='function'?draftPlain(s.draft||''):'';if(d)d.split(/\n+/).forEach(t=>{if(t.trim())items.push({kind:'Your draft',src:`${nums[s.id]||''} ${s.title}`.trim(),text:t,long:true});});}
 return items;
}
// Ranks pieces by the question's words they contain, rarer words counting for more (a word found in only a few
// pieces says more about the question than one found everywhere); returns the best, trimmed around the matches.
function acLibrary(question,skipPaper){
 const kws=acKeywords(question);if(!kws.length)return {text:'',count:0,kws};
 const items=acLibraryItems(skipPaper).map(it=>({it,f:foldMap(it.text).f}));
 const df=Object.fromEntries(kws.map(k=>[k,items.filter(x=>x.f.includes(k)).length]));
 const used=kws.filter(k=>df[k]>0),scored=[];
 for(const {it,f} of items){
  let score=0,first=-1;
  for(const k of used){let i=f.indexOf(k);if(i<0)continue;if(first<0||i<first)first=i;let tf=0;while(i>=0&&tf<5){tf++;i=f.indexOf(k,i+k.length);}score+=Math.log(1+items.length/df[k])*(1+0.15*(tf-1));}
  if(score>0)scored.push({it,score:score-(it.long?0.05:0),first});
 }
 const kwsUsed=used;
 scored.sort((a,b)=>b.score-a.score);
 const top=scored.slice(0,AC_LIBRARY_ITEMS);let text='';
 top.forEach(({it,first},i)=>{
  const s=it.long&&it.text.length>700?(first>250?'…':'')+it.text.slice(Math.max(0,first-250),first+450)+(first+450<it.text.length?'…':''):it.text;
  text+=`[${i+1}] ${it.kind}${it.src?` — ${it.src}`:''}:\n${acClip(s,1200)}\n\n`;
 });
 return {text:text.slice(0,AC_LIBRARY_MAX),count:top.length,kws:kwsUsed.length?kwsUsed:kws};
}

// --- Instructions & what gets sent ----------------------------------------------------------------------
function editAiNotes(){
 modal('What the AI knows',`<form><label>Notes for the AI <small>(sent with every message; saved with your records)</small><textarea name="notes" rows="6" placeholder="e.g. My thesis argues that cosplay is a form of intercultural translation. I write in British English. My supervisor wants more on audience reception.">${esc(data.aiNotes||'')}</textarea></label>
  <p class="help">Your research question and name come from the card on the About page.</p>
  <details class="ac-preview"><summary>See the project overview the AI receives</summary><pre>${esc(acOverview())}</pre></details>${actions('Save')}</form>`,f=>{data.aiNotes=String(f.get('notes')||'').trim();save();closeModal();toast('Saved. The AI will see this with every message.');});
}

// --- 3. Saving a reply ----------------------------------------------------------------------------------
function acSaveReply(i){
 const reply=acChat[i],question=acChat[i-1]?.role==='user'?acChat[i-1].content:'';if(!reply?.content)return;
 const here=page==='reader'?currentPaper:null,threads=data.threads.filter(t=>!here||threadPapers(t).some(p=>p.id===here));
 const options=[...threads,...data.threads.filter(t=>!threads.includes(t))];
 modal('Keep this answer',`<form><p>Saved answers become part of your workspace: they show up in search, and the AI sees them next time.</p>
  <label>Save to<select name="where"><option value="new">A new discussion${here?` about “${esc(acClip(getPaper(here)?.title,50))}”`:''}</option>${options.map(t=>`<option value="${esc(t.id)}">Discussion: ${esc(acClip(t.title,70))}</option>`).join('')}</select></label>
  <label class="ac-new-title">Title of the new discussion<input name="title" value="${esc(acClip(question||`Answer from ${AC_WHO[reply.who||'claude'].name}`,90))}"></label>
  <label class="check"><input type="checkbox" name="withq" ${question?'checked':''}> Include my question</label>
  <div class="actions"><button type="button" id="ac-as-thought">Make it a thought instead…</button><button type="submit" class="primary">Save</button></div></form>`,f=>{
  const where=f.get('where'),now=new Date().toISOString();
  let t=data.threads.find(x=>x.id===where);
  if(!t){t={id:uid(),title:String(f.get('title')||'').trim()||`Answer from ${AC_WHO[reply.who||'claude'].name}`,platform:`Ask AI (${AC_WHO[reply.who||'claude'].name})`,paperIds:here?[here]:[],passageIds:[],status:'Open',blocks:[],created:now};data.threads.push(t);}
  const add=[];if(f.get('withq')&&question)add.push({id:uid(),parentId:null,subthread:false,anchor:null,anchorQuote:'',text:question,role:'Me',key:false,source:null,at:now});
  add.push({id:uid(),parentId:null,subthread:false,anchor:null,anchorQuote:'',text:reply.content,role:'AI',key:false,source:null,at:now});
  t.blocks=[...(t.blocks||[]),...add];if(!save())return;
  reply.saved=t.id;acStore('theesees-chat',acChat.slice(-40));closeModal();acRender();counts();toast(`Saved in “${acClip(t.title,60)}”.`);
 });
 const sel=$('#modal-body select[name="where"]'),title=$('#modal-body .ac-new-title');sel.onchange=()=>{title.hidden=sel.value!=='new';};
 $('#ac-as-thought').onclick=()=>{closeModal();editClaim(null,{fromText:reply.content.slice(0,1500),stay:true});};
}
