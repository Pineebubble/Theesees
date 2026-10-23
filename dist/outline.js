'use strict';
/* Outline: arrange Thoughts into chapters (level 1) and sections (level 2), then export a Markdown draft.
   Parts are one flat ordered list; a section belongs to the nearest chapter above it. Each thought sits in at most one part. */
data.outline ||= {parts:[]};
const outlineParts=()=>data.outline.parts;
// Arrange (place thoughts) or Write (draft each part); remembered per browser.
let outlineMode=(()=>{try{return localStorage.getItem('theesees-outline-mode')==='write'?'write':'arrange';}catch{return 'arrange';}})();
const outlineModeToggle=()=>`<div class="view-toggle" role="group" aria-label="Outline view">${[['arrange','Arrange'],['write','Write']].map(([v,l])=>`<button data-outline-mode="${v}" aria-pressed="${outlineMode===v}">${l}</button>`).join('')}</div>`;
const getPart=id=>outlineParts().find(s=>s.id===id);
const placementOf=claimId=>outlineParts().find(s=>s.claimIds.includes(claimId));
function chapterOf(part){const parts=outlineParts();for(let i=parts.indexOf(part);i>=0;i--)if(parts[i].level===1)return parts[i];return null;}
function partNumbers(){let ch=0,sec=0;const n={};for(const s of outlineParts()){if(s.level===1){ch++;sec=0;n[s.id]=`${ch}`;}else{sec++;n[s.id]=`${ch}.${sec}`;}}return n;}
function partPath(part){const ch=chapterOf(part);return part.level===1?part.title:`${ch?ch.title+' › ':''}${part.title}`;}
function commitOutline(change){const before=structuredClone(data.outline);change();if(save())return true;data.outline=before;return false;}
// A chapter's block is the chapter plus every section until the next chapter.
function chapterBlock(i){const parts=outlineParts();let end=i+1;while(end<parts.length&&parts[end].level===2)end++;return [i,end];}

function editPart(id=null,{level=1,chapterId=null}={}){
 const s=getPart(id),lvl=s?.level||level,kind=lvl===1?'chapter':'section';
 modal(s?`Edit ${kind}`:`Add ${kind}`,`<form><label>${lvl===1?'Chapter':'Section'} title<input name="title" required maxlength="200" value="${esc(s?.title||'')}" placeholder="${lvl===1?'e.g. Attention as labour':'e.g. Where the wage analogy fails'}"></label><label>What this ${kind} argues (optional)<textarea name="note" rows="3" placeholder="One or two sentences: the point a reader should take away.">${esc(s?.note||'')}</textarea></label>${actions(s?'Save':'Add '+kind)}</form>`,f=>{
  const title=f.get('title').trim();if(!title)throw Error('Enter a title.');
  if(!commitOutline(()=>{
   if(s)return Object.assign(s,{title,note:f.get('note').trim()});
   const fresh={id:uid(),level:lvl,title,note:f.get('note').trim(),claimIds:[]},parts=outlineParts(),ci=parts.findIndex(p=>p.id===chapterId);
   if(lvl===2&&ci>=0)parts.splice(chapterBlock(ci)[1],0,fresh);else parts.push(fresh);
  }))return;
  closeModal();renderOutline();
 });
}
function deletePart(id){
 const s=getPart(id);if(!s)return;const parts=outlineParts(),i=parts.indexOf(s),[start,end]=s.level===1?chapterBlock(i):[i,i+1],removed=parts.slice(start,end),n=removed.reduce((a,p)=>a+p.claimIds.length,0),words=typeof wordCount==='function'?removed.reduce((a,p)=>a+wordCount(draftPlain(p.draft||'')),0):0;
 modal(`Remove ${s.level===1?'chapter':'section'}?`,`<p>Remove “${esc(s.title)}”${s.level===1&&removed.length>1?` and its ${removed.length-1} section${removed.length>2?'s':''}`:''} from the outline? ${n?`Its ${n} thought${n>1?'s':''} will return to “Not yet placed”. `:''}Thoughts themselves are never deleted here.${words?` Its ${plural(words,'written word')} go${words===1?'es':''} to Trash for 30 days.`:''}</p><form>${actions('Remove from outline')}</form>`,()=>{
  const before=structuredClone(data);parts.splice(start,end-start);
  if(words)data.trash.push({id:uid(),type:'outline',item:{title:s.title},parts:structuredClone(removed),at:new Date().toISOString()});
  if(!save()){data=before;return;}closeModal();renderOutline();if(words)toast('Moved to Trash with its writing. Restore it there.');
 });
}
function movePart(id,dir){
 const parts=outlineParts(),s=getPart(id),i=parts.indexOf(s);if(!s)return false;
 return commitOutline(()=>{
  if(s.level===2){const j=i+dir;if(j<1&&dir<0||j>=parts.length)return;[parts[i],parts[j]]=[parts[j],parts[i]];return;}
  const [start,end]=chapterBlock(i),block=parts.slice(start,end);
  if(dir<0){let prev=start-1;while(prev>=0&&parts[prev].level===2)prev--;if(prev<0)return;parts.splice(start,block.length);parts.splice(prev,0,...block);}
  else{if(end>=parts.length)return;const [,nextEnd]=chapterBlock(end);parts.splice(start,block.length);parts.splice(nextEnd-block.length,0,...block);}
 });
}
/* Place a thought in a part at an index (end by default); partId null removes it from the outline. */
function placeClaim(claimId,partId,index=null){
 return commitOutline(()=>{
  for(const s of outlineParts())s.claimIds=s.claimIds.filter(x=>x!==claimId);
  const s=getPart(partId);if(!s)return;
  s.claimIds.splice(index===null?s.claimIds.length:Math.min(index,s.claimIds.length),0,claimId);
 });
}
function moveClaim(claimId,dir){const s=placementOf(claimId);if(!s)return false;const ids=s.claimIds.filter(id=>getClaim(id)),i=ids.indexOf(claimId),j=i+dir;if(j<0||j>=ids.length)return false;return commitOutline(()=>{[ids[i],ids[j]]=[ids[j],ids[i]];s.claimIds=[...ids,...s.claimIds.filter(id=>!getClaim(id))];});}

