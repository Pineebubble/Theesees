'use strict';
/* Search everything: papers, the text inside every PDF and pasted source, passages, discussions (titles,
   notes, comments, imported chats), thoughts and your writing in the Outline.
   Open it with the Search button, ⌘K / Ctrl+K, or "/". Matching ignores case and accents; several words must
   all appear; "quoted words" must appear together. Each result opens where it was found.
   PDF text is read once per PDF and kept in browser storage (IndexedDB, store "pdftext"), so later searches are
   instant; it is re-read if the PDF is replaced. */
let searchPendingPdf=null,searchPdfJob=null;
const searchPdfText=new Map(); // paper id → {name,size,pages:[text],labels}

// --- PDF text cache --------------------------------------------------------------------------------------
async function pdfTextCache(id,value){
 const db=await pdfDB();if(!db.objectStoreNames.contains('pdftext'))return null;
 return new Promise((res,rej)=>{const tx=db.transaction('pdftext',value===undefined?'readonly':'readwrite'),s=tx.objectStore('pdftext');
  if(value===undefined){const r=s.get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null);}else{s.put(value,id);tx.oncomplete=()=>res(value);tx.onerror=()=>rej(tx.error);}});
}
async function readPdfText(file){
 pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_DIR+'pdf.worker.min.js';
 const doc=await pdfjsLib.getDocument({data:await file.arrayBuffer(),isEvalSupported:false,enableXfa:false,cMapUrl:PDFJS_DIR+'cmaps/',cMapPacked:true,standardFontDataUrl:PDFJS_DIR+'standard_fonts/'}).promise;
 try{
  const labels=await doc.getPageLabels().catch(()=>null),pages=[];
  for(let n=1;n<=doc.numPages;n++){const tc=await (await doc.getPage(n)).getTextContent();pages.push(cleanForTranslation(tc.items.map(i=>(i.str||'')+(i.hasEOL?'\n':'')).join('')));}
  return {pages,labels};
 }finally{doc.destroy();}
}
// Makes sure every attached PDF's text is available; reports progress while it reads new ones.
function indexAllPdfs(progress=()=>{}){
 return searchPdfJob||=(async()=>{
  const papers=data.papers.filter(p=>p.pdfName);let done=0;
  for(const p of papers){
   try{
    const file=await getPDF(p.id);
    if(file){
     const have=searchPdfText.get(p.id);
     if(!have||have.name!==file.name||have.size!==file.size){
      const cached=await pdfTextCache(p.id);
      if(cached&&cached.name===file.name&&cached.size===file.size)searchPdfText.set(p.id,cached);
      else if(typeof pdfjsLib!=='undefined'){progress(done,papers.length,p.title);const t=await readPdfText(file);const v={name:file.name,size:file.size,...t};searchPdfText.set(p.id,v);await pdfTextCache(p.id,v).catch(()=>{});}
     }
    }
   }catch{/* an unreadable PDF is skipped */}
   progress(++done,papers.length);
  }
  searchPdfJob=null;
 })();
}

// --- Matching -------------------------------------------------------------------------------------------
// Lower-case, accents removed; map[i] is the index in the original string of folded character i.
function foldMap(s){
 s=String(s||'');let f='';const map=[];
 for(let i=0;i<s.length;){const cp=s.codePointAt(i),ch=String.fromCodePoint(cp),w=ch.length;
  for(const x of ch.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase()){f+=/\s/.test(x)?' ':x;map.push(i);}
  i+=w;}
 return {f,map,s};
}
function parseQuery(q){
 const terms=[];String(q).replace(/"([^"]+)"|(\S+)/g,(m,phrase,word)=>{const t=foldMap((phrase||word).trim().replace(/\s+/g,' ')).f;if(t)terms.push(t);});
 return terms;
}
// All terms present → {hits:[[start,end] in original]} else null.
function findTerms(text,terms){
 if(!text||!terms.length)return null;const fm=foldMap(text),hits=[];
 for(const t of terms){let i=fm.f.indexOf(t);if(i<0)return null;while(i>=0&&hits.length<200){hits.push([fm.map[i],fm.map[i+t.length-1]+1]);i=fm.f.indexOf(t,i+t.length);}}
 return {hits:hits.sort((a,b)=>a[0]-b[0]),text};
}
// A short excerpt around the first hit, with every hit inside it marked.
function snippetHTML(m,len=170){
 const {text,hits}=m,first=hits[0][0],start=Math.max(0,first-Math.floor(len/3)),end=Math.min(text.length,start+len);
 let out='',pos=start;
 for(const [a,b] of hits){if(a<pos||b>end)continue;out+=esc(text.slice(pos,a))+'<mark>'+esc(text.slice(a,b))+'</mark>';pos=b;}
 out+=esc(text.slice(pos,end));
 return (start>0?'…':'')+out.replace(/\s+/g,' ')+(end<text.length?'…':'');
}

