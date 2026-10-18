'use strict';
const pasteOptions=new WeakMap();
function setupPasteCleanup(field){
 if(pasteOptions.has(field)||field.readOnly||field.name==='transcript'||field.id==='chat-text')return;
 const bar=document.createElement('div');bar.className='paste-options';
 bar.innerHTML='<label><input type="checkbox" checked> Clean PDF line breaks on paste</label><button type="button">Clean existing text</button><button type="button" hidden>Undo cleanup</button><small role="status"></small>';
 (field.closest('label')||field).insertAdjacentElement('afterend',bar);
 const [clean,undo]=bar.querySelectorAll('button'),status=bar.querySelector('small');
 const config={enabled:bar.querySelector('input'),raw:null,bar};pasteOptions.set(field,config);
 const apply=(raw,cleaned)=>{config.raw=raw;field.value=cleaned;field.dispatchEvent(new Event('input',{bubbles:true}));undo.hidden=false;status.textContent='Wrapped lines joined; paragraph breaks kept. Review before saving.';};
 clean.onclick=()=>{const raw=field.value,next=cleanPDFBreaks(raw);if(raw!==next)apply(raw,next);else status.textContent='No wrapped lines to join.';};
 undo.onclick=()=>{if(config.raw===null)return;field.value=config.raw;field.dispatchEvent(new Event('input',{bubbles:true}));undo.hidden=true;status.textContent='Original pasted formatting restored.';field.focus();};
 field.addEventListener('paste',e=>{
  if(!config.enabled.checked||!e.clipboardData)return;
  const raw=e.clipboardData.getData('text/plain'),next=cleanPDFBreaks(raw);if(raw===next)return;
  e.preventDefault();const start=field.selectionStart,end=field.selectionEnd;
  const original=field.value.slice(0,start)+raw+field.value.slice(end);
  field.setRangeText(next,start,end,'end');apply(original,field.value);
 });
}
document.addEventListener('focusin',e=>{if(e.target.matches('textarea'))setupPasteCleanup(e.target);});
