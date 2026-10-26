'use strict';
/* Reading bookmark: one per paper, marking where you stopped reading.
   "Bookmark here" in the reading toolbar sets it at the top of what you are looking at: a spot on a PDF page
   (kept as page + position on the page, so zooming does not move it) or a place in the pasted text (a character
   offset). A marker shows it, "Go to bookmark" scrolls back, and reopening the paper returns to it.
   Stored on the paper record as p.bookmark = {mode:'pdf',page,y} or {mode:'text',offset}. */
let bmJumpPending=false;
const bmPaper=()=>page==='reader'?getPaper(currentPaper):null;
const bmLabel=b=>b.mode==='pdf'?(typeof pdfPageName==='function'?pdfPageName(b.page):`p. ${b.page}`):'in the text';
function bookmarkOnOpen(jump){bmJumpPending=jump;}
function bookmarkButtons(p){
 return `<button id="set-bookmark" title="Mark where you are reading">Bookmark here</button>${p.bookmark?`<button id="go-bookmark" title="Return to your bookmark">Go to bookmark (${esc(bmLabel(p.bookmark))})</button>`:''}`;
}
function bindBookmark(p){
 $('#set-bookmark')?.addEventListener('click',()=>setBookmark(p));
 $('#go-bookmark')?.addEventListener('click',()=>goToBookmark(p));
 if(bmJumpPending&&p.bookmark?.mode==='text'&&!usingPDF(p)){bmJumpPending=false;setTimeout(()=>goToBookmark(p,true),60);}
}
// The line you are reading: a little below the top of the visible part of the reading area.
const bmReadingLine=el=>{const r=el.getBoundingClientRect();return Math.min(Math.max(r.top,0)+48,r.bottom-4);};
function setBookmark(p){
 let b=null;
 if(usingPDF(p)&&$('#pdf-pages .pdf-page')){
  const box=$('#pdf-pages'),y=bmReadingLine(box);
  const pages=[...box.querySelectorAll('.pdf-page')];
  const div=pages.find(d=>{const r=d.getBoundingClientRect();return r.top<=y&&r.bottom>=y;})||pages.find(d=>d.getBoundingClientRect().top>y)||pages.at(-1);
  const r=div.getBoundingClientRect();
  b={mode:'pdf',page:Number(div.dataset.page),y:Math.min(1,Math.max(0,(y-r.top)/r.height))};
 }else if($('#source-text')&&p.text){
  const el=$('#source-text'),r=el.getBoundingClientRect(),y=bmReadingLine(el);
  const pos=document.caretRangeFromPoint?.(r.left+24,y)??(()=>{const c=document.caretPositionFromPoint?.(r.left+24,y);if(!c)return null;const rg=document.createRange();rg.setStart(c.offsetNode,c.offset);return rg;})();
  let offset=0;
  if(pos&&el.contains(pos.startContainer)){const pre=document.createRange();pre.selectNodeContents(el);pre.setEnd(pos.startContainer,pos.startOffset);offset=pre.toString().length;}
  // Start the bookmark at the beginning of that word.
  while(offset>0&&/\S/.test(p.text[offset-1]))offset--;
  b={mode:'text',offset};
 }
 if(!b){toast('Open the PDF or add the text first, then set a bookmark.');return;}
 p.bookmark={...b,at:new Date().toISOString()};save();
 refreshBookmark(p);toast(`Bookmark set ${b.mode==='pdf'?'on '+bmLabel(b):'here'}.`);
}
// Redraw the marker and toolbar button without re-rendering the reader (which would reload the PDF).
function refreshBookmark(p){
 const set=$('#set-bookmark');if(set){$('#go-bookmark')?.remove();set.insertAdjacentHTML('afterend',bookmarkButtons(p));set.remove();bindBookmark(p);}
 if(usingPDF(p))drawPdfBookmark();
 else if($('#source-text')&&typeof sourceHTML==='function')$('#source-text').innerHTML=sourceHTML(p);
}
// Called after the PDF viewer lays out its pages (on opening, zooming and resizing).
function drawPdfBookmark(){
 const p=bmPaper(),box=$('#pdf-pages');if(!p||!box)return;
 box.querySelectorAll('.reading-bookmark').forEach(m=>m.remove());
 const b=p.bookmark;if(b?.mode!=='pdf')return;
 const div=box.querySelector(`.pdf-page[data-page="${b.page}"]`);if(!div)return;
 div.insertAdjacentHTML('beforeend',`<span class="reading-bookmark" style="top:${(b.y*100).toFixed(2)}%" title="Your bookmark"><span>Bookmark</span></span>`);
 if(bmJumpPending){bmJumpPending=false;setTimeout(()=>goToBookmark(p,true),60);}
}
// The marker inside pasted text: an empty element, so it changes no character offsets.
function bookmarkMark(){return '<span class="reading-bookmark-text" id="text-bookmark" title="Your bookmark" aria-label="Bookmark"></span>';}
function goToBookmark(p,quiet=false){
 const b=p.bookmark;if(!b)return;
 if((b.mode==='pdf')!==usingPDF(p)){toast(`Your bookmark is in the ${b.mode==='pdf'?'PDF':'text'} view${b.mode==='pdf'?` (${bmLabel(b)})`:''}.`);return;}
 const mark=b.mode==='pdf'?$('#pdf-pages .reading-bookmark'):$('#text-bookmark');
 if(!mark){if(!quiet)toast('The bookmark is not shown yet. Try again once the reader has loaded.');return;}
 mark.scrollIntoView({block:'center',behavior:quiet?'auto':'smooth'});
 if(quiet)toast(`Back at your bookmark${b.mode==='pdf'?` (${bmLabel(b)})`:''}.`);
}