// --- Searching ------------------------------------------------------------------------------------------
const SEARCH_GROUPS=[['papers','Papers'],['text','In PDFs and source texts'],['passages','Passages'],['discussions','Discussions'],['thoughts','Thoughts'],['writing','Your writing']];
function runSearch(q){
 const terms=parseQuery(q),out=Object.fromEntries(SEARCH_GROUPS.map(([k])=>[k,[]]));if(!terms.length)return out;
 const add=(group,text,item)=>{const m=findTerms(text,terms);if(m)out[group].push({...item,m});return !!m;};
 for(const p of alpha(data.papers)){
  const ks=p.keywords.map(getKeyword).filter(Boolean).map(k=>k.title).join(', ');
  add('papers',[p.title,p.author,p.year,p.journal,p.doi,ks,p.relevance,p.apa&&p.apa.replace(/\*/g,'')].filter(Boolean).join(' · '),{kind:'paper',id:p.id,title:p.title});
  const pdf=searchPdfText.get(p.id);
  if(pdf&&p.pdfName){let shown=0,more=0;pdf.pages.forEach((t,i)=>{const m=findTerms(t,terms);if(!m)return;if(shown<3){out.text.push({kind:'pdf',id:p.id,page:i+1,label:pdf.labels?.[i]&&pdf.labels[i]!==String(i+1)?`p. ${pdf.labels[i]}`:`p. ${i+1}`,title:p.title,m});shown++;}else more++;});if(more)out.text.push({kind:'more',id:p.id,title:p.title,more});}
  if(p.text)add('text',p.text,{kind:'srctext',id:p.id,title:p.title,label:'pasted text'});
 }
 for(const h of data.passages){const p=getPaper(h.paperId);if(p)add('passages',`${h.quote} (${h.location})`,{kind:'passage',id:h.id,paperId:p.id,title:p.title,label:h.location});}
 for(const t of data.threads){
  add('discussions',[t.title,t.note].filter(Boolean).join(' — '),{kind:'thread',id:t.id,title:t.title,label:'discussion'});
  for(const b of (t.blocks||[]).filter(b=>!b.deleted))add('discussions',String(b.text||''),{kind:'comment',id:t.id,block:b.id,title:t.title,label:b.role==='AI'?'AI reply':'comment'});
  if(t.transcript)add('discussions',t.transcript,{kind:'thread',id:t.id,title:t.title,label:'imported conversation'});
 }
 for(const c of (data.claims||[]))add('thoughts',c.text,{kind:'claim',id:c.id,title:c.status,label:c.status});
 const nums=typeof partNumbers==='function'?partNumbers():{};
 for(const s of (data.outline?.parts||[]))add('writing',[s.title,s.note,typeof draftPlain==='function'?draftPlain(s.draft||''):''].filter(Boolean).join('\n'),{kind:'part',id:s.id,title:`${nums[s.id]||''} ${s.title}`.trim(),label:s.level===1?'section':'subsection'});
 return out;
}

