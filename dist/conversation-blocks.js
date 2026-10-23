/* Additive conversation records: imported transcripts are never rewritten. */
function commentBlocks(t){return t.blocks||[];}
function commitBlocks(t,change){const before=structuredClone(t);change();if(save())return true;Object.keys(t).forEach(k=>delete t[k]);Object.assign(t,before);return false;}
function blockQuote(b){return b.source?`<details class="block-source"><summary>Passage · ${esc(b.source.location||'Saved quotation')}</summary><blockquote>${esc(b.source.quote)}</blockquote>${getPaper(b.source.paperId)?`<button data-paper="${esc(b.source.paperId)}">Open literature ↗</button>`:''}</details>`:'';}
function conversationRoot(t,b){
 const seen=new Set();
 while(b.parentId&&!b.subthread&&!seen.has(b.id)){
  seen.add(b.id);const parent=commentBlocks(t).find(x=>x.id===b.parentId);
  if(!parent)break;b=parent;
 }
 return b;
}
function blockCard(b){
 return `<article class="reply-block ${b.role==='AI'?'ai-block':'my-block'} ${b.key?'key-block':''}" id="block-${esc(b.id)}"><header><strong class="speaker-marker">${b.role==='AI'?'AI · pasted reply':'Me'}</strong><small>${esc(new Date(b.at).toLocaleDateString())}${b.key?' · ★ Key thought':''}</small></header>${blockQuote(b)}${b.deleted?'<p class="help">Comment removed. Replies are kept.</p>':`<div class="block-body">${esc(b.text)}</div>`}<div class="block-actions">${b.deleted?`<button data-block-action="restore" data-block="${esc(b.id)}">Restore</button>`:`<button data-block-action="reply" data-block="${esc(b.id)}">Reply</button><button data-block-action="branch" data-block="${esc(b.id)}">Start subthread</button><button data-block-action="edit" data-block="${esc(b.id)}">Edit</button><button data-block-action="key" data-block="${esc(b.id)}" aria-pressed="${!!b.key}">${b.key?'★ Unmark':'☆ Key thought'}</button>${typeof claimForBlock!=='function'?'':claimForBlock(b.id)?`<button data-block-action="claim" data-block="${esc(b.id)}">◆ Open thought</button>`:`<button data-block-action="claim" data-block="${esc(b.id)}">→ Thought</button>`}<button data-block-action="delete" data-block="${esc(b.id)}">Delete</button>`}</div></article>`;
}
function conversationGroup(t,root,seen=new Set()){
 if(seen.has(root.id))return '';seen.add(root.id);
 const blocks=commentBlocks(t),messages=blocks.filter(b=>conversationRoot(t,b).id===root.id);
 return `<section class="flat-thread"><div class="thread-messages">${messages.map(m=>{
  const branches=blocks.filter(b=>b.subthread&&b.parentId===m.id);
  const slips=branches.map(b=>{const content=conversationGroup(t,b,new Set(seen));if(!content.includes('reply-block'))return '';return `<details class="optional-subthread tucked-subthread"><summary>↗ Subthread · ${esc(b.deleted?'Replies':b.text.slice(0,60))}</summary><div class="subthread-sheet">${content}</div></details>`;}).join('');
  if(m.deleted)return slips?`<div class="sticker-stack orphan-branch">${slips}</div>`:'';
  return `<div class="sticker-stack">${blockCard(m)}${slips}</div>`;
 }).join('')}</div></section>`;
}
function blockTree(t,parent=null,anchor=null){
 return commentBlocks(t).filter(b=>b.parentId===parent&&(parent||b.anchor===anchor)).map(b=>conversationGroup(t,b)).join('');
}
function importedAnchor(m,i){return JSON.stringify([i,m.speaker,m.body]);}
function threadedDiscussionView(t){
 const linkOnly=/^https?:\/\/\S+$/i.test(t.transcript?.trim()||'');
 const turns=t.transcript?.trim()&&!linkOnly?conversationTurns(t.transcript):[],anchors=turns.map(importedAnchor),blocks=commentBlocks(t),keys=blocks.filter(b=>b.key&&!b.deleted);
 const imported=turns.map((m,i)=>`<article class="imported-block"><div class="paper-message ${/^(AI|Assistant|ChatGPT|Claude)$/i.test(m.speaker)?'ai-block':'my-block'}"><details class="conversation-turn" open><summary><span class="speaker-marker">${esc(m.speaker)}</span> <small>Imported · ${i+1}</small></summary><div class="block-body">${esc(cleanPDFBreaks(m.body))}</div></details><button data-import-reply="${i}">↳ Reply to this message</button></div>${blockTree(t,null,anchors[i])}</article>`).join('');
 const detached=[...new Set(blocks.filter(b=>!b.parentId&&b.anchor&&!anchors.includes(b.anchor)).map(b=>b.anchor))];
 return `<div class="key-thoughts"><h3>Key thoughts <small>${keys.length}</small></h3>${keys.map(b=>`<a href="#block-${esc(b.id)}">★ ${esc(b.text.slice(0,180))}${b.text.length>180?'…':''}</a>`).join('')||'<p class="help">Mark a comment or reply to keep it here.</p>'}</div><div class="section-top"><h3>Conversation threads</h3><button data-new-comment="true">＋ New thread</button></div><p class="help">Replies continue in the same thread. Choose “Start subthread” only to branch into a separate conversation. AI replies are pasted, not generated.</p><div class="comment-stream">${linkOnly?discussionView(t):imported?`<div class="imported-timeline">${imported}</div>`:''}${blockTree(t)}${detached.map(a=>`<details open class="imported-block"><summary>Reply to an earlier version of the imported conversation</summary><blockquote>${esc(blocks.find(b=>b.anchor===a)?.anchorQuote||'Original message')}</blockquote>${blockTree(t,null,a)}</details>`).join('')}</div>${!turns.length&&!blocks.length?'<p class="help">No comments yet. Start a thread about the passage you’re reading.</p>':''}${t.transcript?`<details class="raw-conversation"><summary>Original imported conversation (unchanged)</summary><pre>${esc(t.transcript)}</pre></details>`:''}`;
}
function composeBlock(t,{parentId=null,importIndex=null,editId=null,subthread=false}={}){
 const old=commentBlocks(t).find(b=>b.id===editId),parent=commentBlocks(t).find(b=>b.id===parentId),turn=importIndex!==null?conversationTurns(t.transcript)[importIndex]:null;
 const sourceId=old?.source?.id||threadSource||'';
 modal(old?'Edit comment':subthread?'Start subthread':parent||turn?'Add reply':'Start a thread',`<form>${parent||turn?`<blockquote class="reply-context">Replying to: ${esc((parent?.text||turn?.body||'').slice(0,280))}</blockquote>`:''}<label>Author<select name="role"><option value="Me" ${old?.role!=='AI'?'selected':''}>Me</option><option value="AI" ${old?.role==='AI'?'selected':''}>AI (pasted reply)</option></select></label><label>Comment<textarea name="body" required rows="7" placeholder="Your thought, question, or a reply copied from your AI conversation…">${esc(old?.text||'')}</textarea></label>${!parent&&!turn&&!old?`<label>About passage<select name="passage"><option value="">Whole discussion</option>${threadPassages(t).map(h=>`<option value="${esc(h.id)}" ${h.id===sourceId?'selected':''}>${esc(h.location||'Passage')} · ${esc(h.quote.slice(0,100))}</option>`).join('')}</select></label>`:''}<label><input type="checkbox" name="key" ${old?.key?'checked':''}> Keep as a key thought</label>${actions(old?'Save comment':'Add comment')}</form>`,f=>{
  const text=f.get('body').trim();if(!text)throw Error('Write or paste a comment first.');
  const h=data.passages.find(h=>h.id===f.get('passage'));
  if(!commitBlocks(t,()=>{if(old){old.revisions=[...(old.revisions||[]),{text:old.text,role:old.role,at:new Date().toISOString()}];Object.assign(old,{text,role:f.get('role'),key:!!f.get('key')});}else{t.blocks=[...commentBlocks(t),{id:uid(),parentId,subthread,anchor:turn?importedAnchor(turn,importIndex):null,anchorQuote:turn?.body||'',text,role:f.get('role'),key:!!f.get('key'),source:h?{id:h.id,paperId:h.paperId,quote:h.quote,location:h.location}:null,at:new Date().toISOString()}];}}))return;
  closeModal();renderThread();
 });
}
function startDiscussion(passageId=null){
 modal('New discussion',`<form><label>Discussion title<input name="title" required maxlength="250" placeholder="What are you thinking about?"></label>${actions('Create discussion')}</form>`,f=>{const title=f.get('title').trim();if(!title)throw Error('Enter a title.');const t={id:uid(),title,platform:'Personal notes / AI conversations',transcript:'',paperIds:[],passageIds:passageId?[passageId]:[],status:'Open',blocks:[],created:new Date().toISOString()};data.threads.push(t);if(!save()){data.threads.pop();return;}closeModal();openThread(t.id);});
}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-new-comment],[data-import-reply],[data-block-action],[data-start-discussion]');if(!el)return;
 if(el.hasAttribute('data-start-discussion')){startDiscussion(el.dataset.startDiscussion||null);return;}
 const t=data.threads.find(t=>t.id===currentThread);if(!t)return;
 if(el.hasAttribute('data-new-comment'))return composeBlock(t);
 if(el.hasAttribute('data-import-reply'))return composeBlock(t,{importIndex:Number(el.dataset.importReply)});
 const b=commentBlocks(t).find(b=>b.id===el.dataset.block);if(!b)return;
 const action=el.dataset.blockAction;
