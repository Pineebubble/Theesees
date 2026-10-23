'use strict';
/* Add several papers at once from PDFs and/or DOIs. Details come from each PDF (its title/author fields, the
   largest text on page 1, DOIs in the first pages) and, if allowed, from Crossref. Everything is shown for review
   before any paper is added. Only DOIs and titles are sent to Crossref; PDFs never leave the browser. */
const CROSSREF='https://api.crossref.org/works';
// Crossref limits anonymous use to one request at a time, so lookups queue; "slow down" replies are retried.
let crossrefQueue=Promise.resolve();
function crossrefFetch(url){const run=crossrefQueue.then(()=>crossrefRequest(url));crossrefQueue=run.catch(()=>{});return run;}
async function crossrefRequest(url){
 for(let attempt=0;attempt<3;attempt++){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
   const r=await fetch(url,{signal:ctrl.signal,headers:{Accept:'application/json'}});
   if(r.ok)return (await r.json()).message;
   if(r.status!==429&&r.status<500)return null; // e.g. 404: not a Crossref DOI
  }catch{/* network error or timeout: retry */}finally{clearTimeout(timer);}
  await new Promise(res=>setTimeout(res,1000*(attempt+1)));
 }
 return null;
}
const crossrefByDOI=doi=>crossrefFetch(`${CROSSREF}/${encodeURIComponent(doi)}`);
async function crossrefByTitle(title){
 const m=await crossrefFetch(`${CROSSREF}?rows=3&select=DOI,title,author,issued,published,container-title&query.bibliographic=${encodeURIComponent(title)}`);
 const best=(m?.items||[]).map(it=>({it,s:titleSimilarity(title,(it.title||[])[0]||'')})).sort((a,b)=>b.s-a.s)[0];
 return best&&best.s>=0.75?best.it:null;
}
async function readPDFDetails(file){
 const out={title:'',author:'',dois:[]};
 if(typeof pdfjsLib==='undefined')return out;
 pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdfjs/pdf.worker.min.js';
 const doc=await pdfjsLib.getDocument({data:await file.arrayBuffer(),isEvalSupported:false,enableXfa:false,cMapUrl:'vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'vendor/pdfjs/standard_fonts/'}).promise;
 try{
  const meta=await doc.getMetadata().catch(()=>null);
  out.title=usableTitle(meta?.info?.Title);out.author=usableAuthor(meta?.info?.Author);
  const texts=[];
  for(let n=1;n<=Math.min(2,doc.numPages);n++){
   const page=await doc.getPage(n),vp=page.getViewport({scale:1}),tc=await page.getTextContent();
   texts.push(tc.items.map(i=>i.str).join(' '));
   if(n===1&&!out.title)out.title=titleFromItems(tc.items.map(i=>({str:i.str,size:Math.hypot(i.transform[2],i.transform[3]),y:vp.height-i.transform[5]})),vp.height);
  }
  out.dois=findDOIs(texts.join(' '));
 }finally{doc.destroy();}
 return out;
}
/* One row of the review table. `source` explains where the details came from. */
async function resolveEntry({file,doi},lookup){
 const row={file,title:'',author:'',year:'',doi:doi||'',journal:'',source:[],warn:''};
 if(file){
  try{const d=await readPDFDetails(file);Object.assign(row,{title:d.title,author:d.author});if(!row.doi&&d.dois.length)row.doi=d.dois[0];if(d.title||d.author||d.dois.length)row.source.push('PDF');}
  catch{row.warn='Could not read this PDF';}
 }
 if(lookup){
  let m=row.doi?await crossrefByDOI(row.doi):null,how='Crossref';
  if(!m&&!row.doi&&row.title){m=await crossrefByTitle(row.title);how='Crossref (matched by title — check)';}
  if(m){const c=crossrefToPaper(m);
   // Keep the PDF's title when it is the fuller version of Crossref's (e.g. Crossref has no subtitle).
   const fuller=row.title&&c.title&&row.title.length>c.title.length&&row.title.toLowerCase().startsWith(c.title.toLowerCase());
   Object.assign(row,{title:fuller?row.title:c.title||row.title,author:c.author||row.author,year:c.year||row.year,doi:c.doi||row.doi,journal:c.journal});row.source.push(how);}
  else if(row.doi)row.warn||='DOI not found online — check the details';
 }
 if(!row.title)row.title=file?file.name.replace(/\.pdf$/i,'').replace(/[_-]+/g,' '):'';
 if(!row.source.length&&file)row.source.push('file name only');
 if(!row.title)row.warn||='No title found — type one to add it';
 row.dup=findDuplicate(data.papers,row);
 return row;
}
function openBatchImport(){
 modal('Add several papers',`<form class="batch-form"><label>PDF files<input type="file" name="pdfs" accept="application/pdf" multiple></label><label>…and/or DOIs<textarea name="dois" rows="4" placeholder="Paste DOIs, one per line — or any text or reference list that contains them."></textarea></label><label>Themes for all of them (optional)</label>${keywordChecks(libraryKeyword!=='all'?[libraryKeyword]:[])}<label class="batch-check"><input type="checkbox" name="lookup" checked> Look up details online with Crossref <small>Sends only each DOI, or the title when there is no DOI. PDFs stay in this browser.</small></label>${actions('Read details')}</form>`,async(f,form)=>{
  const files=[...form.elements.pdfs.files].filter(x=>x.type==='application/pdf'||/\.pdf$/i.test(x.name));
  const dois=findDOIs(f.get('dois'));
  if(!files.length&&!dois.length)throw Error('Choose PDF files or paste at least one DOI.');
  const big=files.find(x=>x.size>30*1024*1024);if(big)throw Error(`“${big.name}” is over 30 MB, the limit for one PDF.`);
  const themes=f.getAll('keyword'),lookup=!!f.get('lookup');
  const entries=[...files.map(file=>({file})),...dois.map(doi=>({doi}))];
  const box=$('#modal-body');$('#modal').classList.add('wide');
  box.innerHTML=`<p>Reading ${plural(entries.length,'item')}…</p><div class="batch-progress"><div style="width:0"></div></div><p class="batch-current" id="batch-current"></p>`;
  const rows=new Array(entries.length);let done=0,next=0;
  // Three at a time: quick for a stack of PDFs without flooding Crossref.
  await Promise.all(Array.from({length:Math.min(3,entries.length)},async()=>{
   while(next<entries.length&&$('#modal').open){const i=next++;$('#batch-current').textContent=entries[i].file?.name||entries[i].doi;rows[i]=await resolveEntry(entries[i],lookup);done++;box.querySelector('.batch-progress div').style.width=done/entries.length*100+'%';}
  }));
  if(!$('#modal').open)return;
  batchReview(rows.filter(Boolean),themes);
 });
 $('#modal').addEventListener('close',()=>$('#modal').classList.remove('wide'),{once:true});
}
function batchReview(rows,themes){
 const box=$('#modal-body');
 box.innerHTML=`<p>Check the details, untick anything you don’t want, then add. ${themes.length?`Themes: ${themes.map(id=>esc(getKeyword(id)?.title||'')).join(', ')}.`:'No themes chosen; you can add them later.'}</p><form class="batch-review"><div class="batch-table">${rows.map((r,i)=>`<div class="batch-row${r.dup?' is-dup':''}"><label class="batch-pick"><input type="checkbox" name="pick" value="${i}" ${r.dup||!r.title?'':'checked'} aria-label="Add this paper"></label><div class="batch-fields"><input name="title-${i}" value="${esc(r.title)}" aria-label="Title" placeholder="Title"><div class="batch-sub"><input name="author-${i}" value="${esc(r.author)}" aria-label="Authors" placeholder="Authors"><input name="year-${i}" value="${esc(r.year)}" aria-label="Year" placeholder="Year"><input name="doi-${i}" value="${esc(r.doi)}" aria-label="DOI" placeholder="DOI"></div><small>${esc([r.file?.name,r.journal,r.source.join(' + ')].filter(Boolean).join(' · '))}${r.dup?` · <b>Already in your library as “${esc(r.dup.title)}”</b>`:''}${r.warn?` · <b>${esc(r.warn)}</b>`:''}</small></div></div>`).join('')}</div><div class="actions"><button type="submit" class="primary" id="batch-add-go">Add papers</button></div></form>`;
 const form=box.querySelector('form'),btn=$('#batch-add-go');
 const count=()=>{const n=form.querySelectorAll('input[name="pick"]:checked').length;btn.textContent=n?`Add ${plural(n,'paper')}`:'Nothing selected';btn.disabled=!n;};
 form.onchange=count;count();
 form.onsubmit=async e=>{
  e.preventDefault();btn.disabled=true;btn.textContent='Adding…';
  const fd=new FormData(form),added=[],failed=[];
  for(const i of fd.getAll('pick').map(Number)){
   const r=rows[i],title=fd.get('title-'+i).trim();if(!title)continue;
   const p={id:uid(),title,author:fd.get('author-'+i).trim(),year:fd.get('year-'+i).trim(),doi:normDOI(fd.get('doi-'+i))&&fd.get('doi-'+i).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,''),status:'To read',relevance:'',keywords:[...themes],text:'',pdfName:''};
   if(r.file){try{await putPDF(p.id,r.file);p.pdfName=r.file.name;}catch{failed.push(r.file.name);}}
   added.push(p);
  }
  data.papers.push(...added);if(!save()){data.papers.splice(data.papers.length-added.length);btn.disabled=false;count();return;}
  closeModal();libraryKeyword=themes.length===1?themes[0]:'all';navigate('library');
  toast(`${plural(added.length,'paper')} added.${failed.length?` Could not store ${failed.length} PDF${failed.length>1?'s':''}; attach ${failed.length>1?'them':'it'} again from the paper.`:''}`);
 };
}
document.addEventListener('click',e=>{if(e.target.closest('#batch-add'))openBatchImport();});
