'use strict';
/* File pickers in the app's own words. A browser's built-in file button is labelled in the browser's language
   ("选择文件 / 未选择任何文件" in a Chinese Chrome), which pages cannot change, so every file input gets an
   English button and a line showing what was chosen. The real input stays in place (just invisible), so forms,
   required fields and change handlers work as before; dropping files onto the control works too. */
function enhanceFileInput(input){
 if(input.dataset.enhanced||input.closest('.img-pick'))return;input.dataset.enhanced='1';
 const none=input.multiple?'No files chosen':'No file chosen';
 const wrap=document.createElement('span');wrap.className='file-pick';
 const btn=document.createElement('button');btn.type='button';btn.className='file-pick-btn';btn.textContent=input.multiple?'Choose files…':'Choose a file…';
 const name=document.createElement('span');name.className='file-pick-name';name.textContent=none;
 input.classList.add('file-pick-input');input.tabIndex=-1;input.before(wrap);wrap.append(btn,name,input);
 btn.addEventListener('click',e=>{e.preventDefault();input.click();});
 input.addEventListener('change',()=>{const fs=[...input.files];name.textContent=!fs.length?none:fs.length===1?fs[0].name:`${fs.length} files: ${fs.map(f=>f.name).join(', ')}`;name.title=name.textContent;wrap.classList.toggle('chosen',fs.length>0);});
 wrap.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();wrap.classList.add('over');}});
 wrap.addEventListener('dragleave',()=>wrap.classList.remove('over'));
 wrap.addEventListener('drop',e=>{e.preventDefault();wrap.classList.remove('over');const fs=e.dataTransfer?.files;if(!fs?.length)return;const dt=new DataTransfer();for(const f of input.multiple?fs:[fs[0]])dt.items.add(f);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
}
function enhanceFileInputs(root=document){root.querySelectorAll?.('input[type=file]').forEach(enhanceFileInput);}
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1){if(n.matches('input[type=file]'))enhanceFileInput(n);else enhanceFileInputs(n);}}).observe(document.documentElement,{childList:true,subtree:true});
enhanceFileInputs();