if(action==='reply')return composeBlock(t,{parentId:b.id});
 if(action==='branch')return composeBlock(t,{parentId:b.id,subthread:true});
 if(action==='edit')return composeBlock(t,{editId:b.id});
 if(action==='claim')return promoteBlock(t,b);
 if(action==='delete'){modal('Remove comment?',`<p>Move this comment to Trash for 30 days? Its replies will stay.</p><form>${actions('Move to Trash')}</form>`,()=>{if(commitBlocks(t,()=>{b.deleted=true;b.deletedAt=new Date().toISOString();})){closeModal();renderThread();}});return;}
 if(commitBlocks(t,()=>{if(action==='key')b.key=!b.key;if(action==='restore')b.deleted=false;}))renderThread();
});
document.addEventListener('pointerover',e=>{const d=e.target.closest('.tucked-subthread');if(d&&e.pointerType==='mouse')d.open=true;});
document.addEventListener('pointerout',e=>{const d=e.target.closest('.tucked-subthread');if(d&&!d.contains(e.relatedTarget)&&!d.dataset.pinned&&!d.contains(document.activeElement))d.open=false;});
document.addEventListener('click',e=>{const summary=e.target.closest('.tucked-subthread>summary');if(!summary)return;e.preventDefault();const d=summary.parentElement;if(d.dataset.pinned){delete d.dataset.pinned;d.open=false;}else{d.dataset.pinned='true';d.open=true;}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const d=e.target.closest('.tucked-subthread');if(d){delete d.dataset.pinned;d.open=false;d.querySelector('summary').focus();}});
