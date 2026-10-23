'use strict';
/* Thoughts: claims written in your own words, linked to evidence passages and to the conversations they came from. */
data.claims ||= [];
const claimStatuses=['Hunch','Developing','Defensible','Abandoned'];
const relations={supports:'Supports',challenges:'Challenges',qualifies:'Qualifies'};
let currentClaim=null,claimQuery='',claimStatus='All',claimKeyword='all',claimGap='All';
// List or colour-block view; remembered per browser as a convenience only.
let claimView=(()=>{try{return localStorage.getItem('theesees-thought-view')==='blocks'?'blocks':'list';}catch{return 'list';}})();
const getClaim=id=>data.claims.find(c=>c.id===id);
function liveEvidence(c){return c.evidence.map(e=>({...e,passage:data.passages.find(h=>h.id===e.passageId)})).filter(e=>e.passage&&getPaper(e.passage.paperId));}
function claimGaps(c){
 const ev=liveEvidence(c),gaps=[];
 if(c.status==='Abandoned')return gaps;
 if(!ev.length)gaps.push('No evidence');
 else if(ev.every(e=>e.relation==='supports'))gaps.push('No counter-evidence');
 if(!c.keywords.some(getKeyword))gaps.push('No theme');
 return gaps;
}
function claimsForPassage(id){return data.claims.filter(c=>c.evidence.some(e=>e.passageId===id));}
function claimForBlock(id){return data.claims.find(c=>c.origins.some(o=>o.blockId===id));}
function evidenceSummary(c){const ev=liveEvidence(c);return Object.keys(relations).map(r=>[r,ev.filter(e=>e.relation===r).length]).filter(([,n])=>n).map(([r,n])=>`<span class="relation-chip rel-${r}">${relations[r]} ${n}</span>`).join('');}
function newClaim(text,{status='Hunch',keywords=[],evidence=[],origins=[]}={}){const at=new Date().toISOString();return {id:uid(),text,note:'',status,keywords,evidence,origins,created:at,updated:at,revisions:[]};}
function commitClaims(change){const before=structuredClone(data.claims);const result=change();if(save())return result||true;data.claims=before;return false;}

