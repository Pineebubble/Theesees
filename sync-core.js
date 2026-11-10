'use strict';
/* Sync folder: the rules, without any browser or folder access (tested in Node by sync-check.cjs).
   The folder holds theesees-workspace.json (records + list of files), PDFs/<id>.pdf and Pictures/<id>.<ext>.
   Laptops' clocks may differ, so the folder's version is recognised by its stamp (when + which browser saved
   it), never by comparing times from different computers; this browser's own changes are compared with its
   own clock. */
const SYNC_FILE='theesees-workspace.json';
/* folderStamp: stamp in the folder now (null if the folder has no workspace yet)
   seenStamp: the folder stamp this browser last loaded or wrote (null if never synced)
   changedAt / syncedAt: this browser's last change and last sync, on its own clock (ISO strings or null)
   ownStamp: the stamp of this browser's last write to the folder, if nothing has been loaded since
   folderHistory: stamps the folder's version was built on (each write lists the versions before it)
   Sync apps copy whole files, so another laptop that never received our last write can overwrite it. Then our
   write is missing from the folder's history: that is a conflict too, even with no new changes here.
   Returns 'push' (write this browser's work to the folder), 'load' (replace this browser's work with the
   folder's), 'conflict' (both changed: ask), or 'idle'. */
function syncDecide({folderStamp,seenStamp,changedAt,syncedAt,localHasContent,ownStamp=null,folderHistory=[]}){
 if(!folderStamp)return 'push';
 const folderChanged=folderStamp!==seenStamp;
 const localChanged=!!changedAt&&(!syncedAt||changedAt>syncedAt);
 const ourWriteLost=!!ownStamp&&folderStamp!==ownStamp&&!folderHistory.includes(ownStamp);
 if(folderChanged&&(localChanged||ourWriteLost))return localHasContent?'conflict':'load';
 if(folderChanged)return 'load';
 if(localChanged)return 'push';
 return 'idle';
}
// Which files to write and remove so the folder matches this browser. local: [{key,size,type,store}],
// folder: Map(path → size); known: paths listed in the version this write is based on. Only those can be
// removed: a file another laptop added that this browser hasn't seen yet is left alone. Paths are made from
// ids, so renaming a paper never renames its PDF.
const syncExt=type=>({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','application/pdf':'pdf'}[type]||'bin');
const syncSafeId=k=>String(k).replace(/[^\w.-]/g,'_');
function syncPath(store,key,type){return store==='pdfs'?`PDFs/${syncSafeId(key)}.pdf`:`Pictures/${syncSafeId(key)}.${syncExt(type)}`;}
function syncPlanFiles(local,folder,known=new Set()){
 const want=new Map(local.map(f=>[syncPath(f.store,f.key,f.type),f]));
 const write=[...want].filter(([p,f])=>folder.get(p)!==f.size).map(([p,f])=>({...f,path:p}));
 const remove=[...folder.keys()].filter(p=>/^(PDFs|Pictures)\//.test(p)&&!want.has(p)&&known.has(p));
 return {write,remove};
}
const syncKnownPaths=rec=>new Set(Object.values(rec?.files||{}).flatMap(m=>Object.values(m).map(f=>f.path)));
// The workspace file: records plus what each file is, so another browser can rebuild its storage.
function syncRecord(records,local,{device,label},previous=null){
 const savedAt=new Date().toISOString(),files={pdfs:{},images:{}};
 for(const f of local)files[f.store][f.key]={path:syncPath(f.store,f.key,f.type),name:f.name||'',type:f.type||'',size:f.size};
 const history=previous?[...(previous.history||[]),previous.stamp].slice(-200):[];
 return {format:'theesees-sync',version:1,savedAt,savedBy:device,savedByLabel:label,stamp:`${savedAt}|${device}`,history,files,data:records};
}

if(typeof module!=='undefined')module.exports={syncDecide,syncPlanFiles,syncRecord,syncPath,syncKnownPaths,SYNC_FILE};
