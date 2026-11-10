'use strict';
/* Sync folder: keeps this browser's workspace in a folder you choose (in Dropbox, Google Drive, OneDrive, a USB
   stick…), so your laptops can share it. The rules are in sync-core.js. Changes are written a few seconds after
   you make them; on opening Theesees (and when you come back to the tab) newer work in the folder is loaded.
   If both sides changed, you choose which to keep, and the other is kept as a safety copy.
   Needs the File System Access API (Chrome or Edge on a computer). The folder is remembered in IndexedDB. */
let syncDir=null,syncState='off',syncError='',syncTimer=null,syncRunning=null,syncLastCheck=0;
const syncDeviceId=(()=>{let id=bkGet('device');if(!id){id=uid().slice(0,8);bkSet('device',id);}return id;})();
const syncLabel=()=>`${/Mac/.test(navigator.platform)?'Mac':/Win/.test(navigator.platform)?'Windows PC':'computer'} (${syncDeviceId})`;
const syncSupported=()=>typeof window.showDirectoryPicker==='function';

async function syncMeta(key,value){
 const db=await pdfDB();if(!db.objectStoreNames.contains('meta'))return null;
 return new Promise((res,rej)=>{const tx=db.transaction('meta',value===undefined?'readonly':'readwrite'),s=tx.objectStore('meta');
  if(value===undefined){const r=s.get(key);r.onsuccess=()=>res(r.result??null);r.onerror=()=>res(null);}
  else{if(value===null)s.delete(key);else s.put(value,key);tx.oncomplete=()=>res(value);tx.onerror=()=>rej(tx.error);}});
}
// --- Folder access ---
async function syncSubdir(dir,name,create){try{return await dir.getDirectoryHandle(name,{create});}catch(e){if(create)throw e;return null;}}
async function syncReadFile(dir,path){let d=dir;const parts=path.split('/');for(const p of parts.slice(0,-1)){d=await syncSubdir(d,p,false);if(!d)return null;}try{return await (await d.getFileHandle(parts.at(-1))).getFile();}catch{return null;}}
async function syncWriteFile(dir,path,blob){let d=dir;const parts=path.split('/');for(const p of parts.slice(0,-1))d=await syncSubdir(d,p,true);const w=await (await d.getFileHandle(parts.at(-1),{create:true})).createWritable();await w.write(blob);await w.close();}
async function syncRemoveFile(dir,path){const parts=path.split('/'),d=parts.length>1?await syncSubdir(dir,parts[0],false):dir;try{await d?.removeEntry(parts.at(-1));}catch{}}
async function syncListFiles(dir){const out=new Map();for(const sub of ['PDFs','Pictures']){const d=await syncSubdir(dir,sub,false);if(!d)continue;for await(const [name,h] of d.entries())if(h.kind==='file')out.set(`${sub}/${name}`,(await h.getFile()).size);}return out;}
async function syncReadRecord(dir){const f=await syncReadFile(dir,SYNC_FILE);if(!f)return null;const r=JSON.parse(await f.text());if(r?.format!=='theesees-sync'||!r.data)throw Error('The workspace file in this folder is not from Theesees.');return r;}
async function syncLocalFiles(){const out=[];for(const store of ['pdfs','images'])for(const {key,blob} of await bkAll(store))out.push({store,key,blob,size:blob.size,type:blob.type||(store==='pdfs'?'application/pdf':''),name:blob.name||''});return out;}

// --- Writing this browser's work to the folder ---
async function syncPush(previous){
 const started=new Date().toISOString(); // changes made while writing count as unsynced
 const local=await syncLocalFiles(),plan=syncPlanFiles(local,await syncListFiles(syncDir),syncKnownPaths(previous));
 for(const f of plan.write)await syncWriteFile(syncDir,f.path,f.blob);
 const rec=syncRecord(data,local,{device:syncDeviceId,label:syncLabel()},previous);
 await syncWriteFile(syncDir,SYNC_FILE,new Blob([JSON.stringify(rec)],{type:'application/json'}));
 for(const p of plan.remove)await syncRemoveFile(syncDir,p);
 bkSet('sync-seen',rec.stamp);bkSet('sync-own',rec.stamp);bkSet('sync-at',started);bkSet('sync-saved',rec.savedAt);
 if((bkGet('changed-at')||'')>started)syncSoon(); // something changed while writing: go again
}
// --- Replacing this browser's work with the folder's ---
async function syncLoad(rec){
 const db=await pdfDB(),have=new Map((await syncLocalFiles()).map(f=>[f.store+'\u0000'+f.key,f.size]));
 for(const store of ['pdfs','images']){
  const meta=rec.files?.[store]||{},puts=[];
  for(const [key,m] of Object.entries(meta)){if(have.get(store+'\u0000'+key)===m.size)continue;const f=await syncReadFile(syncDir,m.path);if(f)puts.push([key,store==='pdfs'?new File([f],m.name||'document.pdf',{type:m.type||'application/pdf'}):new Blob([f],{type:m.type||''})]);}
  await new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store);
   for(const [key] of have)if(key.startsWith(store+'\u0000')&&!meta[key.slice(store.length+1)])s.delete(key.slice(store.length+1));
   for(const [key,v] of puts)s.put(v,key);tx.oncomplete=res;tx.onerror=tx.onabort=()=>rej(tx.error||Error('Browser storage refused the files.'));});
 }
 localStorage.setItem(storageKey,JSON.stringify(rec.data));
 bkSet('sync-seen',rec.stamp);bkSet('sync-own','');bkSet('sync-at',new Date().toISOString());bkSet('sync-saved',rec.savedAt);bkSet('changed-at','');
 try{sessionStorage.setItem('theesees-sync-loaded',`${rec.savedByLabel||'another browser'}|${rec.savedAt}`);}catch{}
 location.reload();
}