/* Create or edit a claim. `seed` pre-fills a new claim from a passage or a conversation comment. */
function editClaim(id=null,seed={}){
 const c=getClaim(id),h=seed.passageId&&data.passages.find(x=>x.id===seed.passageId);
 const sourceField=!c&&h?`<label>How does the passage relate to this thought?<select name="relation">${Object.entries(relations).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}<option value="">Don’t link it</option></select></label><blockquote class="reply-context">${esc(h.location)} · ${esc(h.quote.slice(0,280))}</blockquote>`:'';
 modal(c?'Edit thought':'New thought',`<p class="claim-hint">Write one claim you could defend or attack, in your own words. Short is better.</p><form>${seed.fromText?`<blockquote class="reply-context">From the conversation: ${esc(seed.fromText.slice(0,280))}</blockquote>`:''}<label>Thought<textarea name="text" required rows="4" maxlength="1000" placeholder="e.g. Attention is extracted like labour, but without a wage relation.">${esc(c?.text??seed.text??'')}</textarea></label><label>Status<select name="status">${claimStatuses.map(s=>`<option ${(c?.status||'Hunch')===s?'selected':''}>${s}</option>`).join('')}</select></label>${sourceField}<label>Themes</label>${keywordChecks(c?.keywords||seed.keywords||[])}${actions(c?'Save thought':'Create thought')}</form>`,f=>{
  const text=f.get('text').trim();if(!text)throw Error('Write the thought first.');
  const fields={text,status:f.get('status'),keywords:f.getAll('keyword')};
  const saved=commitClaims(()=>{
   if(c){if(c.text!==text)c.revisions.push({text:c.text,at:new Date().toISOString()});Object.assign(c,fields,{updated:new Date().toISOString()});return c;}
   const fresh=newClaim(text,{...fields,evidence:h&&f.get('relation')?[{passageId:h.id,relation:f.get('relation')}]:[],origins:seed.origin?[seed.origin]:[]});
   data.claims.push(fresh);return fresh;
  });
  if(!saved)return;closeModal();
  if(seed.stay){render();toast('Thought created. Find it in the Thoughts tab.');}else openClaim(saved.id);
 });
}
/* Promote a comment (yours or a pasted AI reply) into a thought, keeping where it came from. */
function promoteBlock(t,b){
 const existing=claimForBlock(b.id);if(existing)return openClaim(existing.id);
 const keywords=[...new Set(threadPapers(t).flatMap(p=>p.keywords))];
 editClaim(null,{text:b.role==='Me'?(typeof plainMarks==='function'?plainMarks(b.text):b.text):'',fromText:typeof plainMarks==='function'?plainMarks(b.text):b.text,passageId:b.source?.id||threadPassages(t)[0]?.id,keywords,origin:{threadId:t.id,blockId:b.id},stay:true});
}
function linkEvidence(c){
 const byPaper=data.papers.map(p=>[p,data.passages.filter(h=>h.paperId===p.id)]).filter(([,hs])=>hs.length);
 modal('Link evidence',`<p class="claim-hint">Choose how each saved passage bears on this thought. These are your judgements, not verified facts.</p><blockquote class="reply-context">${esc(c.text)}</blockquote><form><div class="evidence-picker">${byPaper.map(([p,hs])=>`<h3>${esc(p.title)}</h3>${hs.map(h=>{const cur=c.evidence.find(e=>e.passageId===h.id)?.relation||'';return `<div class="evidence-option"><select name="rel-${esc(h.id)}" aria-label="Relation for passage at ${esc(h.location)}"><option value="">—</option>${Object.entries(relations).map(([v,l])=>`<option value="${v}" ${cur===v?'selected':''}>${l}</option>`).join('')}</select><div><small>${esc(h.location)}</small><p>${esc(h.quote.slice(0,240))}${h.quote.length>240?'…':''}</p></div></div>`;}).join('')}`).join('')||'<p>No passages saved yet. Open a paper and save a passage first.</p>'}</div>${actions('Save evidence')}</form>`,f=>{
  // Passages not shown (e.g. in Trash) keep their links so restoring them restores the evidence.
  const shown=new Set(byPaper.flatMap(([,hs])=>hs.map(h=>h.id)));
  if(!commitClaims(()=>{c.evidence=[...c.evidence.filter(e=>!shown.has(e.passageId)),...[...shown].filter(id=>f.get('rel-'+id)).map(id=>({passageId:id,relation:f.get('rel-'+id)}))];c.updated=new Date().toISOString();}))return;
  closeModal();renderClaim();
 });
}
function deleteClaim(id){
 const c=getClaim(id);if(!c)return;
 modal('Delete thought?',`<blockquote>${esc(c.text)}</blockquote><p>Move this thought to Trash for 30 days? Passages and conversations are not affected. Consider marking it “Abandoned” instead to keep a record of what you stopped believing.</p><form>${actions('Move to Trash')}</form>`,()=>{
  const before=structuredClone(data);data.trash.push({id:uid(),type:'claim',item:structuredClone(c),at:new Date().toISOString()});data.claims=data.claims.filter(x=>x.id!==id);
  if(!save()){data=before;return;}closeModal();navigate('thoughts');toast('Thought moved to Trash.');
 });
}
function restoreClaim(entry){data.claims.push(entry.item);}

