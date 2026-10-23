/* Additive conversation records: imported transcripts are never rewritten. */
// Comments may use **bold** and *italic*. Markers need text right inside them, so "a * b" or a "* " bullet stays as typed.
const BOLD=/\*\*(?=\S)([\s\S]*?\S)\*\*/g,ITALIC=/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g;
const richText=s=>esc(s).replace(BOLD,'<strong>$1</strong>').replace(ITALIC,'$1<em>$2</em>');
const plainMarks=s=>String(s??'').replace(BOLD,'$1').replace(ITALIC,'$1$2');
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
const blockMenu=items=>typeof moreMenu==='function'?moreMenu(items):items;
function blockCard(b){
 const claim=typeof claimForBlock!=='function'?'':`<button data-block-action="claim" data-block="${esc(b.id)}">${claimForBlock(b.id)?'◆ Open thought':'→ Make it a thought'}</button>`;
 return `<article class="reply-block msg ${b.role==='AI'?'ai-block':'my-block'} ${b.key?'key-block':''}" id="block-${esc(b.id)}"><header><strong class="speaker-marker">${b.role==='AI'?'AI':'Me'}</strong><small>${esc(new Date(b.at).toLocaleDateString(undefined,{month:'short',day:'numeric'}))}${b.role==='AI'?' · pasted':''}</small>${b.key?'<span class="key-mark" title="Key thought">★</span>':''}</header>${blockQuote(b)}${b.deleted?'<p class="msg-removed">Comment removed. Replies are kept.</p>':`<div class="block-body">${richText(b.text)}</div>${(b.images||[]).length?`<div class="msg-images">${b.images.map(im=>`<button type="button" class="msg-img" data-view-img="${esc(im.id)}" aria-label="Open picture ${esc(im.name||'')}"><img data-img-id="${esc(im.id)}" alt="${esc(im.name||'Picture')}"></button>`).join('')}</div>`:''}`}<div class="block-actions">${b.deleted?`<button data-block-action="restore" data-block="${esc(b.id)}">Restore</button>`:`<button data-block-action="reply" data-block="${esc(b.id)}">Reply</button><button data-block-action="key" data-block="${esc(b.id)}" aria-pressed="${!!b.key}">${b.key?'★ Key thought':'☆ Key thought'}</button>${claim}${blockMenu(`<button data-block-action="branch" data-block="${esc(b.id)}">Start subthread</button><button data-block-action="edit" data-block="${esc(b.id)}">Edit</button><button class="danger" data-block-action="delete" data-block="${esc(b.id)}">Delete</button>`)}`}</div></article>`;
}
function conversationGroup(t,root,seen=new Set()){
 if(seen.has(root.id))return '';seen.add(root.id);
 const blocks=commentBlocks(t),messages=blocks.filter(b=>conversationRoot(t,b).id===root.id);
 return `<section class="flat-thread"><div class="thread-messages">${messages.map(m=>{
  const branches=blocks.filter(b=>b.subthread&&b.parentId===m.id);
  const slips=branches.map(b=>{const content=conversationGroup(t,b,new Set(seen));if(!content.includes('reply-block'))return '';const n=(content.match(/class="reply-block/g)||[]).length;return `<details class="optional-subthread tucked-subthread"><summary><span>↳ Subthread</span> ${esc(b.deleted?'Replies':plainMarks(b.text).slice(0,70))} <small>${n} message${n===1?'':'s'}</small></summary><div class="subthread-sheet">${content}</div></details>`;}).join('');
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
 const imported=turns.map((m,i)=>`<article class="imported-block"><div class="paper-message msg ${/^(AI|Assistant|ChatGPT|Claude)$/i.test(m.speaker)?'ai-block':'my-block'}"><details class="conversation-turn" open><summary><span class="speaker-marker">${esc(m.speaker==='Unlabelled text'?'Imported text':m.speaker)}</span> <small>imported · ${i+1}</small></summary><div class="block-body">${esc(cleanPDFBreaks(m.body))}</div></details><div class="block-actions"><button data-import-reply="${i}">Reply</button></div></div>${blockTree(t,null,anchors[i])}</article>`).join('');
 const detached=[...new Set(blocks.filter(b=>!b.parentId&&b.anchor&&!anchors.includes(b.anchor)).map(b=>b.anchor))];
 return `<div class="key-thoughts"><h3>Key thoughts <small>${keys.length}</small></h3>${keys.map(b=>`<a href="#block-${esc(b.id)}">★ ${esc(plainMarks(b.text).slice(0,180))}${b.text.length>180?'…':''}</a>`).join('')||'<p class="help">Mark a comment or reply to keep it here.</p>'}</div><div class="section-top"><h3>Thread</h3><button data-new-comment="true" title="Replies continue in the same thread; “Start subthread” branches off. AI replies are pasted, not generated.">＋ New comment</button></div><div class="comment-stream">${linkOnly?discussionView(t):imported?`<div class="imported-timeline">${imported}</div>`:''}${blockTree(t)}${detached.map(a=>`<details open class="imported-block"><summary>Reply to an earlier version of the imported conversation</summary><blockquote>${esc(blocks.find(b=>b.anchor===a)?.anchorQuote||'Original message')}</blockquote>${blockTree(t,null,a)}</details>`).join('')}</div>${!turns.length&&!blocks.length?'<p class="help">No comments yet. Start a thread about the passage you’re reading.</p>':''}${t.transcript?`<details class="raw-conversation"><summary>Original imported conversation (unchanged)</summary><pre>${esc(t.transcript)}</pre></details>`:''}`;
}
function composeBlock(t,{parentId=null,importIndex=null,editId=null,subthread=false}={}){
 let attach=null;
 const old=commentBlocks(t).find(b=>b.id===editId),parent=commentBlocks(t).find(b=>b.id===parentId),turn=importIndex!==null?conversationTurns(t.transcript)[importIndex]:null;
 const sourceId=old?.source?.id||threadSource||'';
 modal(old?'Edit comment':subthread?'Start subthread':parent||turn?'Add reply':'Start a thread',`<form>${parent||turn?`<blockquote class="reply-context">Replying to: ${esc(plainMarks(parent?.text||turn?.body||'').slice(0,280))}</blockquote>`:''}<label>Author<select name="role"><option value="Me" ${old?.role!=='AI'?'selected':''}>Me</option><option value="AI" ${old?.role==='AI'?'selected':''}>AI (pasted reply)</option></select></label><div class="fmt-bar" role="toolbar" aria-label="Formatting"><button type="button" data-fmt="**" title="Bold (⌘B)" aria-label="Bold"><b>B</b></button><button type="button" data-fmt="*" title="Italic (⌘I)" aria-label="Italic"><i>I</i></button><button type="button" data-fmt-case title="Change case: Sentence → Title → UPPER → lower" aria-label="Change case">Aa</button><small>Select words, then B, I or Aa · ⌘B / ⌘I</small></div><label>Comment<textarea name="body" data-rich="true" rows="7" placeholder="Your thought, question, or a reply copied from your AI conversation…">${esc(old?.text||'')}</textarea></label>${!parent&&!turn&&(!old||(!old.parentId&&!old.anchor))?`<label>About passage<select name="passage"><option value="">Whole discussion</option>${threadPassages(t).map(h=>`<option value="${esc(h.id)}" ${h.id===sourceId?'selected':''}>${esc(h.location||'Passage')} · ${esc(h.quote.slice(0,100))}</option>`).join('')}</select></label>`:''}${typeof imageAttachHTML==='function'?imageAttachHTML():''}<label><input type="checkbox" name="key" ${old?.key?'checked':''}> Keep as a key thought</label>${actions(old?'Save comment':'Add comment')}</form>`,f=>{
  // A comment needs words or at least one picture.
  const text=f.get('body').trim();if(!text&&!(attach?.count()))throw Error('Write or paste a comment first.');
  const h=data.passages.find(h=>h.id===f.get('passage'));
  const commit=images=>{
   if(!commitBlocks(t,()=>{if(old){old.revisions=[...(old.revisions||[]),{text:old.text,role:old.role,at:new Date().toISOString()}];Object.assign(old,{text,role:f.get('role'),key:!!f.get('key')});if(images)old.images=images;if(f.has('passage'))old.source=h?{id:h.id,paperId:h.paperId,quote:h.quote,location:h.location}:null;}else{t.blocks=[...commentBlocks(t),{id:uid(),parentId,subthread,anchor:turn?importedAnchor(turn,importIndex):null,anchorQuote:turn?.body||'',text,role:f.get('role'),key:!!f.get('key'),source:h?{id:h.id,paperId:h.paperId,quote:h.quote,location:h.location}:null,...(images?.length?{images}:{}),at:new Date().toISOString()}];}})){attach?.rollback();return;}
   attach?.finalize();closeModal();renderThread();
  };
  // Pictures are stored first; if the comment then fails to save, the new pictures are removed again.
  if(attach?.dirty())return attach.save().then(commit);
  commit();
 });
 attach=typeof bindImageAttach==='function'?bindImageAttach($('#modal-body form'),old?.images||[]):null;
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
/* Wrap the selection in a comment box with ** or *, or unwrap it if it is already wrapped. */
function toggleMark(area,mark){
 const {selectionStart:a,selectionEnd:b,value:v}=area,sel=v.slice(a,b),n=mark.length;
 const wrapped=v.slice(a-n,a)===mark&&v.slice(b,b+n)===mark&&!(n===1&&(v[a-2]==='*'||v[b+1]==='*'));
 if(wrapped){area.setRangeText(sel,a-n,b+n,'select');}
 else if(sel.startsWith(mark)&&sel.endsWith(mark)&&sel.length>=2*n){area.setRangeText(sel.slice(n,-n),a,b,'select');}
 else{const lead=sel.match(/^\s*/)[0],trail=sel.match(/\s*$/)[0],core=sel.trim();
  area.setRangeText(lead+mark+core+mark+trail,a,b,'end');
  if(!core){area.selectionStart=area.selectionEnd=a+lead.length+n;}else{area.selectionStart=a+lead.length+n;area.selectionEnd=area.selectionStart+core.length;}}
 area.dispatchEvent(new Event('input',{bubbles:true}));area.focus();
}
document.addEventListener('click',e=>{const c=e.target.closest('[data-fmt-case]');if(!c||typeof cycleCase!=='function')return;const area=c.closest('form')?.querySelector('textarea[data-rich]');if(!area)return;const {selectionStart:a,selectionEnd:b}=area;if(a===b){toast('Select some words first.');return;}area.setRangeText(cycleCase(area.value.slice(a,b)),a,b,'select');area.dispatchEvent(new Event('input',{bubbles:true}));area.focus();});
document.addEventListener('click',e=>{const b=e.target.closest('[data-fmt]');if(!b)return;const area=b.closest('form')?.querySelector('textarea[data-rich]');if(area)toggleMark(area,b.dataset.fmt);});
document.addEventListener('mousedown',e=>{if(e.target.closest('[data-fmt],[data-fmt-case]'))e.preventDefault();}); // keep the selection in the box
document.addEventListener('keydown',e=>{if(!(e.metaKey||e.ctrlKey)||e.altKey||!e.target.matches?.('textarea[data-rich]'))return;const k=e.key.toLowerCase();if(k==='b'||k==='i'){e.preventDefault();toggleMark(e.target,k==='b'?'**':'*');}});
document.addEventListener('pointerover',e=>{const d=e.target.closest('.tucked-subthread');if(d&&e.pointerType==='mouse')d.open=true;});
document.addEventListener('pointerout',e=>{const d=e.target.closest('.tucked-subthread');if(d&&!d.contains(e.relatedTarget)&&!d.dataset.pinned&&!d.contains(document.activeElement))d.open=false;});
document.addEventListener('click',e=>{const summary=e.target.closest('.tucked-subthread>summary');if(!summary)return;e.preventDefault();const d=summary.parentElement;if(d.dataset.pinned){delete d.dataset.pinned;d.open=false;}else{d.dataset.pinned='true';d.open=true;}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const d=e.target.closest('.tucked-subthread');if(d){delete d.dataset.pinned;d.open=false;d.querySelector('summary').focus();}});