// --- Checking and acting ---
function syncSoon(){if(syncState!=='on')return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow('change'),2500);}
function syncNow(reason){return syncRunning||=(async()=>{
 try{
  if(!syncDir)return;
  const rec=await syncReadRecord(syncDir);syncLastCheck=Date.now();
  const action=syncDecide({folderStamp:rec?.stamp||null,seenStamp:bkGet('sync-seen'),changedAt:bkGet('changed-at')||null,syncedAt:bkGet('sync-at'),localHasContent:bkHasContent(data),ownStamp:bkGet('sync-own')||null,folderHistory:rec?.history||[]});
  if(action==='push')await syncPush(rec);
  else if(action==='load'){toast(`Loading newer work from the sync folder (saved ${new Date(rec.savedAt).toLocaleString()})…`,8000);await syncLoad(rec);}
  else if(action==='conflict')syncConflict(rec);
  syncState='on';syncError='';
 }catch(e){syncState='error';syncError=e.message||String(e);if(reason!=='focus')toast('Sync folder: '+syncError,8000);}
 finally{syncRunning=null;counts();if($('#sync-section'))syncRefreshSection();}
})();}
function syncConflict(rec){
 const cnt=d=>`${plural(d.papers.length,'paper')}, ${plural(d.passages.length,'passage')}, ${plural(d.threads.length,'discussion')}, ${plural((d.claims||[]).length,'thought')}`;
 modal('Both laptops have new work',`<p>Since the last sync, work was changed both here and in the sync folder. Choose which to keep. The other is saved as a safety copy, so nothing is lost.</p>
  <div class="sync-choice"><button class="primary" id="sync-take-folder"><strong>Use the folder’s version</strong><span>Saved ${esc(new Date(rec.savedAt).toLocaleString())} by ${esc(rec.savedBy===syncDeviceId?'this browser':rec.savedByLabel||'another browser')} · ${cnt(rec.data)}</span><small>This browser’s work is downloaded as a backup first.</small></button>
  <button id="sync-keep-local"><strong>Keep this browser’s version</strong><span>${cnt(data)}</span><small>The folder’s version is kept in its “Conflicts” folder.</small></button></div>`);
 $('#sync-take-folder').onclick=async e=>{e.currentTarget.disabled=true;const b=await buildBackup();bkSave(b.blob,b.name.replace('theesees-backup','theesees-before-sync'));await new Promise(r=>setTimeout(r,1500));closeModal();await syncLoad(rec);};
 $('#sync-keep-local').onclick=async e=>{e.currentTarget.disabled=true;try{await syncWriteFile(syncDir,`Conflicts/theesees-workspace ${rec.savedAt.replace(/[:.]/g,'-')} ${rec.savedBy}.json`,new Blob([JSON.stringify(rec)],{type:'application/json'}));await syncPush(rec);closeModal();toast('Kept this browser’s version; the folder’s version is in its Conflicts folder.');}catch(err){toast('Sync folder: '+(err.message||err));}counts();};
}

