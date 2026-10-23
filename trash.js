const trashLifetime=30*24*60*60*1000;
function deletedCommentThreads(){return [...data.threads,...data.trash.filter(e=>e.type==='thread').map(e=>e.item)];}
function maintainTrash(now=Date.now()){
 if(storageProblem)return;
 const before=structuredClone(data);let changed=false;const goneImages=[];
 // Existing deletions get a fresh 30-day window when this policy is introduced.
 if(!data.trashPolicyStarted){data.trashPolicyStarted=new Date(now).toISOString();for(const e of data.trash)e.expiresAt=now+trashLifetime;changed=true;}
 for(const e of data.trash){if(!e.expiresAt){e.expiresAt=(Date.parse(e.at)||now)+trashLifetime;changed=true;}}
 for(const t of deletedCommentThreads())for(const b of t.blocks||[]){
  if(!b.deleted||b.expired)continue;
  if(!b.deletedAt){b.deletedAt=new Date(now).toISOString();changed=true;}
  if(now-Date.parse(b.deletedAt)>=trashLifetime){
   // Keep only routing IDs, so surviving replies do not lose their thread.
   const route={id:b.id,parentId:b.parentId,subthread:b.subthread,anchor:b.anchor? 'expired:'+b.id:null,deleted:true,expired:true};
   goneImages.push(...(b.images||[]).map(im=>im.id));
   Object.keys(b).forEach(k=>delete b[k]);Object.assign(b,route);changed=true;
  }
 }
 const expired=data.trash.filter(e=>e.expiresAt<=now);
 // Pictures of discussions leaving Trash go with them.
 for(const e of expired)if(e.type==='thread')for(const b of e.item.blocks||[])goneImages.push(...(b.images||[]).map(im=>im.id));
 if(expired.length){data.pendingPDFDeletes=[...new Set([...(data.pendingPDFDeletes||[]),...expired.filter(e=>e.type==='paper'&&e.item.pdfName).map(e=>e.item.id)])];data.trash=data.trash.filter(e=>e.expiresAt>now);changed=true;}
 if(changed&&!save()){data=before;return;}
 if(goneImages.length&&typeof deleteImages==='function')deleteImages(goneImages);
 flushExpiredPDFs();
}
async function flushExpiredPDFs(){
 if(sandbox||!data.pendingPDFDeletes?.length)return;
 for(const id of [...data.pendingPDFDeletes]){if(data.papers.some(p=>p.id===id))continue;try{const db=await pdfDB();await new Promise((resolve,reject)=>{const tx=db.transaction('pdfs','readwrite');tx.objectStore('pdfs').delete(id);tx.oncomplete=resolve;tx.onerror=reject;});data.pendingPDFDeletes=data.pendingPDFDeletes.filter(x=>x!==id);save();}catch{/* Retry at the next cleanup. */}}
}
function trashDays(expiry){return Math.max(0,Math.ceil((expiry-Date.now())/86400000));}
showTrash=function(){
 maintainTrash();
 const entries=data.trash.map(e=>`<article class="trash-row"><div><small>${esc(e.type)} · ${trashDays(e.expiresAt)} days left</small><h3>${esc(e.item.title||e.item.quote||e.item.text)}</h3></div><button data-restore="${esc(e.id)}">Restore</button></article>`).join('');
 const comments=deletedCommentThreads().map(t=>(t.blocks||[]).filter(b=>b.deleted&&!b.expired).map(b=>`<article class="trash-row"><div><small>Comment · ${esc(t.title)} · ${trashDays(Date.parse(b.deletedAt)+trashLifetime)} days left</small><p>${esc(b.text)}</p></div><button data-restore-comment="${esc(b.id)}" data-comment-thread="${esc(t.id)}">Restore</button></article>`).join('')).join('');
 modal('Trash',`<p>Deleted items are kept for 30 days, then permanently removed when this prototype is open. Restore them here before the countdown ends. Surviving replies are kept.</p><div class="trash-list">${entries+comments||'<p class="help">Trash is empty.</p>'}</div>`);
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-restore-comment]');if(!el)return;const t=deletedCommentThreads().find(t=>t.id===el.dataset.commentThread),b=t?.blocks.find(b=>b.id===el.dataset.restoreComment);if(!b||b.expired)return;if(commitBlocks(t,()=>{b.deleted=false;delete b.deletedAt;})){render();showTrash();}});
maintainTrash();
setInterval(()=>maintainTrash(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)maintainTrash();});
