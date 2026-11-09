'use strict';
/* Search inside the open PDF. Uses the same text index as passage matching (pdf-match.js), so it ignores case,
   line breaks, hyphenation and punctuation, and finds words across lines. Every hit on a page is tinted and the
   current one is stronger; ↑/↓, Enter and Shift+Enter step through them, and ⌘F / Ctrl+F jumps to the box. */
let pdfFindTimer=null;
const pdfSearchHTML=()=>`<div class="pdf-find" role="search"><input id="pdf-find" type="search" placeholder="Search in PDF" aria-label="Search in this PDF" autocomplete="off"><span id="pdf-find-count" aria-live="polite"></span><button id="pdf-find-prev" aria-label="Previous match" title="Previous (Shift+Enter)" disabled>↑</button><button id="pdf-find-next" aria-label="Next match" title="Next (Enter)" disabled>↓</button></div>`;
function pdfBindSearch(){
 const input=$('#pdf-find');if(!input)return;
 const st=pdfState;if(st?.find){input.value=st.find.raw;pdfFindCount();}
 input.addEventListener('input',()=>{clearTimeout(pdfFindTimer);pdfFindTimer=setTimeout(()=>pdfFind(input.value),250);});
 input.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();clearTimeout(pdfFindTimer);const st=pdfState;if(!st?.find||st.find.raw!==input.value)pdfFind(input.value);else pdfFindStep(e.shiftKey?-1:1);}
  if(e.key==='Escape'){input.value='';pdfFind('');}
 });
 $('#pdf-find-prev').onclick=()=>pdfFindStep(-1);$('#pdf-find-next').onclick=()=>pdfFindStep(1);
}
async function pdfFind(raw){
 const st=pdfState;if(!st)return;
 const q=normalizeQuote(raw);
 if(q.length<2){st.find=null;pdfFindCount();pdfFindRedraw();return;}
 $('#pdf-find-count').textContent='Searching…';
 await st.indexReady;if(pdfState!==st)return;
 const hits=occurrences(st.index.text,q,2000).map(start=>({start,end:start+q.length,page:st.index.page[start]}));
 // Start from the first hit at or after the page you are on.
 const here=typeof pdfCurrentPage==='function'?pdfCurrentPage():1,first=Math.max(0,hits.findIndex(h=>h.page>=here));
 st.find={raw,q,hits,cur:hits.length?first:-1};
 pdfFindCount();pdfFindRedraw();if(hits.length)pdfFindShow();
}
function pdfFindStep(dir){const f=pdfState?.find;if(!f?.hits.length)return;f.cur=(f.cur+dir+f.hits.length)%f.hits.length;pdfFindCount();pdfFindRedraw();pdfFindShow();}
function pdfFindCount(){
 const el=$('#pdf-find-count'),f=pdfState?.find,st=pdfState;if(!el)return;
 const none=!f||!f.hits.length;['#pdf-find-prev','#pdf-find-next'].forEach(s=>{if($(s))$(s).disabled=none;});
 el.textContent=!f?'':f.hits.length?`${f.cur+1} of ${f.hits.length}${f.hits.length>=2000?'+':''}`:st?.index?.text.length?'No matches':'No searchable text (scanned PDF?)';
}
function pdfFindRedraw(){const st=pdfState;st?.pages?.forEach((_,i)=>pdfDrawHighlights(i+1));}
// Called by pdfDrawHighlights for each rendered page.
function pdfDrawFind(n,pg,layer,base){
 const f=pdfState?.find;if(!f?.hits.length)return;
 f.hits.forEach((h,i)=>{
  if(h.page!==n)return;
  h.segs||=matchSegments(pdfState.index,h.start,h.end);
  const boxes=[];
  for(const s of h.segs){
   const node=pg.textDivs[s.item]?.firstChild;if(!node)continue;
   const len=node.textContent.length,r=document.createRange();r.setStart(node,Math.min(s.from,len));r.setEnd(node,Math.min(s.to,len));
   for(const b of r.getClientRects())if(b.width>=1)boxes.push({l:b.left-base.left,t:b.top-base.top,r:b.right-base.left,b:b.bottom-base.top});
  }
  for(const b of pdfMergeLineBoxes(boxes)){
   const d=document.createElement('div');d.className='pdf-find-hit'+(i===f.cur?' current':'');
   Object.assign(d.style,{left:b.l+'px',top:b.t+'px',width:b.r-b.l+'px',height:b.b-b.t+'px'});layer.append(d);
  }
 });
}
// Scroll the current hit into the middle of the viewer.
async function pdfFindShow(){
 const st=pdfState,f=st?.find,h=f?.hits[f.cur],box=$('#pdf-pages');if(!h||!box)return;
 const pg=st.pages[h.page-1];if(!pg)return;
 box.scrollTop=pg.div.offsetTop-box.offsetTop-8;
 await pdfRenderPage(h.page);if(pdfState!==st)return;pdfDrawHighlights(h.page);
 const mark=pg.div.querySelector('.pdf-find-hit.current');
 if(mark)box.scrollTop=pg.div.offsetTop-box.offsetTop+mark.offsetTop-box.clientHeight/3;
 pdfPageInfo();
}
// ⌘F / Ctrl+F goes to the PDF search box while a PDF is open.
document.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='f'&&$('#pdf-find')&&!$('#modal')?.open){e.preventDefault();$('#pdf-find').focus();$('#pdf-find').select();}
});
