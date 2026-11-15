'use strict';
/* Sync from Zotero (in "Zotero / import"): read and annotate in Zotero, think and write here. A highlight
   becomes a passage; your comment on it becomes a discussion linked to that passage; a note with no quoted
   text becomes a discussion under the paper. The rules are in zotero-core.js. It asks Zotero through the
   Theesees app on this computer (theesees-server.py → /_zotero/items), so it is offered only when Theesees
   is opened that way, and Zotero must be open with "Allow other applications on this computer to
   communicate with Zotero" ticked. You see what would change before anything does. */
const zoteroAvailable=()=>typeof syncOnServer==='function'&&syncOnServer();
const zoteroProblems={'not-running':'Zotero is not open. Open Zotero on this laptop and try again.','not-enabled':'Zotero is not allowing other apps yet. In Zotero, open Settings → Advanced and tick “Allow other applications on this computer to communicate with Zotero”, then try again.','zotero':'Zotero answered with an error. Restart Zotero and try again.'};
async function zoteroFetch(query){
 let r;try{r=await fetch('_zotero/items?'+query,{cache:'no-store'});}catch{throw Error('The Theesees app on this laptop is not answering. Open Theesees from its icon again.');}
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(zoteroProblems[body.error]||'Zotero could not be read.');
 return body;
}
async function zoteroAnnotations(){const out=[];for(;;){const b=await zoteroFetch('start='+out.length);out.push(...b.items);if(!b.items.length||out.length>=b.total)return out;}}
// Zotero may return related items too, so keep only the ones asked for.
async function zoteroByKeys(keys){const want=new Set(keys.filter(Boolean)),out=new Map(),list=[...want];for(let i=0;i<list.length;i+=50)for(const item of (await zoteroFetch('itemKey='+list.slice(i,i+50).join(','))).items)if(want.has(item.key))out.set(item.key,item);return [...out.values()];}
async function zoteroRead(){
 const annotations=(await zoteroAnnotations()).filter(a=>a.data?.itemType==='annotation');
 const attachments=await zoteroByKeys(annotations.map(a=>a.data.parentItem));
 return {annotations,attachments,tops:await zoteroByKeys(attachments.map(a=>a.data.parentItem))};
}
function zoteroSummary(plan){
 const s=plan.skipped,papers=new Set([...plan.passages.map(h=>h.paperId),...plan.threads.flatMap(t=>t.paperIds)]).size,changed=plan.updates.length+plan.threadUpdates.filter(u=>!plan.updates.length).length;
 const fresh=[plan.passages.length&&`<strong>${plural(plan.passages.length,'new passage')}</strong>`,plan.threads.length&&`<strong>${plural(plan.threads.length,'new discussion')}</strong> from your comments`].filter(Boolean),parts=[];
 if(fresh.length)parts.push(`${fresh.join(' and ')}${papers?` on ${plural(papers,'paper')}`:''}${plan.papers.length?` (${plan.papers.length===1&&papers===1?'new to Theesees':`${plan.papers.length} new to Theesees`})`:''}`);
 if(changed)parts.push(`${plural(changed,'annotation')} changed in Zotero to update`);
 if(plan.link.length&&!fresh.length)parts.push(`${plural(plan.link.length,'paper')} to link to Zotero`);
 const notes=[plan.upToDate&&`${plural(plan.upToDate,'annotation')} already here`,s.empty&&`${plural(s.empty,'drawing or empty note')} left out`,s.removedHere&&`${plural(s.removedHere,'annotation')} you deleted here left out`,s.noPaper&&`${plural(s.noPaper,'annotation')} whose PDF is in Zotero’s trash left out`].filter(Boolean);
 return {text:parts.join('; '),notes:notes.join(' · ')};
}
async function zoteroSync(button){
 const status=$('#zotero-status'),say=html=>{if(status?.isConnected)status.innerHTML=html;};
 button.disabled=true;say('Reading your Zotero library…');
 try{
  const plan=zoteroPlan(await zoteroRead(),data,uid),sum=zoteroSummary(plan);
  if(zoteroPlanEmpty(plan)){say(`Nothing new in Zotero.${sum.notes?` <span class="help">${sum.notes}.</span>`:''}`);return;}
  say(`Found ${sum.text}.${sum.notes?`<br><span class="help">${sum.notes}.</span>`:''}<br><button type="button" class="primary" id="zotero-apply">Bring them in</button>`);
  $('#zotero-apply').onclick=()=>{
   const before=structuredClone(data);
   zoteroApply(plan,data);if(!save()){data=before;return;} // browser storage refused: leave everything as it was
   closeModal();if(page==='reader'&&typeof renderPassages==='function')renderPassages();else navigate('library');
   toast(`From Zotero: ${[plan.passages.length&&plural(plan.passages.length,'passage')+' added',plan.threads.length&&plural(plan.threads.length,'discussion')+' added',(plan.updates.length||plan.threadUpdates.length)&&'changes updated',plan.papers.length&&plural(plan.papers.length,'paper')+' added'].filter(Boolean).join(', ')||'papers linked'}.`,6000);
  };
 }catch(e){say(`<span class="restore-error">${esc(e.message||String(e))}</span>`);}
 finally{if(button.isConnected)button.disabled=false;}
}
// The top of the "Zotero / import" dialog.
function zoteroSyncHTML(){
 return zoteroAvailable()?`<section class="zotero-sync"><h3>Sync highlights from Zotero</h3><p>Read and annotate in Zotero. Each highlight or underline arrives here as a passage under its paper; a comment you wrote on it becomes a discussion linked to that passage; a note with no quoted text becomes a discussion under the paper. Syncing again adds only what is new. Nothing you wrote in Theesees is changed, and nothing is changed in Zotero.</p><div class="actions"><button type="button" class="primary" data-zotero-sync>Check Zotero</button></div><p id="zotero-status" role="status"></p></section><h3>Import a bibliography file</h3>`
  :'<p class="help">To sync your highlights from Zotero, open Theesees through its app on your computer (see “Use a local copy” in the README); a website cannot reach Zotero.</p>';
}
// On a passage: a way back to the highlight in Zotero's reader.
const zoteroOpenButton=h=>zoteroLink(h)?`<button data-zotero-open="${esc(zoteroLink(h))}" title="Open the PDF at this highlight in Zotero">Open in Zotero ↗</button>`:'';
document.addEventListener('click',e=>{
 const sync=e.target.closest('[data-zotero-sync]'),open=e.target.closest('[data-zotero-open]');
 if(sync)zoteroSync(sync);else if(open)location.href=open.dataset.zoteroOpen;
});
