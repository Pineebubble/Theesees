'use strict';
/* Backup & restore. A backup is one .zip with everything in this browser: the records (papers, passages,
   discussions, thoughts, outline, drafts…), every attached PDF (named after its paper) and every picture in
   comments. Restoring replaces what is in this browser, after first downloading a safety backup of it.
   Also: asks the browser to keep Theesees's storage permanently, and nudges you when a backup is overdue. */
const BACKUP_DAYS=7;
const bkKey=k=>`theesees-${k}${typeof sandbox!=='undefined'&&sandbox?'-sandbox':''}`;
const bkGet=k=>{try{return localStorage.getItem(bkKey(k));}catch{return null;}};
const bkSet=(k,v)=>{try{localStorage.setItem(bkKey(k),v);}catch{}};
function markChanged(){bkSet('changed-at',new Date().toISOString());}
// Ask the browser not to clear this site's storage when space runs low (Chrome decides quietly; Firefox may ask).
const storageProtected=(async()=>{try{if(!navigator.storage?.persist)return null;return await navigator.storage.persisted()||await navigator.storage.persist();}catch{return null;}})();

async function bkAll(store){
 const db=await pdfDB();
 return new Promise((res,rej)=>{const out=[],r=db.transaction(store).objectStore(store).openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return res(out);out.push({key:String(c.key),blob:c.value});c.continue();};r.onerror=()=>rej(r.error);});
}
const bkSafe=s=>String(s||'').replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Untitled';
const bkExt=type=>({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'}[type]||'bin');
const bkStamp=d=>d.toISOString().slice(0,10);
const bkAgo=iso=>{if(!iso)return null;const days=Math.floor((Date.now()-Date.parse(iso))/864e5);return days<1?'today':days<2?'yesterday':`${days} days ago`;};
const bkSize=n=>n<1048576?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1048576).toFixed(n<10485760?1:0)} MB`;
const bkHasContent=d=>!!(d.papers.length||d.passages.length||d.threads.length||(d.claims||[]).length||(d.outline?.parts||[]).length);

async function buildBackup(){
 const enc=new TextEncoder(),[pdfs,images]=await Promise.all([bkAll('pdfs'),bkAll('images')]),created=new Date();
 const files=[],manifest={format:'theesees-backup',version:1,created:created.toISOString(),counts:{papers:data.papers.length,passages:data.passages.length,discussions:data.threads.length,thoughts:(data.claims||[]).length,pdfs:pdfs.length,pictures:images.length},pdfs:{},images:{}};
 const used=new Set();
 for(const {key,blob} of pdfs){
  const p=getPaper(key);let path=`PDFs/${bkSafe(p?.title||blob.name||'PDF')} (${key.slice(0,8)}).pdf`;
  while(used.has(path))path=path.replace(/\.pdf$/,' 2.pdf');used.add(path);
  manifest.pdfs[path]={key,name:blob.name||p?.pdfName||'document.pdf',type:blob.type||'application/pdf'};
  files.push({name:path,data:new Uint8Array(await blob.arrayBuffer())});
 }
 for(const {key,blob} of images){
  const path=`Pictures/${bkSafe(key)}.${bkExt(blob.type)}`;
  manifest.images[path]={key,type:blob.type||''};
  files.push({name:path,data:new Uint8Array(await blob.arrayBuffer())});
 }
 const readme=`Theesees backup, made ${created.toLocaleString()}.\n\nRestore it in Theesees: Backup & restore → Restore from a backup, and choose this .zip file.\n\nInside:\n- theesees/records.json: papers, passages, discussions, thoughts, outline and drafts\n- PDFs/: every attached PDF, named after its paper\n- Pictures/: pictures attached to comments\n`;
 return {blob:new Blob(zipCreate([{name:'README.txt',data:enc.encode(readme)},{name:'theesees/manifest.json',data:enc.encode(JSON.stringify(manifest,null,1))},{name:'theesees/records.json',data:enc.encode(JSON.stringify(data))},...files],created),{type:'application/zip'}),name:`theesees-backup-${bkStamp(created)}.zip`,manifest};
}
function bkSave(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function backupNow(button){
 if(button){button.disabled=true;button.textContent='Preparing backup…';}
 try{const {blob,name,manifest}=await buildBackup();bkSave(blob,name);bkSet('last-backup',new Date().toISOString());
  toast(`Backup downloaded: ${plural(manifest.counts.papers,'paper')}, ${plural(manifest.counts.pdfs,'PDF')}, ${plural(manifest.counts.pictures,'picture')} (${bkSize(blob.size)}). Keep it somewhere safe.`,7000);
  counts();if($('#backup-panel'))showBackup();
 }catch(e){toast('Couldn’t make the backup: '+(e.message||e));}
 finally{if(button?.isConnected){button.disabled=false;button.textContent='Back up now ↓';}}
}

async function showBackup(){
 const [prot,est]=await Promise.all([storageProtected,navigator.storage?.estimate?.().catch(()=>null)]);
 const last=bkAgo(bkGet('last-backup')),mb=est?.usage?bkSize(est.usage):null;
 modal('Backup & restore',`<div id="backup-panel" class="backup-panel">
  <section><h3>Back up</h3><p>One .zip file with everything in this browser: your records, every attached PDF and the pictures in comments. Keep it somewhere safe, such as a cloud drive or USB stick.</p>
   <p class="help">Last backup on this browser: <strong>${last||'never'}</strong>.${mb?` Theesees is using ${mb} here.`:''}</p>
   <div class="actions"><button class="primary" id="backup-now">Back up now ↓</button></div></section>
  <section><h3>Restore</h3><p>Open a backup .zip (or an older records-only .json export). You’ll see what it contains before anything changes.</p>
   <label class="backup-file">Choose a backup file<input type="file" id="restore-file" accept=".zip,.json,application/zip,application/json"></label><div id="restore-preview"></div></section>
  <section class="backup-status"><p>${prot===true?'✓ This browser keeps Theesees’s storage protected from automatic clearing.':prot===false?'This browser hasn’t agreed to protect Theesees’s storage, so it could clear it if space runs very low. Regular backups keep you safe.':'This browser can’t say whether it protects Theesees’s storage. Regular backups keep you safe.'} Clearing browsing data for this site deletes it regardless.</p>
   <p><button class="link" id="export-json">Download records only (.json, no PDFs)</button></p></section></div>`);
 $('#backup-now').onclick=e=>backupNow(e.currentTarget);
 $('#export-json').onclick=()=>{download('theesees-reading-records.json',{version:2,exportedAt:new Date().toISOString(),...data});toast('Exported records only. PDFs and pictures are not included; use Back up now for a full backup.');};
 $('#restore-file').onchange=e=>{const f=e.target.files[0];if(f)previewRestore(f);};
}

// Reads a backup without changing anything; returns what would be restored.
async function readBackup(file){
 const bytes=new Uint8Array(await file.arrayBuffer());
 const isJSON=/\.json$/i.test(file.name)||bytes[0]===0x7b;
 const asRecords=obj=>{const r={...obj};delete r.version;delete r.exportedAt;if(!['keywords','edges','papers','passages','threads'].every(k=>Array.isArray(r[k])))throw Error('This file doesn’t contain Theesees records.');return r;};
 if(isJSON){const obj=JSON.parse(new TextDecoder().decode(bytes));return {records:asRecords(obj),created:obj.exportedAt||null,pdfs:[],images:[],recordsOnly:true};}
 const zip=await zipRead(bytes),get=n=>zip.get(n);
 if(!get('theesees/records.json'))throw Error('This .zip isn’t a Theesees backup (it has no theesees/records.json).');
 const manifest=get('theesees/manifest.json')?JSON.parse(new TextDecoder().decode(get('theesees/manifest.json'))):{pdfs:{},images:{}};
 const records=asRecords(JSON.parse(new TextDecoder().decode(get('theesees/records.json'))));
 const pdfs=Object.entries(manifest.pdfs||{}).filter(([path])=>zip.has(path)).map(([path,m])=>({key:m.key,file:new File([zip.get(path)],m.name||'document.pdf',{type:m.type||'application/pdf'})}));
 const images=Object.entries(manifest.images||{}).filter(([path])=>zip.has(path)).map(([path,m])=>({key:m.key,file:new Blob([zip.get(path)],{type:m.type||''})}));
 return {records,created:manifest.created||null,pdfs,images,recordsOnly:false};
}
async function previewRestore(file){
 const box=$('#restore-preview');box.innerHTML='<p class="help">Reading the backup…</p>';
 let b;try{b=await readBackup(file);}catch(e){box.innerHTML=`<p class="restore-error">${esc(e.message||String(e))}</p>`;return;}
 const row=(label,now,then)=>`<tr><th>${label}</th><td>${now}</td><td>${then}</td></tr>`,r=b.records;
 const pdfNow=(await bkAll('pdfs')).length,imgNow=(await bkAll('images')).length;
 box.innerHTML=`<p><strong>${esc(file.name)}</strong>${b.created?` · made ${esc(new Date(b.created).toLocaleString())}`:''}</p>
  <table class="restore-table"><thead><tr><th></th><th>In this browser now</th><th>In the backup</th></tr></thead><tbody>
  ${row('Papers',data.papers.length,r.papers.length)}${row('Passages',data.passages.length,r.passages.length)}${row('Discussions',data.threads.length,r.threads.length)}${row('Thoughts',(data.claims||[]).length,(r.claims||[]).length)}${row('Outline parts',(data.outline?.parts||[]).length,(r.outline?.parts||[]).length)}
  ${b.recordsOnly?row('PDFs',pdfNow,'kept as they are'):row('PDFs',pdfNow,b.pdfs.length)}${b.recordsOnly?row('Pictures',imgNow,'kept as they are'):row('Pictures',imgNow,b.images.length)}</tbody></table>
  <p class="restore-warning">Restoring <strong>replaces</strong> everything in this browser with the backup${b.recordsOnly?' (records only: PDFs and pictures already here are kept)':''}. ${bkHasContent(data)?'A safety backup of what’s here now is downloaded first, so you can go back.':''}</p>
  <div class="actions"><button class="primary" id="restore-go">Restore this backup</button></div>`;
 $('#restore-go').onclick=e=>restoreBackup(b,e.currentTarget);
}
async function restoreBackup(b,button){
 button.disabled=true;button.textContent='Restoring…';
 try{
  // The safety copy must finish downloading before the page reloads, so give the download time to start.
  if(bkHasContent(data)){button.textContent='Saving a safety backup first…';const safety=await buildBackup();bkSave(safety.blob,safety.name.replace('theesees-backup','theesees-before-restore'));await new Promise(r=>setTimeout(r,1500+safety.blob.size/(50*1048576)*1000));}
  if(!b.recordsOnly){
   const db=await pdfDB();
   for(const [store,items] of [['pdfs',b.pdfs],['images',b.images]])await new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store);s.clear();for(const it of items)s.put(it.file,it.key);tx.oncomplete=res;tx.onerror=tx.onabort=()=>rej(tx.error||Error('Browser storage refused the files.'));});
  }
  localStorage.setItem(storageKey,JSON.stringify(b.records));
  bkSet('last-backup',b.created||new Date().toISOString());bkSet('changed-at','');
  try{sessionStorage.setItem('theesees-restored','1');}catch{}
  location.reload();
 }catch(e){button.disabled=false;button.textContent='Restore this backup';toast('Restore failed, nothing was replaced in your records: '+(e.message||e),8000);}
}
// Shown in the overview line when there is work and no recent backup.
function backupNudge(){
 if(!bkHasContent(data))return '';
 const last=bkGet('last-backup'),changed=bkGet('changed-at'),days=last?(Date.now()-Date.parse(last))/864e5:Infinity;
 if(last&&(days<BACKUP_DAYS||!changed||Date.parse(changed)<=Date.parse(last)))return '';
 return `<button data-backup class="needs" title="Download a full backup: records, PDFs and pictures">${last?`Back up · last ${bkAgo(last)}`:'Not backed up yet · Back up'}</button>`;
}
document.addEventListener('click',e=>{if(e.target.closest('[data-backup],#backup'))showBackup();});
try{if(sessionStorage.getItem('theesees-restored')){sessionStorage.removeItem('theesees-restored');setTimeout(()=>toast('Backup restored.'),300);}}catch{}
