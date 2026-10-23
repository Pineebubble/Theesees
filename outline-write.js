'use strict';
/* Outline → Write: a writing area for each chapter and section, beside the thoughts placed there.
   Drafts are kept on the outline part (part.draft) as sanitised HTML (see draft.js) and saved as you type. */
let writePartId=null,writeTimer=null,writeRange=null;

function partWords(p){return wordCount(draftPlain(p.draft||''));}
// A chapter's count includes its sections.
function chapterWords(i){const parts=outlineParts(),[a,b]=chapterBlock(i);return parts.slice(a,b).reduce((n,p)=>n+partWords(p),0);}
const passageChip=h=>`<span class="cite" contenteditable="false" data-paper="${esc(h.paperId)}" data-passage="${esc(h.id)}">${esc(citation(h))}</span>`;
const paperChip=p=>`<span class="cite" contenteditable="false" data-paper="${esc(p.id)}">${esc(`(${citeName(p)}, ${p.year||'n.d.'})`)}</span>`;

function renderOutlineWrite(){
 flushDraft();
 const parts=outlineParts(),nums=partNumbers();
 if(!parts.some(p=>p.id===writePartId))writePartId=parts[0]?.id||null;
 const part=getPart(writePartId),total=parts.reduce((n,p)=>n+partWords(p),0);
 const heading=`<div class="page-heading"><div><h1>Outline</h1><p>Write each chapter and section beside the thoughts you placed there. Everything saves as you type.</p></div><div class="actions">${outlineModeToggle()}<button id="add-chapter">＋ Chapter</button><button id="export-outline" class="primary" ${parts.length?'':'disabled'}>Export Markdown ↗</button></div></div>`;
 if(!part){$('#main').innerHTML=heading+empty('No chapters yet','Add a chapter to start writing. Sections and thoughts can be added any time.');$('#add-chapter').onclick=()=>editPart();return;}
 const cs=part.claimIds.map(getClaim).filter(c=>c&&c.status!=='Abandoned');
 $('#main').innerHTML=heading+`<div class="write-layout">
  <nav class="write-nav" aria-label="Chapters and sections"><div class="write-total">${plural(total,'word')} in total</div>${parts.map((p,i)=>`<button class="write-part level-${p.level}${p.id===part.id?' active':''}" data-write-part="${esc(p.id)}" aria-current="${p.id===part.id}"><span>${nums[p.id]} ${esc(p.title)}</span><small>${(p.level===1?chapterWords(i):partWords(p)).toLocaleString()}</small></button>`).join('')}</nav>
  <section class="write-main"><div class="write-head"><small>${part.level===1?'Chapter':'Section'} ${nums[part.id]}</small><h2>${esc(part.title)}</h2>${part.note?`<p class="write-note">${esc(part.note)}</p>`:''}</div>
   <div class="write-tools" role="toolbar" aria-label="Formatting"><button type="button" data-wfmt="bold" title="Bold (⌘B)" aria-label="Bold"><b>B</b></button><button type="button" data-wfmt="italic" title="Italic (⌘I)" aria-label="Italic"><i>I</i></button><span class="write-status" id="write-status" role="status">${plural(partWords(part),'word')} · saved</span></div>
   <div class="write-editor" id="write-editor" data-part="${esc(part.id)}" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Draft of ${esc(part.title)}" data-placeholder="Start writing this ${part.level===1?'chapter':'section'}… Use the thoughts on the right: Insert adds a thought with its citation, Cite adds a citation where your cursor is.">${sanitizeDraft(part.draft||'')}</div></section>
  <aside class="write-side"><h3>Thoughts here <small>${cs.length}</small></h3>${cs.map(c=>{const ev=liveEvidence(c);return `<div class="write-thought"><p>${esc(c.text)}</p><div class="actions"><button data-write-insert="${esc(c.id)}">Insert thought</button><button class="link" data-claim="${esc(c.id)}">Open ↗</button></div>${ev.map(e=>`<div class="write-ev"><span class="relation-chip rel-${e.relation}">${relations[e.relation]}</span><span>${esc(e.passage.quote.slice(0,110))}${e.passage.quote.length>110?'…':''} <small>${esc(citation(e.passage))}</small></span><button data-write-cite="${esc(e.passage.id)}">Cite</button></div>`).join('')}</div>`;}).join('')||'<p class="claim-hint">No thoughts placed here yet. Switch to Arrange to place some, or cite a paper below.</p>'}
   <h3>Cite a paper</h3><div class="write-cite-paper"><select id="write-paper" aria-label="Paper to cite"><option value="">Choose a paper…</option>${alpha(data.papers).map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select><button id="write-paper-go">Cite</button></div></aside>
 </div>`;
 $('#add-chapter').onclick=()=>editPart();$('#export-outline').onclick=exportOutline;
 bindWriteEditor(part);
}
function bindWriteEditor(part){
 const ed=$('#write-editor');
 // Citation labels follow later corrections to a paper's author or year; citations of deleted papers are marked.
 for(const el of ed.querySelectorAll('.cite')){const p=getPaper(el.dataset.paper),h=el.dataset.passage&&data.passages.find(x=>x.id===el.dataset.passage);if(!p){el.classList.add('cite-missing');el.title='This paper is no longer in your library';continue;}el.textContent=h?citation(h):`(${citeName(p)}, ${p.year||'n.d.'})`;}
 ed.addEventListener('focus',()=>{try{document.execCommand('defaultParagraphSeparator',false,'p');}catch{}});
 ed.addEventListener('input',()=>{$('#write-status').textContent='Saving…';clearTimeout(writeTimer);writeTimer=setTimeout(()=>flushDraft(),500);});
 ed.addEventListener('blur',()=>flushDraft());
 // Pasted text keeps paragraphs, bold and italic only; pictures and other formatting are dropped.
 ed.addEventListener('paste',e=>{
  const html=e.clipboardData?.getData('text/html'),text=e.clipboardData?.getData('text/plain')||'';
  e.preventDefault();
  const clean=html?sanitizeDraft(html):text.split(/\n{2,}|\r\n\r\n/).map(par=>`<p>${esc(par).replace(/\r?\n/g,'<br>')}</p>`).join('');
  document.execCommand('insertHTML',false,clean||esc(text));
 });
 ed.addEventListener('drop',e=>{if([...(e.dataTransfer?.types||[])].includes('Files'))e.preventDefault();});
 // Side-panel buttons insert where the cursor was last in the draft (or at the end).
 const remember=()=>{const s=getSelection();if(s.rangeCount&&ed.contains(s.anchorNode))writeRange=s.getRangeAt(0).cloneRange();};
 document.onselectionchange=remember;
 writeRange=null;
}
function insertInDraft(html){
 const ed=$('#write-editor');if(!ed)return;
 ed.focus();const s=getSelection();s.removeAllRanges();
 if(writeRange&&ed.contains(writeRange.startContainer))s.addRange(writeRange);
 else{const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);s.addRange(r);}
 document.execCommand('insertHTML',false,html+'&nbsp;');
 flushDraft();
}
function flushDraft(){
 clearTimeout(writeTimer);const ed=$('#write-editor'),part=ed&&getPart(ed.dataset.part);if(!ed||!part)return;
 const html=sanitizeDraft(ed.innerHTML);
 if(html!==(part.draft||'')){part.draft=html;if(!save())return;}
 const st=$('#write-status');if(st)st.textContent=`${plural(partWords(part),'word')} · saved`;
 const nav=document.querySelector(`[data-write-part="${CSS.escape(part.id)}"] small`);if(nav)nav.textContent=partWords(part).toLocaleString();
}
document.addEventListener('click',e=>{
 const p=e.target.closest('[data-write-part]');if(p){flushDraft();writePartId=p.dataset.writePart;renderOutlineWrite();return;}
 const f=e.target.closest('[data-wfmt]');if(f){$('#write-editor')?.focus();document.execCommand(f.dataset.wfmt);flushDraft();return;}
 const c=e.target.closest('[data-write-cite]');if(c){const h=data.passages.find(x=>x.id===c.dataset.writeCite);if(h)insertInDraft(passageChip(h));return;}
 const t=e.target.closest('[data-write-insert]');if(t){const cl=getClaim(t.dataset.writeInsert);if(!cl)return;const ev=liveEvidence(cl),lead=ev.find(x=>x.relation==='supports')||ev[0];insertInDraft(`${esc(typeof plainMarks==='function'?plainMarks(cl.text):cl.text)}${lead?' '+passageChip(lead.passage):''}`);return;}
 if(e.target.closest('#write-paper-go')){const p=getPaper($('#write-paper')?.value);if(p)insertInDraft(paperChip(p));else toast('Choose a paper to cite.');}
});
document.addEventListener('mousedown',e=>{if(e.target.closest('[data-wfmt],[data-write-cite],[data-write-insert],#write-paper-go'))e.preventDefault();}); // keep the cursor in the draft
addEventListener('beforeunload',()=>flushDraft());
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushDraft();});
