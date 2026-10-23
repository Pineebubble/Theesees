'use strict';
/* Pictures in discussion comments. They live in the browser's file storage (IndexedDB, next to PDFs), never in
   localStorage, and are not part of "Export records". Large pictures are scaled down before storing. */
async function putImage(id,blob){const db=await pdfDB();await new Promise((res,rej)=>{const tx=db.transaction('images','readwrite');tx.objectStore('images').put(blob,id);tx.oncomplete=res;tx.onerror=()=>rej(Error('Could not store the picture. Browser storage may be full.'));});}
async function getImage(id){const db=await pdfDB();return new Promise(res=>{const r=db.transaction('images').objectStore('images').get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null);});}
async function deleteImages(ids){if(!ids?.length)return;try{const db=await pdfDB();await new Promise(res=>{const tx=db.transaction('images','readwrite');for(const id of ids)tx.objectStore('images').delete(id);tx.oncomplete=tx.onerror=res;});}catch{/* removed on a later cleanup */}}
// Longest side at most 2000px; screenshots stay sharp as WebP. GIFs (animation) and SVGs are kept as they are.
async function prepareImage(file){
 if(!/^image\//.test(file.type))throw Error(`“${file.name}” is not a picture.`);
 if(file.size>25*1024*1024)throw Error(`“${file.name}” is over 25 MB.`);
 if(/gif|svg/.test(file.type))return file;
 const bmp=await createImageBitmap(file).catch(()=>null);if(!bmp)return file;
 const scale=Math.min(1,2000/Math.max(bmp.width,bmp.height));
 if(scale===1&&file.size<1.5*1024*1024){bmp.close();return file;}
 const c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close();
 const blob=await new Promise(r=>c.toBlob(r,'image/webp',0.9))||await new Promise(r=>c.toBlob(r,'image/jpeg',0.9));
 return blob&&blob.size<file.size?blob:file;
}
const imageURLs=new Map();
function imageURL(id){if(!imageURLs.has(id))imageURLs.set(id,getImage(id).then(b=>b?URL.createObjectURL(b):''));return imageURLs.get(id);}
function hydrateImages(root=document){
 for(const img of root.querySelectorAll('img[data-img-id]:not([data-loading])')){
  img.dataset.loading='1';imageURL(img.dataset.imgId).then(u=>{if(u)img.src=u;else img.closest('.msg-img,.img-thumb')?.classList.add('missing');});
 }
}
let imagesQueued=false;
new MutationObserver(()=>{if(imagesQueued)return;imagesQueued=true;requestAnimationFrame(()=>{imagesQueued=false;hydrateImages();});}).observe(document.body,{childList:true,subtree:true});

/* Full-size viewer. */
const lightbox=document.createElement('dialog');lightbox.className='lightbox';
lightbox.innerHTML='<img alt=""><div class="lightbox-bar"><a download>Download</a><button type="button" aria-label="Close">×</button></div>';
document.body.append(lightbox);
lightbox.addEventListener('click',e=>{if(e.target===lightbox||e.target.closest('.lightbox-bar button'))lightbox.close();});
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-view-img]');if(!b)return;
 const u=await imageURL(b.dataset.viewImg);if(!u)return toast('This picture is missing from this browser.');
 const img=lightbox.querySelector('img');img.src=u;img.alt=b.querySelector('img')?.alt||'';
 const a=lightbox.querySelector('a');a.href=u;a.download=img.alt||'picture';lightbox.showModal();
});

/* The comment form: add by button, paste or drop; existing pictures can be removed. */
function imageAttachHTML(){return '<div class="img-attach"><div class="img-pending"></div><label class="img-pick">＋ Add pictures<input type="file" accept="image/*" multiple></label><small>or paste / drop them into the comment box</small></div>';}
function bindImageAttach(form,existing){
 const items=existing.map(im=>({...im,kept:true})),removed=[],created=[],box=form.querySelector('.img-pending');
 const render=()=>{
  box.innerHTML=items.map((it,i)=>`<span class="img-thumb">${it.kept?`<img data-img-id="${esc(it.id)}" alt="${esc(it.name||'')}">`:`<img src="${it.url}" alt="${esc(it.file.name)}">`}<button type="button" data-unpick="${i}" aria-label="Remove picture">×</button></span>`).join('');
  hydrateImages(box);
 };
 const add=files=>{for(const file of files)if(/^image\//.test(file.type))items.push({file,url:URL.createObjectURL(file)});render();};
 form.querySelector('.img-pick input').onchange=e=>{add([...e.target.files]);e.target.value='';};
 box.onclick=e=>{const b=e.target.closest('[data-unpick]');if(!b)return;const [it]=items.splice(Number(b.dataset.unpick),1);if(it.kept)removed.push(it.id);else URL.revokeObjectURL(it.url);render();};
 const area=form.querySelector('textarea[name="body"]');
 area.addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])].filter(f=>/^image\//.test(f.type));if(files.length){add(files);if(!e.clipboardData.getData('text/plain'))e.preventDefault();}});
 form.addEventListener('dragover',e=>{if([...(e.dataTransfer?.items||[])].some(i=>i.kind==='file')){e.preventDefault();form.classList.add('drop-on');}});
 form.addEventListener('dragleave',e=>{if(!form.contains(e.relatedTarget))form.classList.remove('drop-on');});
 form.addEventListener('drop',e=>{const files=[...(e.dataTransfer?.files||[])].filter(f=>/^image\//.test(f.type));form.classList.remove('drop-on');if(files.length){e.preventDefault();add(files);}});
 render();
 return {
  count:()=>items.length,
  dirty:()=>removed.length>0||items.some(it=>!it.kept),
  async save(){const out=[];for(const it of items){if(it.kept){out.push({id:it.id,name:it.name,type:it.type});continue;}const blob=await prepareImage(it.file),id=uid();await putImage(id,blob);created.push(id);out.push({id,name:it.file.name,type:blob.type});}return out;},
  rollback(){deleteImages(created);},
  finalize(){deleteImages(removed);items.forEach(it=>it.url&&URL.revokeObjectURL(it.url));}
 };
}
