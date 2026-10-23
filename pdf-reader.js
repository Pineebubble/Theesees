'use strict';
/* PDF reader built on PDF.js: renders pages itself so saved passages can be found, highlighted and created
   from a text selection. Pages render only near the viewport. One document stays open per paper, so
   re-rendering the reader (e.g. after editing keywords) does not re-parse the PDF. */
const PDFJS_DIR='vendor/pdfjs/';
let pdfState=null;
const pdfReady=()=>typeof pdfjsLib!=='undefined';

function pdfPassages(paperId){return data.passages.filter(h=>h.paperId===paperId);}
function pdfPreferredPage(h){
 if(h.pdfPage&&h.pdfQuote===h.quote)return h.pdfPage;
 const n=locationPage(h.location);if(n===null)return null;
 const i=pdfState?.labels?.indexOf(String(n));return i>=0?i+1:n;
}
function pdfPageName(n){const l=pdfState?.labels?.[n-1];return l&&l!==String(n)?`p. ${l}`:`p. ${n}`;}

async function mountPDFReader(file,p,url){
 const box=$('#pdf-preview');if(!box)return;
 if(!pdfReady()){box.innerHTML=`<div class="pdf-caption"><small>${esc(p.pdfName)}</small><a href="${url}" target="_blank" rel="noopener">Open PDF in new tab ↗</a></div><iframe title="Paper PDF" src="${url}#view=FitH"></iframe><p class="help">The PDF reader could not load, so passages cannot be located here.</p>`;return;}
 box.innerHTML=`<div class="pdf-toolbar"><small class="pdf-file">${esc(p.pdfName)}</small><span class="pdf-pageinfo" id="pdf-pageinfo">Loading…</span><div class="actions"><button data-pdf-zoom="-1" aria-label="Zoom out">−</button><button data-pdf-zoom="0">Fit width</button><button data-pdf-zoom="1" aria-label="Zoom in">+</button><button id="pdf-fullscreen" aria-pressed="false">Full-screen</button><a href="${url}" target="_blank" rel="noopener">Open in new tab ↗</a></div></div><div class="pdf-pages" id="pdf-pages" tabindex="0" aria-label="PDF pages"></div><button class="pdf-save-selection primary" id="pdf-save-selection" hidden>＋ Save passage</button><p class="pdf-tip">Select text in the PDF to save it as a passage. Saved passages are highlighted.</p>`;
 $('#pdf-fullscreen').onclick=()=>setPDFView(!box.classList.contains('pdf-focused'));
 try{
  if(!pdfState||pdfState.paperId!==p.id||pdfState.file!==p.pdfName){
   pdfState?.doc?.destroy();
   pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_DIR+'pdf.worker.min.js';
   const st={paperId:p.id,file:p.pdfName,fit:true,scale:1,tc:[],matches:new Map(),generation:0};pdfState=st;
   // isEvalSupported:false closes CVE-2024-4367 (script execution through crafted fonts) in this PDF.js version.
   st.doc=await pdfjsLib.getDocument({data:await file.arrayBuffer(),isEvalSupported:false,enableXfa:false,cMapUrl:PDFJS_DIR+'cmaps/',cMapPacked:true,standardFontDataUrl:PDFJS_DIR+'standard_fonts/'}).promise;
   st.labels=await st.doc.getPageLabels().catch(()=>null);
   st.sizes=await Promise.all(Array.from({length:st.doc.numPages},(_,i)=>st.doc.getPage(i+1).then(pg=>{const v=pg.getViewport({scale:1});return {w:v.width,h:v.height};})));
   st.indexReady=pdfBuildIndex(st);
  }
  if(pdfState.paperId!==p.id||currentPaper!==p.id||!$('#pdf-pages'))return;
  pdfLayout();pdfBindPages();pdfFitPassages();
  pdfState.indexReady.then(()=>{if(activePassage&&pdfState?.paperId===p.id&&currentPaper===p.id)pdfLocate(activePassage,{quiet:true});});
 }catch(err){box.querySelector('#pdf-pages').innerHTML=`<p class="help pdf-error">Could not open this PDF (${esc(err.message||'unknown error')}). <a href="${url}" target="_blank" rel="noopener">Open it in a new tab</a>.</p>`;}
}
async function pdfText(st,n){return st.tc[n]||=await (await st.doc.getPage(n)).getTextContent();}
async function pdfBuildIndex(st){
 const pages=[];
 for(let n=1;n<=st.doc.numPages;n++){if(pdfState!==st)return;pages.push((await pdfText(st,n)).items.map(i=>i.str||''));}
 st.index=buildPdfIndex(pages);
 pdfSyncMatches(true);
}
/* Re-match passages that are new or whose quote changed; persist page and match quality on the passage. */
function pdfSyncMatches(force=false){
 pdfFitPassages();
 const st=pdfState;if(!st?.index)return;
 const p=getPaper(st.paperId);if(!p)return;let changed=false;
 const hs=pdfPassages(st.paperId),ids=new Set(hs.map(h=>h.id));
 for(const id of st.matches.keys())if(!ids.has(id)){st.matches.delete(id);changed=true;}
 for(const h of hs){
  const old=st.matches.get(h.id);if(!force&&old&&old.quote===h.quote)continue;
  const m=findPassage(st.index,h.quote,pdfPreferredPage(h));
  st.matches.set(h.id,m?{...m,quote:h.quote,segs:matchSegments(st.index,m.start,m.end)}:{quote:h.quote,none:true});
  const at=m?st.index.page[m.start]:null,kind=m?(m.approx?'approx':'exact'):(st.index.text.length?'none':'notext');
  if(h.pdfPage!==at||h.pdfMatch!==kind||h.pdfQuote!==h.quote||h.pdfFile!==p.pdfName){Object.assign(h,{pdfPage:at,pdfMatch:kind,pdfQuote:h.quote,pdfFile:p.pdfName});changed=true;}
 }
 if(changed){save();if(page==='reader'&&currentPaper===st.paperId&&!$('#record-pane')?.contains(document.activeElement))renderPassages();}
 st.pages?.forEach((_,i)=>pdfDrawHighlights(i+1));
}
function pdfLayout(keep=true){
 const st=pdfState,box=$('#pdf-pages');if(!st||!box)return;
 const anchor=keep&&st.pages?pdfCurrentPage():1;
 st.generation++;st.observer?.disconnect();
 const maxW=Math.max(...st.sizes.map(s=>s.w));
 if(st.fit)st.scale=Math.max(.3,(box.clientWidth-28)/maxW);
 box.innerHTML='';st.pages=[];
 st.sizes.forEach((s,i)=>{
  const div=document.createElement('div');div.className='pdf-page';div.dataset.page=i+1;
  div.style.width=Math.floor(s.w*st.scale)+'px';div.style.height=Math.floor(s.h*st.scale)+'px';
  div.innerHTML=`<canvas></canvas><div class="pdf-hl"></div><div class="textLayer"></div><span class="pdf-page-no">${esc(pdfPageName(i+1))}</span>`;
  box.append(div);st.pages.push({div,rendered:false});
 });
 st.observer=new IntersectionObserver(es=>es.forEach(e=>{const n=Number(e.target.dataset.page);if(e.isIntersecting)pdfRenderPage(n);else pdfReleasePage(n);}),{root:box,rootMargin:'900px 0px'});
 st.pages.forEach(pg=>st.observer.observe(pg.div));
 if(anchor>1)box.scrollTop=st.pages[anchor-1].div.offsetTop-box.offsetTop-8;
 pdfPageInfo();
}
async function pdfRenderPage(n){
 const st=pdfState,pg=st?.pages?.[n-1];if(!pg||pg.rendered||pg.rendering)return;
 const gen=st.generation;pg.rendering=true;
 try{
  const page=await st.doc.getPage(n),vp=page.getViewport({scale:st.scale}),dpr=Math.min(window.devicePixelRatio||1,2);
  const canvas=pg.div.querySelector('canvas');canvas.width=Math.floor(vp.width*dpr);canvas.height=Math.floor(vp.height*dpr);canvas.style.width=Math.floor(vp.width)+'px';canvas.style.height=Math.floor(vp.height)+'px';
  await page.render({canvasContext:canvas.getContext('2d'),viewport:vp,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
  if(gen!==st.generation||pdfState!==st)return;
  const layer=pg.div.querySelector('.textLayer');layer.innerHTML='';layer.style.setProperty('--scale-factor',vp.scale);
  const textDivs=[];await pdfjsLib.renderTextLayer({textContentSource:await pdfText(st,n),container:layer,viewport:vp,textDivs}).promise;
  if(gen!==st.generation||pdfState!==st)return;
  // As in PDF.js's own viewer: while dragging, a full-page "end of content" block keeps the selection from jumping
  // to the start of the page when the pointer passes over gaps between words.
  const end=document.createElement('div');end.className='endOfContent';layer.append(end);
  layer.addEventListener('mousedown',()=>end.classList.add('active'));
  pg.textDivs=textDivs;pg.rendered=true;pdfDrawHighlights(n);
 }catch{/* A page that fails to render stays blank; the rest of the document still works. */}
 finally{pg.rendering=false;}
}
function pdfReleasePage(n){
 const pg=pdfState?.pages?.[n-1];if(!pg||!pg.rendered)return;
 const c=pg.div.querySelector('canvas');c.width=c.height=0;pg.div.querySelector('.textLayer').innerHTML='';pg.div.querySelector('.pdf-hl').innerHTML='';pg.textDivs=null;pg.rendered=false;
}
function pdfDrawHighlights(n){
 const st=pdfState,pg=st?.pages?.[n-1];if(!pg?.rendered||!pg.textDivs)return;
 const layer=pg.div.querySelector('.pdf-hl'),base=pg.div.getBoundingClientRect();layer.innerHTML='';
 for(const [id,m] of st.matches){
  if(m.none)continue;
  for(const s of m.segs.filter(s=>s.page===n)){
   const node=pg.textDivs[s.item]?.firstChild;if(!node)continue;
   const len=node.textContent.length,r=document.createRange();r.setStart(node,Math.min(s.from,len));r.setEnd(node,Math.min(s.to,len));
   for(const b of r.getClientRects()){
    if(b.width<1)continue;
    const d=document.createElement('div');d.className='pdf-mark'+(id===activePassage?' active':'')+(m.approx?' approx':'');d.dataset.highlight=id;
    Object.assign(d.style,{left:b.left-base.left+'px',top:b.top-base.top+'px',width:b.width+'px',height:b.height+'px'});layer.append(d);
   }
  }
 }
}
/* Scroll to a passage and flash its highlight. */
async function pdfLocate(id,{quiet=false}={}){
 const st=pdfState,h=data.passages.find(x=>x.id===id);if(!st||!h)return;
 $('#pdf-pageinfo')&&($('#pdf-pageinfo').textContent='Searching…');
 await st.indexReady;if(pdfState!==st)return;pdfSyncMatches();
 const m=st.matches.get(id);
 if(!m||m.none){pdfPageInfo();if(!quiet)toast(st.index.text.length?`Couldn’t find this passage in the PDF text. Check ${h.location}.`:`This PDF has no selectable text (it may be scanned), so passages can’t be located. Check ${h.location}.`);return;}
 activePassage=id;const n=st.index.page[m.start],box=$('#pdf-pages'),pg=st.pages[n-1];
 box.scrollTop=pg.div.offsetTop-box.offsetTop-8;
 await pdfRenderPage(n);st.pages.forEach((_,i)=>pdfDrawHighlights(i+1));
 const mark=pg.div.querySelector(`.pdf-mark[data-highlight="${CSS.escape(id)}"]`);
 if(mark){box.scrollTop=pg.div.offsetTop-box.offsetTop+mark.offsetTop-box.clientHeight/3;pg.div.querySelectorAll(`.pdf-mark[data-highlight="${CSS.escape(id)}"]`).forEach(x=>{x.classList.remove('flash');void x.offsetWidth;x.classList.add('flash');});}
 if(m.approx&&!quiet)toast('Approximate match: the saved quote differs slightly from the PDF text.');
 pdfPageInfo();
}
function pdfCurrentPage(){const st=pdfState,box=$('#pdf-pages');if(!st?.pages||!box)return 1;const y=box.scrollTop+box.offsetTop+box.clientHeight/3;let n=1;st.pages.forEach((pg,i)=>{if(pg.div.offsetTop<=y)n=i+1;});return n;}
function pdfPageInfo(){const el=$('#pdf-pageinfo'),st=pdfState;if(!el||!st?.doc)return;const n=pdfCurrentPage(),l=st.labels?.[n-1];el.textContent=`Page ${n} / ${st.doc.numPages}${l&&l!==String(n)?` · printed ${l}`:''} · ${Math.round(st.scale*100)}%`;}

function pdfBindPages(){
 const box=$('#pdf-pages'),btn=$('#pdf-save-selection');let pending=null,resizeTimer,lastW=box.clientWidth;
 box.addEventListener('scroll',()=>{pdfPageInfo();btn.hidden=true;},{passive:true});
 new ResizeObserver(()=>pdfFitPassages()).observe(box.closest('.source-pane')||box);
 new ResizeObserver(()=>{if(!pdfState?.fit||Math.abs(box.clientWidth-lastW)<30)return;lastW=box.clientWidth;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>pdfLayout(),150);}).observe(box);
 box.addEventListener('mouseup',()=>setTimeout(()=>{
  const sel=getSelection(),text=sel&&!sel.isCollapsed?sel.toString():'';
  const pageEl=text&&sel.anchorNode&&box.contains(sel.anchorNode)?(sel.anchorNode.nodeType===1?sel.anchorNode:sel.anchorNode.parentElement).closest('.pdf-page'):null;
  if(!pageEl||!text.trim()){btn.hidden=true;pending=null;return;}
  pending={quote:text,page:Number(pageEl.dataset.page)};
  const r=sel.getRangeAt(0).getBoundingClientRect(),host=$('#pdf-preview').getBoundingClientRect();
  btn.style.left=Math.min(r.right-host.left,host.width-150)+'px';btn.style.top=r.bottom-host.top+8+'px';btn.hidden=false;
 },0));
 // Clicking a highlight (under the selectable text layer) opens its passage card.
 box.addEventListener('click',e=>{if(!getSelection().isCollapsed)return;const mark=[...(e.target.closest?.('.pdf-page')||box).querySelectorAll('.pdf-mark')].find(m=>{const r=m.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;});if(!mark)return;activePassage=mark.dataset.highlight;renderPassages();pdfState.pages.forEach((_,i)=>pdfDrawHighlights(i+1));document.getElementById('passage-'+activePassage)?.scrollIntoView({block:'nearest',behavior:'smooth'});});
 btn.addEventListener('mousedown',e=>e.preventDefault());
 btn.onclick=()=>{if(pending)pdfSavePassage(pending);btn.hidden=true;};
}
document.addEventListener('mouseup',()=>document.querySelectorAll('.textLayer .endOfContent.active').forEach(e=>e.classList.remove('active')));
function cleanSelectedText(t){return String(t).replace(/­/g,'').replace(/(\p{L})-\s*\n\s*(?=\p{Ll})/gu,'$1').replace(/\s+/g,' ').trim();}
function pdfSavePassage({quote,page:n}){
 const p=getPaper(currentPaper),clean=cleanSelectedText(quote);
 modal('Save passage from PDF',`<p>Saved from page ${n} of the PDF. It will stay highlighted in the PDF.</p><form><label>Quoted passage<textarea name="quote" required rows="6">${esc(clean)}</textarea></label><label>Page / location<input name="location" required value="${esc(pdfPageName(n))}"></label>${actions('Save passage')}</form>`,f=>{
  const q=f.get('quote').trim(),loc=f.get('location').trim();if(!q||!loc)throw Error('Enter a quotation and location.');
  const h={id:uid(),paperId:p.id,quote:q,location:loc,start:null,end:null,pdfPage:n,pdfFile:p.pdfName};
  data.passages.push(h);if(!save()){data.passages.pop();return;}
  activePassage=h.id;getSelection().removeAllRanges();closeModal();renderPassages();
  toast('Passage saved and highlighted.');
 });
}
/* Keep the passages column level with the PDF viewer. Compact mode switches on when the passages run more than
   50% past the viewer and off only when they fit in 60% of it, so it does not flicker between the two. */
let pdfFitTimer;
function pdfFitPassages(){
 const rp=$('#record-pane'),src=$('#pdf-preview')?.closest('.source-pane');if(!rp||!src)return;
 if(!$('#pdf-pages .pdf-page'))return; // the viewer has no real height until its pages are laid out
 rp.classList.add('beside-pdf');
 // Compare against what the column can actually show: the viewer's height, but never more than the window.
 const h=Math.round(Math.min(src.getBoundingClientRect().height,innerHeight-24));if(h<200)return;
 rp.style.setProperty('--viewer-h',h+'px');
 clearTimeout(pdfFitTimer);
 pdfFitTimer=setTimeout(()=>{
  const compact=rp.classList.contains('compact'),content=rp.scrollHeight;
  if(!compact&&content>h*1.5){rp.classList.add('compact');if(typeof recollapse==='function')recollapse(rp);}
  else if(compact&&content<h*0.6){rp.classList.remove('compact');if(typeof recollapse==='function')recollapse(rp);}
 },120);
}
/* Shown on passage cards when the paper is read as a PDF. */
function pdfPassageLabel(h){
 return {exact:`Found in PDF · page ${h.pdfPage}`,approx:`Approximate match in PDF · page ${h.pdfPage}`,none:'Not found in the PDF text',notext:'PDF has no selectable text'}[h.pdfMatch]||'Checking the PDF…';
}
document.addEventListener('click',e=>{
 const z=e.target.closest('[data-pdf-zoom]');if(!z||!pdfState)return;const d=Number(z.dataset.pdfZoom);
 if(d===0)pdfState.fit=true;else{pdfState.fit=false;pdfState.scale=Math.min(4,Math.max(.4,pdfState.scale*(d>0?1.2:1/1.2)));}
 pdfLayout();
});
