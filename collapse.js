'use strict';
/* Long quoted passages collapse to a few lines with a "Show full passage" toggle, wherever they appear.
   Runs on any DOM change, so every view gets it without each renderer opting in. Expanded passages stay
   expanded when a view re-renders (keyed by their card and opening words). */
const COLLAPSE_SELECTOR='.passage blockquote,.evidence-card blockquote,.block-source blockquote,.quote-preview blockquote';
const COLLAPSE_LINES=6,COMPACT_LINES=3;
const expandedPassages=new Set();
const collapseKey=el=>(el.closest('[id]')?.id||'')+'|'+el.textContent.slice(0,80);
function applyCollapse(root=document){
 for(const el of root.querySelectorAll(COLLAPSE_SELECTOR)){
  if(el.dataset.collapse||!el.offsetParent)continue; // hidden (e.g. in a closed <details>): measure once it opens
  el.dataset.collapse='checked';
  const cs=getComputedStyle(el),line=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.6,limit=Math.round(line*(el.closest('.compact')?COMPACT_LINES:COLLAPSE_LINES));
  if(el.scrollHeight<=limit+line*1.5)continue; // only collapse when it hides a meaningful amount
  const key=collapseKey(el),btn=document.createElement('button');
  el.classList.add('collapsible');el.style.setProperty('--collapse-h',limit+'px');
  btn.type='button';btn.className='collapse-toggle';
  const sync=()=>{const open=expandedPassages.has(key);el.classList.toggle('collapsed',!open);btn.textContent=open?'Show less ↑':'Show full passage ↓';btn.setAttribute('aria-expanded',open);};
  btn.onclick=e=>{e.stopPropagation();expandedPassages.has(key)?expandedPassages.delete(key):expandedPassages.add(key);sync();};
  el.after(btn);sync();
 }
}
// Re-measure after a container changes how much it shows (e.g. the passages column going compact).
function recollapse(root){
 for(const el of root.querySelectorAll('[data-collapse]')){delete el.dataset.collapse;el.classList.remove('collapsible','collapsed');if(el.nextElementSibling?.classList.contains('collapse-toggle'))el.nextElementSibling.remove();}
 applyCollapse(root);
}
let collapseQueued=false;
new MutationObserver(()=>{if(collapseQueued)return;collapseQueued=true;requestAnimationFrame(()=>{collapseQueued=false;applyCollapse();});}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('toggle',e=>{if(e.target.open)applyCollapse(e.target);},true);
applyCollapse();