function claimFilters(c){
 const gaps=claimGaps(c);
 return c.text.toLowerCase().includes(claimQuery.toLowerCase())&&(claimStatus==='All'||c.status===claimStatus)&&(claimKeyword==='all'||c.keywords.includes(claimKeyword))&&(claimGap==='All'||(claimGap==='Needs work'?gaps.length:claimGap==='From conversations'?c.origins.length:claimGap==='Not in outline'?typeof placementOf==='function'&&!placementOf(c.id):gaps.includes(claimGap)));
}
const viewToggle=()=>`<div class="view-toggle" role="group" aria-label="Thought view">${[['list','List'],['blocks','Blocks']].map(([v,l])=>`<button data-claim-view="${v}" aria-pressed="${claimView===v}">${l}</button>`).join('')}</div>`;
function renderThoughts(){
 if(claimKeyword!=='all'&&!getKeyword(claimKeyword))claimKeyword='all';
 if(claimView==='blocks')return renderThoughtBlocks();
 $('#main').innerHTML=`<div class="page-heading"><div><h1>Thoughts</h1><p>Claims in your own words, each tied to the passages that support or challenge it.</p></div><div class="actions">${viewToggle()}<button id="add-claim" class="primary">＋ New thought</button></div></div><div class="discussion-filters claim-filters"><label>Search<input id="search-claims" placeholder="Words in a thought" value="${esc(claimQuery)}"></label><label>Status<select id="claim-status"><option>All</option>${claimStatuses.map(s=>`<option ${s===claimStatus?'selected':''}>${s}</option>`).join('')}</select></label><label>Theme<select id="claim-keyword"><option value="all">All themes</option>${data.keywords.map(k=>`<option value="${esc(k.id)}" ${claimKeyword===k.id?'selected':''}>${esc(k.title)}</option>`).join('')}</select></label><label>Show<select id="claim-gap">${['All','Needs work','No evidence','No counter-evidence','No theme','From conversations','Not in outline'].map(x=>`<option ${x===claimGap?'selected':''}>${x}</option>`).join('')}</select></label></div><div class="archive-count" id="claim-count" role="status"></div><div id="claim-list" class="list"></div>`;
 $('#add-claim').onclick=()=>editClaim();
 $('#search-claims').oninput=e=>{claimQuery=e.target.value;claimList();};
 $('#claim-status').onchange=e=>{claimStatus=e.target.value;claimList();};
 $('#claim-keyword').onchange=e=>{claimKeyword=e.target.value;claimList();};
 $('#claim-gap').onchange=e=>{claimGap=e.target.value;claimList();};
 claimList();
}
function claimList(){
 const cs=data.claims.filter(claimFilters).sort((a,b)=>b.updated.localeCompare(a.updated)),needs=data.claims.filter(c=>claimGaps(c).length).length;
 $('#claim-count').textContent=`${cs.length} of ${data.claims.length} thought${data.claims.length===1?'':'s'} · ${needs} need${needs===1?'s':''} work`;
 $('#claim-list').innerHTML=cs.map(c=>{const ks=c.keywords.map(getKeyword).filter(Boolean),gaps=claimGaps(c);return `<article class="archive-entry claim-entry status-${esc(c.status.toLowerCase())}"><div class="archive-entry-head"><div><span class="badge claim-status">${esc(c.status)}</span>${evidenceSummary(c)}${gaps.map(g=>`<span class="badge unlinked">${esc(g)}</span>`).join('')}<h2><button class="discussion-title-link" data-claim="${esc(c.id)}">${esc(c.text)}</button></h2></div><div class="actions"><button data-claim="${esc(c.id)}">Open ↗</button></div></div><div class="tag-row claim-tags">${ks.map(k=>`<span class="keyword-tag" style="--tag:${colors[k.color%colors.length]}">${esc(k.title)}</span>`).join('')}${c.origins.length?`<small>From ${c.origins.length} conversation comment${c.origins.length>1?'s':''}</small>`:''}</div></article>`;}).join('')||empty(data.claims.length?'No matching thoughts':'No thoughts yet',data.claims.length?'Try another filter.':'Write one with “New thought”, or use “→ Thought” on a comment or passage to turn it into a claim.');
}
function openClaim(id){currentClaim=id;page='claim';render();}
function renderClaim(){
 const c=getClaim(currentClaim);if(!c){navigate('thoughts');return;}
 const ev=liveEvidence(c),missing=c.evidence.length-ev.length,ks=c.keywords.map(getKeyword).filter(Boolean),gaps=claimGaps(c);
 const group=r=>{const items=ev.filter(e=>e.relation===r);return `<section class="evidence-group rel-${r}"><h3>${relations[r]} <small>${items.length}</small></h3>${items.map(e=>{const p=getPaper(e.passage.paperId);return `<article class="evidence-card"><small>${esc(p.title)} · ${esc(e.passage.location)}</small><blockquote>${esc(e.passage.quote)}</blockquote><div class="actions"><button data-source="${esc(e.passage.id)}">Open in paper ↗</button><select data-evidence-relation="${esc(e.passage.id)}" aria-label="Change relation">${Object.entries(relations).map(([v,l])=>`<option value="${v}" ${v===r?'selected':''}>${l}</option>`).join('')}</select><button data-unlink-evidence="${esc(e.passage.id)}">Unlink</button></div></article>`;}).join('')||`<p class="claim-hint">${r==='challenges'?'Nothing challenges this yet. What would a sceptical reader say?':'None linked.'}</p>`}</section>`;};
 const origins=c.origins.map(o=>{const t=data.threads.find(t=>t.id===o.threadId),b=t?.blocks?.find(b=>b.id===o.blockId);return t?`<div class="discussion-card"><small>${esc(t.title)}</small><p>${esc((b&&!b.deleted?b.text:'Comment removed').slice(0,220))}</p><button data-thread="${esc(t.id)}">Open conversation ↗</button></div>`:'<p class="claim-hint">The original conversation is in Trash.</p>';}).join('');
 $('#main').innerHTML=`<div class="reader-heading claim-heading"><button class="link back" id="back-thoughts">← Thoughts</button><h1 class="claim-text">${esc(c.text)}</h1><div class="reader-meta"><label>Status<select id="claim-status-edit">${claimStatuses.map(s=>`<option ${s===c.status?'selected':''}>${s}</option>`).join('')}</select></label>${typeof outlinePlacementHTML==='function'?outlinePlacementHTML(c):''}<button id="edit-claim">Edit thought</button>${moreMenu(`<button class="danger" id="delete-claim">Delete thought</button>`)}</div><div class="tag-row">${ks.map(k=>`<button class="keyword-tag" style="--tag:${colors[k.color%colors.length]}" data-claim-keyword="${esc(k.id)}">${esc(k.title)}</button>`).join('')||'<small>No themes.</small>'}</div>${gaps.length?`<p class="claim-gaps">Needs work: ${gaps.map(esc).join(' · ')}</p>`:''}</div><div class="claim-layout"><section class="claim-evidence"><div class="section-top"><h2>Evidence</h2><button id="link-evidence" class="warm">＋ Link passages</button></div>${missing?`<p class="claim-hint">${missing} linked passage${missing>1?'s are':' is'} in Trash. Restore ${missing>1?'them':'it'} to bring the evidence back.</p>`:''}${Object.keys(relations).map(group).join('')}</section><aside class="claim-side"><h3>Reasoning</h3><textarea id="claim-note" aria-label="Reasoning" placeholder="Why do you believe this? What would change your mind?">${esc(c.note)}</textarea><small id="claim-note-state">Saved automatically on this browser</small>${relatedThoughtsHTML(c)}<h3>Came from</h3>${origins||'<p class="claim-hint">Written directly, not from a conversation.</p>'}${c.revisions.length?`<details class="legacy-notes"><summary>Earlier wordings (${c.revisions.length})</summary>${c.revisions.slice().reverse().map(r=>`<p><small>${esc(new Date(r.at).toLocaleString())}</small><br>${esc(r.text)}</p>`).join('')}</details>`:''}</aside></div>`;
 $('#back-thoughts').onclick=()=>navigate('thoughts');
 $('#claim-status-edit').onchange=e=>{if(commitClaims(()=>{c.status=e.target.value;c.updated=new Date().toISOString();}))renderClaim();};
 $('#edit-claim').onclick=()=>editClaim(c.id);$('#delete-claim').onclick=()=>deleteClaim(c.id);$('#link-evidence').onclick=()=>linkEvidence(c);
 $('#claim-note').oninput=e=>{c.note=e.target.value;if(save())$('#claim-note-state').textContent='Saved on this browser';};
}
/* Blocks view: one colour block per thought (its first keyword's colour). Hovering pushes a block out
   to the left, nudges its neighbours, and shows the thought beside it. Abandoned thoughts are left out. */