/* Citations: first author's surname, "et al." for several authors, year, then location. */
function citeName(p){const authors=String(p.author||'').split(/;|,(?=\s*[A-Z][^,]*\s\S)|\s+and\s+|\s*&\s*/).map(a=>a.trim()).filter(Boolean);if(!authors.length)return p.title.split(/\s+/).slice(0,3).join(' ');const first=authors[0].includes(',')?authors[0].split(',')[0]:authors[0].split(/\s+/).at(-1);return first+(authors.length>2?' et al.':authors.length===2?' & '+(authors[1].includes(',')?authors[1].split(',')[0]:authors[1].split(/\s+/).at(-1)):'');}
function citation(h){const p=getPaper(h.paperId);return `(${citeName(p)}, ${p.year||'n.d.'}${h.location?', '+h.location:''})`;}
function reference(p){if(p.apa)return p.apa;return `${p.author||'Unknown author'} (${p.year||'n.d.'}). *${p.title}*.${p.doi?` https://doi.org/${p.doi}`:''}`;}
// plural() comes from workspace.js.
const oneLine=s=>String(s).replace(/\s+/g,' ').trim();
function outlineMarkdown({quotes=true,reasoning=true,status=false,drafts=true,thoughts=true}={}){
 const nums=partNumbers(),cited=new Set(),out=['# Thesis outline','',`_Draft exported from Theesees on ${new Date().toLocaleDateString()}. Claims are in your own words; evidence links are your judgements._`,''];
 for(const s of outlineParts()){
  out.push(`${s.level===1?'#':'##'}# ${nums[s.id]} ${s.title}`,'');
  if(s.note)out.push(`_${oneLine(s.note)}_`,'');
  if(drafts&&s.draft&&typeof draftToMarkdown==='function'){const md=draftToMarkdown(s.draft);if(md)out.push(md,'');citesIn(s.draft).forEach(c=>cited.add(c.paper));}
  const cs=thoughts?s.claimIds.map(getClaim).filter(c=>c&&c.status!=='Abandoned'):[];
  for(const c of cs){
   const ev=liveEvidence(c);ev.forEach(e=>cited.add(e.passage.paperId));
   out.push(`- **${oneLine(c.text)}**${!quotes&&ev.length?' '+[...new Set(ev.filter(e=>e.relation!=='challenges').map(e=>citation(e.passage)))].join(' '):''}${status?` _[${c.status}]_`:''}`);
   if(quotes)for(const r of Object.keys(relations))for(const e of ev.filter(e=>e.relation===r))out.push(`  - ${relations[r]}: “${oneLine(e.passage.quote)}” ${citation(e.passage)}`);
   if(reasoning&&c.note.trim())out.push(`  - Reasoning: ${oneLine(c.note)}`);
  }
  if(cs.length)out.push('');
 }
 const papers=data.papers.filter(p=>cited.has(p.id)).sort((a,b)=>citeName(a).localeCompare(citeName(b)));
 if(papers.length)out.push('## References','',...papers.map(p=>`- ${reference(p)}`),'');
 return out.join('\n').replace(/\n{3,}/g,'\n\n');
}
function exportOutline(){
 modal('Export outline as Markdown',`<p>Paste into your thesis document or any Markdown editor. Abandoned thoughts are left out. References list the papers cited in your text and by included thoughts.</p><div class="outline-export-options"><label><input type="checkbox" id="md-drafts" checked> Include written text</label><label><input type="checkbox" id="md-thoughts" checked> Include thoughts</label><label><input type="checkbox" id="md-quotes" checked> Include evidence quotations</label><label><input type="checkbox" id="md-reasoning" checked> Include reasoning</label><label><input type="checkbox" id="md-status"> Mark status</label></div><textarea id="outline-md" readonly rows="16" aria-label="Markdown outline"></textarea><div class="actions outline-export-actions"><button id="copy-md">Copy</button><button id="download-md" class="primary">Download .md</button></div>`);
 const update=()=>{$('#outline-md').value=outlineMarkdown({drafts:$('#md-drafts').checked,thoughts:$('#md-thoughts').checked,quotes:$('#md-quotes').checked,reasoning:$('#md-reasoning').checked,status:$('#md-status').checked});};
 ['#md-drafts','#md-thoughts','#md-quotes','#md-reasoning','#md-status'].forEach(s=>$(s).onchange=update);update();
 $('#copy-md').onclick=async()=>{try{await navigator.clipboard.writeText($('#outline-md').value);toast('Markdown copied.');}catch{$('#outline-md').select();toast('Select-all done — press Ctrl/Cmd+C to copy.');}};
 $('#download-md').onclick=()=>{const url=URL.createObjectURL(new Blob([$('#outline-md').value],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='theesees-outline.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}

function placeOptions(current){const nums=partNumbers();return `<option value="">${current?'Remove from outline':'Place in…'}</option>`+outlineParts().map(s=>`<option value="${esc(s.id)}" ${s.id===current?'selected':''}>${s.level===2?'   ':''}${nums[s.id]} ${esc(s.title)}</option>`).join('');}
function outlineCard(c,placed){
 const ev=liveEvidence(c),gaps=claimGaps(c);
 return `<article class="outline-claim status-${esc(c.status.toLowerCase())}" draggable="true" data-outline-claim="${esc(c.id)}"><span class="drag-handle" aria-hidden="true">⋮⋮</span><div class="outline-claim-body"><button class="link outline-claim-text" data-claim="${esc(c.id)}">${esc(c.text)}</button><div class="outline-claim-meta"><span class="badge claim-status">${esc(c.status)}</span>${evidenceSummary(c)}${gaps.map(g=>`<span class="badge unlinked">${esc(g)}</span>`).join('')}${ev.length?`<small>${[...new Set(ev.map(e=>citeName(getPaper(e.passage.paperId))))].map(esc).join(' · ')}</small>`:''}</div></div><div class="outline-claim-actions">${placed?`<button data-claim-move="-1" data-id="${esc(c.id)}" aria-label="Move up">↑</button><button data-claim-move="1" data-id="${esc(c.id)}" aria-label="Move down">↓</button>`:''}<select data-place-claim="${esc(c.id)}" aria-label="Move thought to">${placeOptions(placed)}</select></div></article>`;
}
function renderOutline(){
 if(outlineMode==='write'&&typeof renderOutlineWrite==='function')return renderOutlineWrite();
 const parts=outlineParts(),nums=partNumbers(),live=data.claims.filter(c=>c.status!=='Abandoned'),unplaced=live.filter(c=>!placementOf(c.id)),placed=live.length-unplaced.length,needs=live.filter(c=>placementOf(c.id)&&claimGaps(c).length).length;
 $('#main').innerHTML=`<div class="page-heading"><div><h1>Outline</h1><p>Arrange your thoughts into the argument of your thesis. Drag them into place, or use the “Place in…” menus.</p></div><div class="actions">${outlineModeToggle()}<button id="add-chapter">＋ Chapter</button><button id="export-outline" class="primary" ${parts.length?'':'disabled'}>Export Markdown ↗</button></div></div><div class="archive-count" role="status">${plural(parts.filter(s=>s.level===1).length,'chapter')} · ${plural(placed,'thought')} placed · ${needs} placed need${needs===1?'s':''} work · ${unplaced.length} not yet placed</div><div class="outline-layout"><section class="outline-tree">${parts.map(s=>{const cs=s.claimIds.map(getClaim).filter(Boolean),i=parts.indexOf(s);return `<section class="outline-part level-${s.level}"><div class="outline-part-head"><div><small class="outline-number">${s.level===1?'Chapter ':'Section '}${nums[s.id]}</small><h2>${esc(s.title)}</h2>${s.note?`<p class="outline-note">${esc(s.note)}</p>`:''}</div><div class="actions"><button data-part-move="-1" data-id="${esc(s.id)}" aria-label="Move ${esc(s.title)} up" ${i===0||(s.level===2&&i===1&&parts[0].level===1)?'disabled':''}>↑</button><button data-part-move="1" data-id="${esc(s.id)}" aria-label="Move ${esc(s.title)} down">↓</button>${s.level===1?`<button data-add-section="${esc(s.id)}">＋ Section</button>`:''}${moreMenu(`<button data-edit-part="${esc(s.id)}">Edit ${s.level===1?'chapter':'section'}</button><button class="danger" data-delete-part="${esc(s.id)}">Remove from outline</button>`)}</div></div><div class="outline-drop" data-drop-part="${esc(s.id)}">${cs.map(c=>outlineCard(c,s.id)).join('')||'<p class="outline-empty">Drop thoughts here.</p>'}</div></section>`;}).join('')||empty('No chapters yet','Add a chapter, then drag thoughts into it. You can reorder everything later.')}</section><aside class="outline-pool"><div class="section-top"><h2>Not yet placed <small>${unplaced.length}</small></h2><button data-new-thought="true">＋ Thought</button></div><div class="outline-drop" data-drop-part="">${unplaced.map(c=>outlineCard(c,null)).join('')||`<p class="outline-empty">${live.length?'Every thought is placed.':'No thoughts yet. Create them in the Thoughts tab or with “→ Thought” on a comment or passage.'}</p>`}</div></aside></div>`;
 $('#add-chapter').onclick=()=>editPart();$('#export-outline').onclick=exportOutline;
 setupOutlineDrag();
}
function setupOutlineDrag(){
 let dragging=null;
 for(const card of $$('.outline-claim')){
  card.addEventListener('dragstart',e=>{dragging=card.dataset.outlineClaim;e.dataTransfer.setData('text/plain',dragging);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
  card.addEventListener('dragend',()=>{card.classList.remove('dragging');$$('.drop-target').forEach(x=>x.classList.remove('drop-target'));});
 }
 for(const zone of $$('.outline-drop')){
  zone.addEventListener('dragover',e=>{if(!dragging)return;e.preventDefault();$$('.drop-target').forEach(x=>x!==zone&&x.classList.remove('drop-target'));zone.classList.add('drop-target');});
  zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drop-target');});
  zone.addEventListener('drop',e=>{
   e.preventDefault();if(!dragging)return;const partId=zone.dataset.dropPart||null;
   // Insert before the first card whose middle is below the pointer.
   const cards=[...zone.querySelectorAll('.outline-claim')].filter(x=>x.dataset.outlineClaim!==dragging);
   const before=cards.find(x=>{const r=x.getBoundingClientRect();return e.clientY<r.top+r.height/2;});
   const index=before?getPart(partId)?.claimIds.filter(id=>id!==dragging).indexOf(before.dataset.outlineClaim):null;
   if(placeClaim(dragging,partId,index===-1?null:index))renderOutline();dragging=null;
  });
 }
}
/* Shown on a thought's page. */
function outlinePlacementHTML(c){const s=placementOf(c.id);return `<label class="outline-placement">Outline<select data-place-claim="${esc(c.id)}" data-from-claim-page="true">${placeOptions(s?.id)}</select></label>`;}

document.addEventListener('click',e=>{
 const m=e.target.closest('[data-outline-mode]');if(m){if(typeof flushDraft==='function')flushDraft();outlineMode=m.dataset.outlineMode;try{localStorage.setItem('theesees-outline-mode',outlineMode);}catch{}return renderOutline();}
 const el=e.target.closest('[data-part-move],[data-add-section],[data-edit-part],[data-delete-part],[data-claim-move],[data-new-thought]');if(!el)return;const d=el.dataset;
 if(d.newThought)return editClaim(null,{stay:true});
 if(d.addSection)return editPart(null,{level:2,chapterId:d.addSection});
 if(d.editPart)return editPart(d.editPart);
 if(d.deletePart)return deletePart(d.deletePart);
 if(d.partMove&&movePart(d.id,Number(d.partMove)))return renderOutline();
 if(d.claimMove&&moveClaim(d.id,Number(d.claimMove)))renderOutline();
});
document.addEventListener('change',e=>{
 const el=e.target.closest('[data-place-claim]');if(!el)return;
 if(!placeClaim(el.dataset.placeClaim,el.value||null))return;
 if(el.dataset.fromClaimPage){toast(el.value?'Placed in '+partPath(getPart(el.value))+'.':'Removed from the outline.');renderClaim();}else renderOutline();
});
