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
 const heading=`<div class="page-heading"><div><h1>Outline</h1><p>Write each section and subsection beside the thoughts you placed there. Everything saves as you type.</p></div><div class="actions">${outlineModeToggle()}<button id="add-chapter">＋ Section</button><button id="export-text" class="primary" ${parts.length?'':'disabled'}>Export text ↗</button></div></div>`;
 if(!part){$('#main').innerHTML=heading+empty('No sections yet','Add a section to start writing. Subsections and thoughts can be added any time.');$('#add-chapter').onclick=()=>editPart();return;}
 const cs=part.claimIds.map(getClaim).filter(c=>c&&c.status!=='Abandoned');
 $('#main').innerHTML=heading+`<div class="write-layout">
  <nav class="write-nav" aria-label="Sections and subsections"><div class="write-total">${plural(total,'word')} in total</div>${parts.map((p,i)=>`<button class="write-part level-${p.level}${p.id===part.id?' active':''}" data-write-part="${esc(p.id)}" aria-current="${p.id===part.id}"><span>${nums[p.id]} ${esc(p.title)}</span><small>${(p.level===1?chapterWords(i):partWords(p)).toLocaleString()}</small></button>`).join('')}</nav>
  <section class="write-main"><div class="write-head"><small>${part.level===1?'Section':'Subsection'} ${nums[part.id]}</small><h2>${esc(part.title)}</h2>${part.note?`<p class="write-note">${esc(part.note)}</p>`:''}</div>
   <div class="write-tools" role="toolbar" aria-label="Formatting"><button type="button" data-wfmt="bold" title="Bold (⌘B)" aria-label="Bold"><b>B</b></button><button type="button" data-wfmt="italic" title="Italic (⌘I)" aria-label="Italic"><i>I</i></button><button type="button" data-wcase title="Change case: Sentence → Title → UPPER → lower" aria-label="Change case">Aa</button><span class="write-status" id="write-status" role="status">${plural(partWords(part),'word')} · saved</span></div>
   <div class="write-editor" id="write-editor" data-part="${esc(part.id)}" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Draft of ${esc(part.title)}" data-placeholder="Start writing this ${part.level===1?'section':'subsection'}… Use the thoughts on the right: Insert adds a thought with its citation, Cite adds a citation where your cursor is.">${sanitizeDraft(part.draft||'')}</div></section>
  <aside class="write-side"><h3>Thoughts here <small>${cs.length}</small></h3>${cs.map(c=>{const ev=liveEvidence(c);return `<div class="write-thought"><p>${esc(c.text)}</p><div class="actions"><button data-write-insert="${esc(c.id)}">Insert thought</button><button class="link" data-claim="${esc(c.id)}">Open ↗</button></div>${ev.map(e=>`<div class="write-ev"><span class="relation-chip rel-${e.relation}">${relations[e.relation]}</span><span>${esc(e.passage.quote.slice(0,110))}${e.passage.quote.length>110?'…':''} <small>${esc(citation(e.passage))}</small></span><span class="write-ev-btns"><button data-write-quote="${esc(e.passage.id)}">Quote</button><button data-write-cite="${esc(e.passage.id)}">Cite</button></span></div>`).join('')}</div>`;}).join('')||'<p class="claim-hint">No thoughts placed here yet. Switch to Arrange to place some, or cite a paper below.</p>'}
   <h3>Quote or cite any passage</h3><div class="write-cite-paper"><select id="write-passage" aria-label="Passage to quote or cite"><option value="">Choose a passage…</option>${alpha(data.papers).map(p=>{const hs=data.passages.filter(h=>h.paperId===p.id);return hs.length?`<optgroup label="${esc(p.title.slice(0,70))}">${hs.map(h=>`<option value="${esc(h.id)}">${esc(h.location)} · ${esc(h.quote.slice(0,70))}</option>`).join('')}</optgroup>`:'';}).join('')}</select><button id="write-passage-quote">Quote</button><button id="write-passage-cite">Cite</button></div>
   <h3>Cite a paper</h3><div class="write-cite-paper"><select id="write-paper" aria-label="Paper to cite"><option value="">Choose a paper…</option>${alpha(data.papers).map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('')}</select><button id="write-paper-go">Cite</button></div></aside>
 </div>`;
 $('#add-chapter').onclick=()=>editPart();$('#export-text').onclick=exportWriting;
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
 const s=getSelection(),live=s.rangeCount&&ed.contains(s.anchorNode)?s.getRangeAt(0).cloneRange():null;
 ed.focus();s.removeAllRanges();
 if(live)s.addRange(live);
 else if(writeRange&&ed.contains(writeRange.startContainer))s.addRange(writeRange);
 else{const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);s.addRange(r);}
 document.execCommand('insertHTML',false,html+'&nbsp;');
 flushDraft();
}
/* Aa: change the case of the selected words in place, keeping bold/italic; citation chips are left alone. */
function caseInDraft(){
 const ed=$('#write-editor'),sel=getSelection();
 if(!ed||!sel.rangeCount||sel.isCollapsed||!ed.contains(sel.anchorNode))return toast('Select some words first.');
 const range=sel.getRangeAt(0),root=range.commonAncestorContainer.nodeType===3?range.commonAncestorContainer.parentNode:range.commonAncestorContainer;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>range.intersectsNode(n)&&!n.parentElement.closest('.cite')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
 const segs=[];for(let n=walker.nextNode();n;n=walker.nextNode())segs.push({n,a:n===range.startContainer?range.startOffset:0,b:n===range.endContainer?range.endOffset:n.data.length});
 if(!segs.length)return;
 const full=segs.map(s=>s.n.data.slice(s.a,s.b)).join(''),out=cycleCase(full);let pos=0;
 for(const s of segs){const len=s.b-s.a,piece=out.length===full.length?out.slice(pos,pos+len):cycleCase(s.n.data.slice(s.a,s.b));pos+=len;s.n.data=s.n.data.slice(0,s.a)+piece+s.n.data.slice(s.b);}
 const r=document.createRange();r.setStart(segs[0].n,segs[0].a);r.setEnd(segs.at(-1).n,segs.at(-1).b);sel.removeAllRanges();sel.addRange(r);
 flushDraft();
}
/* Quote: the passage in quotation marks, then its citation. APA sets quotes of 40+ words as an indented block. */
function quoteInDraft(id){
 const h=data.passages.find(x=>x.id===id);if(!h)return;
 const text=h.quote.trim().replace(/^[“"']+|[”"']+$/g,'');
 insertInDraft(`“${esc(text)}” ${passageChip(h)}`);
 if(wordCount(text)>=40)toast('Quotes of 40 words or more go in an indented block in APA style; indent it when you finish in Word.',7000);
}
/* ---------- Export the writing ---------- */
const htmlCitesToText=html=>sanitizeDraft(html).replace(/<span class="cite"[^>]*>([^<]*)<\/span>/g,'$1');
function writingParts(scope){return scope==='section'?[getPart(writePartId)].filter(Boolean):outlineParts();}
function citedPapers(parts){const ids=new Set(parts.flatMap(p=>citesIn(p.draft||'').map(c=>c.paper)));return data.papers.filter(p=>ids.has(p.id)).sort((a,b)=>collator.compare(citeName(a),citeName(b)));}
function writingHTML(scope,refs){
 const nums=partNumbers(),parts=writingParts(scope);
 const body=parts.map(p=>`<h${p.level===1?2:3}>${scope==='section'?'':nums[p.id]+' '}${esc(p.title)}</h${p.level===1?2:3}>${htmlCitesToText(p.draft||'')}`).join('');
 const ps=refs?citedPapers(parts):[];
 return body+(ps.length?`<h2>References</h2>${ps.map(p=>`<p class="ref">${(p.apa?apaHTML(p.apa):esc(reference(p)).replace(/\*([^*]+)\*/g,'<i>$1</i>'))}</p>`).join('')}`:'');
}
function writingMarkdown(scope,refs){
 const nums=partNumbers(),parts=writingParts(scope),ps=refs?citedPapers(parts):[];
 return [...parts.map(p=>`${p.level===1?'##':'###'} ${scope==='section'?'':nums[p.id]+' '}${p.title}\n\n${draftToMarkdown(p.draft||'')}`),...(ps.length?[`## References\n\n${ps.map(p=>`- ${reference(p)}`).join('\n')}`]:[])].join('\n\n').replace(/\n{3,}/g,'\n\n')+'\n';
}
function writingText(scope,refs){
 const nums=partNumbers(),parts=writingParts(scope),ps=refs?citedPapers(parts):[];
 return [...parts.map(p=>`${scope==='section'?'':nums[p.id]+' '}${p.title}\n\n${draftPlain(p.draft||'').replace(/\n/g,'\n\n')}`),...(ps.length?[`References\n\n${ps.map(p=>apaPlain(reference(p))).join('\n')}`]:[])].join('\n\n\n')+'\n';
}
function downloadFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportWriting(){
 flushDraft();const part=getPart(writePartId);
 modal('Export your writing',`<p>Copy keeps headings, bold, italics and citations when pasted into Word, Google Docs or Pages.</p><form class="write-export"><label class="batch-check"><input type="radio" name="scope" value="section" checked> This ${part?.level===1?'section':'subsection'}: “${esc(part?.title||'')}”</label><label class="batch-check"><input type="radio" name="scope" value="all"> The whole draft, with numbered headings</label><label class="batch-check"><input type="checkbox" name="refs" checked> Add a References list of the papers cited</label><div class="actions"><button type="button" data-wexport="copy" class="primary">Copy</button><button type="button" data-wexport="doc">Download for Word (.doc)</button><button type="button" data-wexport="md">Markdown</button><button type="button" data-wexport="txt">Plain text</button></div></form>`);
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-wexport]');if(!b)return;
 const f=b.closest('form'),scope=f.querySelector('[name=scope]:checked').value,refs=f.querySelector('[name=refs]').checked,kind=b.dataset.wexport;
 const name=(scope==='section'?getPart(writePartId)?.title:'Draft')||'Draft',file=name.replace(/[\\/:*?"<>|]+/g,' ').slice(0,60).trim();
 if(kind==='copy'){
  const html=writingHTML(scope,refs),text=writingText(scope,refs);
  try{if(window.ClipboardItem&&navigator.clipboard?.write)await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);else await navigator.clipboard.writeText(text);toast('Copied. Paste it into your document.');}
  catch{toast('Could not copy automatically; use a download instead.');}
 }
 // Word opens an HTML document saved as .doc; set in Times New Roman 12 pt, double-spaced, with hanging-indent references.
 if(kind==='doc')downloadFile(file+'.doc',`<html><head><meta charset="utf-8"><title>${esc(name)}</title><style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:2}h2{font-size:14pt}h3{font-size:12pt}p{margin:0 0 12pt}p.ref{padding-left:.5in;text-indent:-.5in}</style></head><body>${writingHTML(scope,refs)}</body></html>`,'application/msword');
 if(kind==='md')downloadFile(file+'.md',writingMarkdown(scope,refs),'text/markdown');
 if(kind==='txt')downloadFile(file+'.txt',writingText(scope,refs),'text/plain');
});
function flushDraft(){
 clearTimeout(writeTimer);const ed=$('#write-editor'),part=ed&&getPart(ed.dataset.part);if(!ed||!part)return;
 const html=sanitizeDraft(ed.innerHTML);
 if(html!==(part.draft||'')){part.draft=html;if(!save())return;}
 const st=$('#write-status');if(st)st.textContent=`${plural(partWords(part),'word')} · saved`;
 const nav=document.querySelector(`[data-write-part="${CSS.escape(part.id)}"] small`);if(nav)nav.textContent=partWords(part).toLocaleString();
}
document.addEventListener('click',e=>{
 const p=e.target.closest('[data-write-part]');if(p){flushDraft();writePartId=p.dataset.writePart;renderOutlineWrite();return;}
 if(e.target.closest('[data-wcase]')){caseInDraft();return;}
 const f=e.target.closest('[data-wfmt]');if(f){$('#write-editor')?.focus();document.execCommand(f.dataset.wfmt);flushDraft();return;}
 const q=e.target.closest('[data-write-quote]');if(q){quoteInDraft(q.dataset.writeQuote);return;}
 if(e.target.closest('#write-passage-quote')||e.target.closest('#write-passage-cite')){const id=$('#write-passage')?.value;if(!id)return toast('Choose a passage first.');if(e.target.closest('#write-passage-quote'))quoteInDraft(id);else{const h=data.passages.find(x=>x.id===id);if(h)insertInDraft(passageChip(h));}return;}
 const c=e.target.closest('[data-write-cite]');if(c){const h=data.passages.find(x=>x.id===c.dataset.writeCite);if(h)insertInDraft(passageChip(h));return;}
 const t=e.target.closest('[data-write-insert]');if(t){const cl=getClaim(t.dataset.writeInsert);if(!cl)return;const ev=liveEvidence(cl),lead=ev.find(x=>x.relation==='supports')||ev[0];insertInDraft(`${esc(typeof plainMarks==='function'?plainMarks(cl.text):cl.text)}${lead?' '+passageChip(lead.passage):''}`);return;}
 if(e.target.closest('#write-paper-go')){const p=getPaper($('#write-paper')?.value);if(p)insertInDraft(paperChip(p));else toast('Choose a paper to cite.');}
});
document.addEventListener('mousedown',e=>{if(e.target.closest('[data-write-quote],#write-passage-quote,#write-passage-cite,[data-wcase],[data-wfmt],[data-write-cite],[data-write-insert],#write-paper-go'))e.preventDefault();}); // keep the cursor in the draft
addEventListener('beforeunload',()=>flushDraft());
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushDraft();});