function renderThoughtBlocks(){
 const live=data.claims.filter(c=>c.status!=='Abandoned'),cs=live.filter(c=>claimKeyword==='all'||c.keywords.includes(claimKeyword)).sort((a,b)=>b.updated.localeCompare(a.updated));
 const cats=data.keywords.filter(k=>live.some(c=>c.keywords.includes(k.id))),dayAgo=Date.now()-86400000;
 const colour=c=>{const k=c.keywords.map(getKeyword).find(Boolean);return k?colors[k.color%colors.length]:'#dddcd6';};
 $('#main').innerHTML=`<div class="page-heading"><div><h1>Thoughts</h1><p>Hover a block to read a thought. Click it to open.</p></div><div class="actions">${viewToggle()}<button id="add-claim" class="primary">＋ New thought</button></div></div><div class="thought-blocks"><nav class="tb-cats" aria-label="Filter by theme"><button data-tb-keyword="all" aria-pressed="${claimKeyword==='all'}">All</button>${cats.map(k=>`<button data-tb-keyword="${esc(k.id)}" aria-pressed="${claimKeyword===k.id}">${esc(k.title)}</button>`).join('')}</nav><div class="tb-column">${cs.map(c=>`<button class="tb-block" data-tb="${esc(c.id)}" style="--block:${colour(c)}" aria-label="${esc(c.text)}">${Date.parse(c.created)>dayAgo?'<span class="tb-new">NEW</span>':''}</button>`).join('')}</div><div class="tb-side"><div class="tb-label" id="tb-label">${cs.length?'<span class="tb-hint">Hover a block</span>':`<span class="tb-hint">${live.length?'No thoughts with this theme.':'No thoughts yet. Use “New thought”, or “→ Thought” on a comment or passage.'}</span>`}</div></div></div>`;
 $('#add-claim').onclick=()=>editClaim(null,{stay:true});
 const blocks=$$('.tb-block'),label=$('#tb-label');
 const show=i=>{
  blocks.forEach((b,j)=>{b.classList.toggle('is-out',j===i);b.classList.toggle('is-near',Math.abs(j-i)===1);});
  const c=getClaim(blocks[i].dataset.tb),ks=c.keywords.map(getKeyword).filter(Boolean).map(k=>k.title),ev=liveEvidence(c);
  label.innerHTML=`<span class="tb-meta">${esc([c.status,...ks].join(' · '))}</span><span class="tb-text">${esc(c.text)}</span>${ev.length||claimGaps(c).length?`<span class="tb-meta">${esc([ev.length?`${ev.length} passage${ev.length>1?'s':''}`:'',...claimGaps(c)].filter(Boolean).join(' · '))}</span>`:''}`;
  label.style.top=blocks[i].offsetTop+'px';
 };
 blocks.forEach((b,i)=>{b.addEventListener('pointerenter',()=>show(i));b.addEventListener('focus',()=>show(i));});
 $('.tb-column')?.addEventListener('pointerleave',()=>blocks.forEach(b=>b.classList.remove('is-out','is-near')));
}