// --- Dialog ---------------------------------------------------------------------------------------------
function searchMount(){
 if($('#search-dialog'))return;
 document.body.insertAdjacentHTML('beforeend',`<dialog class="search-dialog" id="search-dialog" aria-label="Search everything"><div class="search-box"><input id="search-input" type="search" placeholder="Search papers, PDFs, passages, discussions, thoughts, your writing…" aria-label="Search everything" autocomplete="off"><button id="search-close" aria-label="Close">×</button></div><div class="search-status" id="search-status" aria-live="polite"></div><div class="search-results" id="search-results"></div></dialog>`);
 const dlg=$('#search-dialog'),input=$('#search-input');let timer=null;
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(searchRender,180);});
 input.addEventListener('keydown',e=>{
  const items=[...$$('#search-results [data-result]')],i=items.findIndex(x=>x.classList.contains('active'));
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!items.length)return;const j=e.key==='ArrowDown'?Math.min(items.length-1,i+1):Math.max(0,i-1);items.forEach((x,k)=>x.classList.toggle('active',k===j));items[j].scrollIntoView({block:'nearest'});}
  if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);(items[Math.max(0,i)]||null)?.click();}
 });
 $('#search-close').onclick=()=>dlg.close();
 dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();}); // click outside
 $('#search-results').addEventListener('click',e=>{const r=e.target.closest('[data-result]');if(r)searchOpen(JSON.parse(r.dataset.result));const m=e.target.closest('[data-show-all]');if(m){searchShowAll.add(m.dataset.showAll);searchRender();}});
}
const searchShowAll=new Set();let searchLast=null;
function openSearch(){
 searchMount();const dlg=$('#search-dialog');if(!dlg.open)dlg.showModal();
 const input=$('#search-input');input.focus();input.select();searchRender();
 // Read any PDFs not indexed yet, refreshing the results as they arrive.
 if(data.papers.some(p=>p.pdfName&&!searchPdfText.has(p.id)))indexAllPdfs((done,total,title)=>{const st=$('#search-status');if(st&&done<total)st.dataset.indexing=`Reading PDFs ${done+1} of ${total}${title?`: ${title.slice(0,50)}`:''}…`;else if(st)delete st.dataset.indexing;searchRender(true);}).then(()=>{const st=$('#search-status');if(st)delete st.dataset.indexing;searchRender(true);});
}
function searchRender(keepActive=false){
 const q=$('#search-input')?.value||'',box=$('#search-results'),st=$('#search-status');if(!box)return;
 if(q!==searchLast){searchShowAll.clear();searchLast=q;}
 const res=runSearch(q),total=SEARCH_GROUPS.reduce((n,[k])=>n+res[k].filter(r=>r.kind!=='more').length,0);
 st.textContent=[q.trim()?`${plural(total,'result')}`:'Type to search everything in Theesees. Use "quotes" for an exact phrase.',st.dataset.indexing||''].filter(Boolean).join(' · ');
 if(!q.trim()){box.innerHTML='';return;}
 const active=keepActive?box.querySelector('.active')?.dataset.result:null;
 box.innerHTML=SEARCH_GROUPS.map(([k,label])=>{
  const rs=res[k];if(!rs.length)return '';const shown=searchShowAll.has(k)?rs:rs.slice(0,6);
  return `<section><h3>${label} <small>${rs.filter(r=>r.kind!=='more').length}</small></h3>${shown.map(r=>r.kind==='more'?`<button class="search-more" data-result='${esc(JSON.stringify({kind:'pdf',id:r.id,page:1}))}'>+ ${plural(r.more,'more page')} in “${esc(r.title.slice(0,60))}”</button>`:`<button class="search-result" data-result='${esc(JSON.stringify({kind:r.kind,id:r.id,paperId:r.paperId,block:r.block,page:r.page,at:r.m.hits[0][0]}))}'><span class="search-where">${esc(r.title||'')}${r.label?` <small>${esc(r.label)}</small>`:''}</span><span class="search-snippet">${snippetHTML(r.m)}</span></button>`).join('')}${rs.length>shown.length?`<button class="link search-all" data-show-all="${k}">Show all ${rs.length}</button>`:''}</section>`;
 }).join('')||`<p class="search-none">No matches${$('#search-status').dataset.indexing?' yet: still reading PDFs':''}.</p>`;
 const items=[...box.querySelectorAll('[data-result]')];(items.find(x=>x.dataset.result===active)||items[0])?.classList.add('active');
}
// Go to where a result was found.
function searchOpen(r){
 const q=$('#search-input').value.trim();$('#search-dialog').close();
 const pdfQuery=q.replace(/"/g,'');
 if(r.kind==='paper')return openPaper(r.id);
 if(r.kind==='passage')return openPaper(r.paperId,r.id);
 if(r.kind==='pdf'){const p=getPaper(r.id);if(p&&p.readingMode==='text'){p.readingMode='pdf';save();}searchPendingPdf={q:pdfQuery,page:r.page||1};return openPaper(r.id);}
 if(r.kind==='srctext'){const p=getPaper(r.id);if(p&&p.pdfName&&p.readingMode!=='text'){p.readingMode='text';save();}openPaper(r.id);return setTimeout(()=>searchShowInText(r.at,q),120);}
 if(r.kind==='thread'||r.kind==='comment'){openThread(r.id);if(r.block)setTimeout(()=>{const el=document.getElementById('block-'+r.block);if(el){el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.add('search-flash');setTimeout(()=>el.classList.remove('search-flash'),1800);}},150);return;}
 if(r.kind==='claim')return openClaim(r.id);
 if(r.kind==='part'){if(typeof flushDraft==='function')flushDraft();outlineMode='write';try{localStorage.setItem('theesees-outline-mode','write');}catch{}writePartId=r.id;return navigate('outline');}
}
// Select the match inside a paper's pasted text and scroll to it.
function searchShowInText(at,q){
 const el=$('#source-text');if(!el)return;const terms=parseQuery(q);
 const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let pos=0,node;
 while((node=walker.nextNode())){const len=node.textContent.length;if(pos+len>at){const r=document.createRange(),len0=Math.max(1,terms[0]?.length||1);r.setStart(node,at-pos);r.setEnd(node,Math.min(len,at-pos+len0));getSelection().removeAllRanges();getSelection().addRange(r);(node.parentElement).scrollIntoView({block:'center'});const rect=r.getBoundingClientRect(),box=el.getBoundingClientRect();el.scrollTop+=rect.top-box.top-box.height/3;return;}pos+=len;}
}
document.addEventListener('keydown',e=>{
 const typing=e.target.closest?.('input,textarea,select,[contenteditable="true"]');
 if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}
 else if(e.key==='/'&&!typing&&!$('#modal')?.open){e.preventDefault();openSearch();}
});
document.addEventListener('click',e=>{if(e.target.closest('#global-search'))openSearch();});
// Show the right shortcut for this computer.
{const k=document.querySelector('#global-search kbd');if(k&&!/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent))k.textContent='Ctrl K';}