// --- Connecting ---
async function syncConnect(){
 if(!syncSupported()){toast('Sync folders need Chrome or Edge on a computer.');return;}
 let dir;try{dir=await window.showDirectoryPicker({id:'theesees-sync',mode:'readwrite'});}catch{return;} // cancelled
 if(await dir.queryPermission({mode:'readwrite'})!=='granted'&&await dir.requestPermission({mode:'readwrite'})!=='granted'){toast('Theesees needs permission to save in that folder.');return;}
 syncDir=dir;await syncMeta('sync-folder',dir);bkSet('sync-seen','');bkSet('sync-own','');bkSet('sync-at','');syncState='on';
 const rec=await syncReadRecord(dir).catch(e=>{toast(e.message);return undefined;});if(rec===undefined)return syncDisconnect(true);
 if(!rec)toast(`Connected “${dir.name}”. Saving your workspace there…`);
 await syncNow('connect');if(syncState==='on'&&!rec)toast(`Your workspace is now saved in “${dir.name}” and kept up to date.`);
}
async function syncReconnect(){
 if(!syncDir)return;
 if(await syncDir.requestPermission({mode:'readwrite'})==='granted'){syncState='on';await syncNow('reconnect');}else toast('Theesees still needs permission for the sync folder.');
}
async function syncDisconnect(quiet){syncDir=null;syncState='off';await syncMeta('sync-folder',null);if(!quiet)toast('Sync folder disconnected. The folder and its files are untouched.');counts();if($('#sync-section'))syncRefreshSection();}
// On opening Theesees: reconnect to the remembered folder if the browser still allows it.
(async()=>{
 try{const s=sessionStorage.getItem('theesees-sync-loaded');if(s){sessionStorage.removeItem('theesees-sync-loaded');const [who,at]=s.split('|');setTimeout(()=>toast(`Loaded the latest work from the sync folder (saved by ${who}, ${new Date(at).toLocaleString()}).`,7000),400);}}catch{}
 if(!syncSupported())return;
 const dir=await syncMeta('sync-folder').catch(()=>null);if(!dir)return;syncDir=dir;
 const perm=await dir.queryPermission({mode:'readwrite'}).catch(()=>'denied');
 if(perm==='granted'){syncState='on';syncNow('startup');}else{syncState='needs-permission';counts();}
})();
// Coming back to the tab (perhaps after working on the other laptop): look for newer work.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&syncState==='on'&&Date.now()-syncLastCheck>20000)syncNow('focus');});

// --- What you see ---
function syncHealthy(){return syncState==='on'&&!!bkGet('sync-at');}
function syncBadge(){
 if(syncState==='needs-permission')return '<button data-sync-reconnect class="needs" title="The browser needs your OK again to use the sync folder">Reconnect sync folder</button>';
 if(syncState==='error')return `<button data-backup class="needs" title="${esc(syncError)}">Sync folder problem</button>`;
 if(syncHealthy())return `<span title="Saved in the sync folder “${esc(syncDir?.name||'')}”">synced ${esc(bkAgo(bkGet('sync-at'))||'')}</span>`;
 return '';
}
function syncSectionHTML(){return '<section id="sync-section"></section>';}
function syncRefreshSection(){
 const el=$('#sync-section');if(!el)return;
 const at=bkGet('sync-at');
 el.innerHTML=`<h3>Sync folder</h3>${!syncSupported()?'<p>Keeping your workspace in a shared folder needs Chrome or Edge on a computer.</p>':syncDir?`<p>Saving to <strong>${esc(syncDir.name)}</strong>${syncState==='needs-permission'?'. The browser needs your OK again before it can use the folder.':syncState==='error'?`: <span class="restore-error">${esc(syncError)}</span>`:at?` · last synced ${esc(new Date(at).toLocaleString())}.`:'.'}</p>
  <p class="help">Changes are saved there a few seconds after you make them. On your other laptop, choose the same folder (after your sync app has copied it) to work on the same workspace. If both laptops change things before syncing, Theesees asks which to keep.</p>
  <div class="actions">${syncState==='needs-permission'?'<button class="primary" data-sync-reconnect>Reconnect</button>':'<button id="sync-now">Sync now</button>'}<button class="link" id="sync-disconnect">Disconnect</button></div>`
  :`<p>Keep your workspace in a folder that your laptops share, such as one in Dropbox, Google Drive or OneDrive (or a USB stick you carry). Theesees saves there as you work and loads newer work when you open it on the other laptop.</p><div class="actions"><button class="primary" id="sync-connect">Choose a folder…</button></div><p class="help">Make an empty folder named “Theesees” in your sync app’s folder and choose it. Everything stays on your computers and that service; nothing goes to GitHub.</p>`}`;
 $('#sync-connect')?.addEventListener('click',syncConnect);$('#sync-now')?.addEventListener('click',()=>syncNow('button'));$('#sync-disconnect')?.addEventListener('click',()=>syncDisconnect());
}
document.addEventListener('click',e=>{if(e.target.closest('[data-sync-reconnect]'))syncReconnect();});