/* Thoughts that share a passage (strongest link) or a keyword with this one, and where it sits in the outline. */
function relatedThoughtsHTML(c){
 const kws=new Set(c.keywords.filter(getKeyword)),ps=new Set(c.evidence.map(e=>e.passageId));
 const rel=data.claims.filter(o=>o.id!==c.id&&o.status!=='Abandoned').map(o=>{const p=o.evidence.some(e=>ps.has(e.passageId)),k=o.keywords.filter(x=>kws.has(x));return {o,score:(p?2:0)+k.length,why:p?'uses the same passage':k.length?'also '+getKeyword(k[0]).title:''};}).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,5);
 const place=typeof placementOf==='function'?placementOf(c.id):null;
 return `<h3>In the outline</h3><p class="claim-hint">${place?`<button class="link" data-goto-outline="true">${esc(partPath(place))}</button>`:'Not placed yet. Use the Outline menu above.'}</p><h3>Related thoughts</h3>${rel.length?`<div class="panel-list">${rel.map(({o,why})=>`<button data-claim="${esc(o.id)}">${esc(o.text)}<small>${esc(why)}</small></button>`).join('')}</div>`:'<p class="claim-hint">None yet. Thoughts that share a theme or passage appear here.</p>'}`;
}
/* Shown under each passage in the reader. */
function passageClaimsHTML(h){const cs=claimsForPassage(h.id);return `<div class="passage-claims">${cs.map(c=>{const r=c.evidence.find(e=>e.passageId===h.id).relation;return `<button class="link" data-claim="${esc(c.id)}"><span class="relation-chip rel-${r}">${relations[r]}</span> ${esc(c.text.slice(0,120))}</button>`;}).join('')}<button data-claim-from-passage="${esc(h.id)}">→ Thought from passage</button></div>`;}

document.addEventListener('click',e=>{
 if(e.target.closest('[data-goto-outline]'))return navigate('outline');
 const v=e.target.closest('[data-claim-view],[data-tb-keyword],[data-tb]');
 if(v){const d=v.dataset;if(d.tb)return openClaim(d.tb);if(d.tbKeyword){claimKeyword=d.tbKeyword;return renderThoughtBlocks();}claimView=d.claimView;try{localStorage.setItem('theesees-thought-view',claimView);}catch{}return renderThoughts();}
 const el=e.target.closest('[data-claim],[data-claim-from-passage],[data-unlink-evidence],[data-claim-keyword]');if(!el)return;const d=el.dataset;
 if(d.claim)return openClaim(d.claim);
 if(d.claimFromPassage){const h=data.passages.find(x=>x.id===d.claimFromPassage);return editClaim(null,{passageId:h.id,keywords:getPaper(h.paperId)?.keywords||[],stay:true});}
 if(d.claimKeyword){claimKeyword=d.claimKeyword;claimStatus=claimGap='All';claimQuery='';return navigate('thoughts');}
 const c=getClaim(currentClaim);if(c&&commitClaims(()=>{c.evidence=c.evidence.filter(x=>x.passageId!==d.unlinkEvidence);c.updated=new Date().toISOString();}))renderClaim();
});
document.addEventListener('change',e=>{
 const el=e.target.closest('[data-evidence-relation]');if(!el)return;const c=getClaim(currentClaim),ev=c?.evidence.find(x=>x.passageId===el.dataset.evidenceRelation);if(!ev)return;
 if(commitClaims(()=>{ev.relation=el.value;c.updated=new Date().toISOString();}))renderClaim();
});
