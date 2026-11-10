'use strict';
/* Ask AI: a side chat panel you can open on any page. It talks to Claude or ChatGPT through ai-bridge.mjs, a
   small helper running on this computer that uses your Claude Code or Codex (ChatGPT) login, so there is no API
   key or extra cost. Choose the assistant at the top of the panel; each reply is labelled with who wrote it.
   With "Include this page" on, each message carries what you are looking at (the paper and its passages, the
   PDF page, your selection, a thought, or the section you are writing), so you can ask about it directly.
   The conversation is kept in this browser only. */
const AC_URL='http://127.0.0.1:8790';
// About 100k tokens at most per message: room for a long article or a book chapter, within the assistants' context.
const AC_PDF_MAX=300000,AC_CONTEXT_MAX=400000;
const acLoad=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}};
const acStore=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
let acKey=acLoad('theesees-bridge-key',''),acChat=acLoad('theesees-chat',[]),acWithPage=acLoad('theesees-chat-page',true),acWithOverview=acLoad('theesees-chat-overview',true),acWithLibrary=acLoad('theesees-chat-library',true);
// Assistant and model, remembered on this browser (each assistant keeps its own model choice).
const AC_WHO={claude:{name:'Claude',via:'Claude Code',models:[['','Default model'],['sonnet','Sonnet'],['opus','Opus'],['haiku','Haiku']]},chatgpt:{name:'ChatGPT',via:'Codex',models:[['','Default'],['low','Quick'],['high','Thorough']]}};
let acAssistant=AC_WHO[acLoad('theesees-chat-assistant','claude')]?acLoad('theesees-chat-assistant','claude'):'claude',acHave={claude:true,chatgpt:true};
const acModelKey=()=>`theesees-chat-model-${acAssistant}`;
let acModel=acLoad(acModelKey(),acAssistant==='claude'?acLoad('theesees-chat-model',''):''),acWeb=acLoad('theesees-chat-web',true),acAbort=null,acStatus='unknown';

function acMount(){
 if($('#ask-claude-panel'))return;
 document.body.insertAdjacentHTML('beforeend',`<button class="ask-claude-open" id="ask-claude-open" aria-controls="ask-claude-panel" aria-expanded="false">Ask AI</button>
 <aside class="ask-claude-panel" id="ask-claude-panel" aria-label="Ask AI" hidden>
  <div class="ac-resize" id="ac-resize" role="separator" aria-orientation="vertical" aria-label="Resize the chat panel" tabindex="0" title="Drag to resize · double-click to reset"></div>
  <header><div><strong>Ask AI</strong><div class="view-toggle ac-who" role="group" aria-label="Assistant">${Object.entries(AC_WHO).map(([k,w])=>`<button type="button" data-ac-who="${k}" aria-pressed="${k===acAssistant}">${w.name}</button>`).join('')}</div><small id="ac-status"></small></div><div class="actions"><button id="ac-context" title="Your notes for the AI, and the project overview it receives">What the AI knows</button><button id="ac-setup-help" title="How to set up Ask AI on this computer">Setup</button><button id="ac-new" title="Start a new conversation">New chat</button><button id="ac-close" aria-label="Close">×</button></div></header>
  <div class="ac-body" id="ac-body"></div>
  <form class="ac-form" id="ac-form">
   <div class="ac-include"><span>Include</span><label class="ac-page" title="What you are looking at now"><input type="checkbox" id="ac-with-page" ${acWithPage?'checked':''}> this page <span id="ac-page-what"></span></label><label title="Your research question, notes for the AI, papers, themes, thoughts, outline and recent discussions"><input type="checkbox" id="ac-with-overview" ${acWithOverview?'checked':''}> project overview</label><label title="Passages, PDF pages, comments, thoughts and drafts from all your papers that share words with your question"><input type="checkbox" id="ac-with-library" ${acWithLibrary?'checked':''}> library search</label></div>
   <textarea id="ac-input" rows="3" placeholder="Ask about this paper, a passage, your draft…" aria-label="Message to the AI"></textarea>
   <div class="ac-send-row"><label class="ac-web" title="Let the assistant search the web for sources and links. It never touches your files."><input type="checkbox" id="ac-web" ${acWeb?'checked':''}> Web search</label><select id="ac-model" aria-label="Model"></select><button type="submit" class="primary" id="ac-send">Send</button></div>
  </form>
 </aside>`);
 acModelOptions();acWhoStatus();
 $$('[data-ac-who]').forEach(b=>b.onclick=()=>acSwitch(b.dataset.acWho));acSetWidth(acLoad('theesees-chat-width',AC_W));acBindResize();
 $('#ask-claude-open').onclick=()=>acToggle(true);$('#ac-close').onclick=()=>acToggle(false);
 $('#ac-new').onclick=()=>{acAbort?.abort();acChat=[];acStore('theesees-chat',acChat);acRender();$('#ac-input').focus();};
 $('#ac-with-page').onchange=e=>{acWithPage=e.target.checked;acStore('theesees-chat-page',acWithPage);acPageLabel();};
 $('#ac-with-overview').onchange=e=>{acWithOverview=e.target.checked;acStore('theesees-chat-overview',acWithOverview);};
 $('#ac-with-library').onchange=e=>{acWithLibrary=e.target.checked;acStore('theesees-chat-library',acWithLibrary);};
 $('#ac-context').onclick=()=>editAiNotes();
 $('#ac-setup-help').onclick=()=>modal('Set up Ask AI',acGuideHTML());
 // Copy buttons in the setup guide (in the panel or its dialog).
 document.addEventListener('click',e=>{const b=e.target.closest('[data-ac-copy-cmd]');if(b)navigator.clipboard.writeText(b.dataset.acCopyCmd).then(()=>{b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1500);},()=>toast('Couldn’t copy. Select the command and copy it instead.'));});
 $('#ac-body').addEventListener('click',e=>{const s=e.target.closest('[data-ac-save]');if(s)acSaveReply(Number(s.dataset.acSave));const c=e.target.closest('[data-ac-copy]');if(c)navigator.clipboard.writeText(acChat[Number(c.dataset.acCopy)]?.content||'').then(()=>toast('Answer copied.'),()=>toast('Couldn’t copy.'));});
 $('#ac-model').onchange=e=>{acModel=e.target.value;acStore(acModelKey(),acModel);};
 $('#ac-web').onchange=e=>{acWeb=e.target.checked;acStore('theesees-chat-web',acWeb);};
 $('#ac-form').onsubmit=e=>{e.preventDefault();acSend();};
 $('#ac-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();acSend();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#ask-claude-panel').hidden&&!$('#modal')?.open)acToggle(false);});
}
/* Resizing: drag the panel's left edge (or focus it and use ← →); double-click puts it back to the default.
   The width is remembered on this browser; on wide screens the page makes room for the panel. */
const AC_W=400;
function acSetWidth(w){
 const max=Math.max(320,innerWidth-360),width=Math.round(Math.min(max,Math.max(300,Number(w)||AC_W)));
 document.documentElement.style.setProperty('--ac-w',width+'px');$('#ac-resize')?.setAttribute('aria-valuenow',String(width));return width;
}
function acBindResize(){
 const h=$('#ac-resize');let dragging=false;
 h.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;h.setPointerCapture(e.pointerId);document.body.classList.add('ac-resizing');e.preventDefault();});
 h.addEventListener('pointermove',e=>{if(dragging)acSetWidth(innerWidth-e.clientX);});
 const end=()=>{if(!dragging)return;dragging=false;document.body.classList.remove('ac-resizing');acStore('theesees-chat-width',parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ac-w')));};
 h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);
 h.addEventListener('dblclick',()=>acStore('theesees-chat-width',acSetWidth(AC_W)));
 h.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();const now=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ac-w'))||AC_W;acStore('theesees-chat-width',acSetWidth(now+(e.key==='ArrowLeft'?40:-40)));});
 addEventListener('resize',()=>acSetWidth(acLoad('theesees-chat-width',AC_W)));
}
function acModelOptions(){const sel=$('#ac-model');if(!sel)return;sel.innerHTML=AC_WHO[acAssistant].models.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');sel.value=AC_WHO[acAssistant].models.some(([v])=>v===acModel)?acModel:'';sel.title=acAssistant==='chatgpt'?'How much thinking ChatGPT does: Quick answers sooner, Thorough reasons longer':'Claude model';}
function acWhoStatus(){const el=$('#ac-status');if(!el)return;const w=AC_WHO[acAssistant];el.textContent=acStatus==='ready'?(acHave[acAssistant]?`Connected · ${w.name} via ${w.via} on this computer`:`${w.via} isn’t installed (or signed in) on this computer`):acStatus==='badkey'?'The key doesn’t match the bridge':acStatus==='off'?'The helper isn’t running on this computer: in Terminal, in the Theesees folder, run node ai-bridge.mjs':`${w.name} via ${w.via} on this computer`;
 $$('[data-ac-who]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.acWho===acAssistant));b.title=acHave[b.dataset.acWho]?'':`${AC_WHO[b.dataset.acWho].via} wasn’t found on this computer`;});}
// Switch assistant; the conversation carries on (each reply is labelled with who wrote it).
function acSwitch(who){if(!AC_WHO[who]||who===acAssistant)return;acAssistant=who;acStore('theesees-chat-assistant',who);acModel=acLoad(acModelKey(),'');acModelOptions();acWhoStatus();}
function acToggle(open){
 const panel=$('#ask-claude-panel');panel.hidden=!open;document.body.classList.toggle('ask-claude-on',open);
 $('#ask-claude-open').setAttribute('aria-expanded',String(open));
 if(open){acPageLabel();acRender();acCheck();$('#ac-input').focus();}
}
async function acCheck(){
 if(!acKey){acStatus='setup';acRender();return;}
 try{const r=await fetch(AC_URL+'/health',{headers:{Authorization:'Bearer '+acKey}});acStatus=r.ok?'ready':r.status===401?'badkey':'off';if(r.ok){const h=await r.json().catch(()=>({}));if(h.assistants)acHave={claude:h.assistants.claude!==false,chatgpt:h.assistants.chatgpt!==false};}}
 catch{acStatus='off';}
 acWhoStatus();
 acRender();
}
/* First-time setup, step by step. Shown on the setup screen and behind the panel's Setup button. */
const acCmd=c=>`<pre class="ac-cmd"><code>${esc(c)}</code><button type="button" class="ac-copy" data-ac-copy-cmd="${esc(c)}" aria-label="Copy command">Copy</button></pre>`;
function acGuideHTML(){return `<div class="ac-guide">
 <p>Ask AI runs Claude or ChatGPT through a small helper on your own computer, using the subscription you already have (no API key, no extra cost). Do steps 1–3 once on each computer; after that, only step 4 each time you want to chat.</p>
 <ol>
  <li><strong>Check Node.js</strong> (version 18 or newer). In Terminal, run:${acCmd('node --version')}If you see “command not found”, install the LTS version from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a>, then open a new Terminal window.</li>
  <li><strong>Install an assistant and sign in once.</strong> You need at least one.
   <ul><li><strong>Claude</strong> (Claude Code):${acCmd('npm install -g @anthropic-ai/claude-code')}then run <code>claude</code> once and sign in with your Claude account. Type <code>/exit</code> to leave.</li>
   <li><strong>ChatGPT</strong> (Codex):${acCmd('npm install -g @openai/codex')}then sign in with your ChatGPT account:${acCmd('codex login')}</li></ul></li>
  <li><strong>Get the Theesees folder</strong> (it contains the helper). In Terminal:${acCmd('git clone https://github.com/Pineebubble/Theesees.git')}Or download it from GitHub with <em>Code → Download ZIP</em> and unzip it. If you already have it, update it with <code>git pull</code> inside the folder.</li>
  <li><strong>Start the helper.</strong> In Terminal, go into the folder and start it:${acCmd('cd Theesees')}${acCmd('node ai-bridge.mjs')}Leave this window open while you chat (Ctrl+C stops it). It lists which assistants it found.</li>
  <li><strong>Connect this browser.</strong> Copy the key the helper prints, paste it into the Ask AI panel and click Connect (once per browser). If Chrome asks to let the site access devices on your local network, click Allow.</li>
 </ol>
 <h4>If something goes wrong</h4>
 <dl>
  <dt>“The helper isn’t running”</dt><dd>Start it as in step 4 and keep the window open.</dd>
  <dt>“Port 8790 is in use”</dt><dd>The helper is already running in another Terminal window, so just use that one. To restart it, press Ctrl+C there first.</dd>
  <dt>“…isn’t installed (or signed in) on this computer”</dt><dd>Do step 2 for that assistant, then restart the helper.</dd>
  <dt>“The key doesn’t match”</dt><dd>Copy the key again from the helper’s window. Each computer has its own key; <code>node ai-bridge.mjs --new-key</code> makes a new one.</dd>
  <dt>“No answer came back”</dt><dd>The assistant may need signing in again: run <code>claude</code> or <code>codex login</code> once.</dd>
 </dl>
 <p class="help">Privacy: the helper only answers Theesees, only with your key, and only on this computer. The assistants run with their tools switched off, so they can’t read your files or run anything; they only search the web when you tick Web search.</p>
</div>`;}
const acSetupHTML=msg=>`<div class="ac-setup"><p>${msg}</p><form id="ac-key-form"><label for="ac-key">Key from the helper</label><div class="ac-key-row"><input id="ac-key" placeholder="Paste the key here" autocomplete="off" value="${esc(acKey)}"><button class="primary">Connect</button></div></form><details class="ac-guide-box" ${acKey?'':'open'}><summary>First-time setup</summary>${acGuideHTML()}</details></div>`;
function acRender(){
 const body=$('#ac-body');if(!body)return;
 if(acStatus==='setup'||acStatus==='badkey'||acStatus==='off'&&!acChat.length){
  body.innerHTML=acSetupHTML(acStatus==='badkey'?'That key doesn’t match the one the bridge printed. Paste it again.':acStatus==='off'&&acKey?'The helper isn’t running on this computer. Start it again (step 1 below), then reopen this panel.':'Chat with Claude or ChatGPT about what you are reading or writing.');
  $('#ac-key-form').onsubmit=e=>{e.preventDefault();acKey=$('#ac-key').value.trim();acStore('theesees-bridge-key',acKey);acCheck();};
  return;
 }
 body.innerHTML=acChat.length?acChat.map((m,i)=>`<div class="ac-msg ${m.role}">${m.role==='user'?`${m.page?`<small>With: ${esc(m.page)}</small>`:''}<p>${esc(m.content).replace(/\n/g,'<br>')}</p>`:`<small class="ac-who-tag">${esc(AC_WHO[m.who||'claude'].name)}</small>`+(acMarkdown(m.content)||'<p class="ac-typing">Thinking…</p>')+(m.content&&!(acAbort&&i===acChat.length-1)&&!/^⚠︎/.test(m.content)?`<div class="ac-msg-actions">${m.saved?'<span>Saved ✓</span>':`<button data-ac-save="${i}">Keep this answer</button>`}<button data-ac-copy="${i}">Copy</button></div>`:'')}</div>`).join(''):`<div class="ac-empty"><p>Ask anything about what you're looking at. For example:</p><button data-ac-try>Summarise this paper's argument in three points</button><button data-ac-try>Which of my passages support each other?</button><button data-ac-try>Suggest a clearer way to say my last paragraph</button></div>`;
 body.querySelectorAll('[data-ac-try]').forEach(b=>b.onclick=()=>{$('#ac-input').value=b.textContent;$('#ac-input').focus();});
 body.scrollTop=body.scrollHeight;
}
// Small, safe Markdown: everything is escaped first, then bold, italics, code, lists and paragraphs.
function acMarkdown(s){
 // Links: only http(s), opened in a new tab without access back to this page.
 const inline=t=>esc(t).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,'$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>');
 // Line by line, so a heading never swallows the list under it.
 const out=[];let para=[],list=null;
 const flushPara=()=>{if(para.length){out.push(`<p>${para.map(inline).join('<br>')}</p>`);para=[];}};
 const flushList=()=>{if(list){out.push(`<${list.tag}${list.start>1?` start="${list.start}"`:''}>${list.items.map(x=>`<li>${inline(x)}</li>`).join('')}</${list.tag}>`);list=null;}};
 for(const line of String(s).trim().split('\n')){
  if(!line.trim()){flushPara();flushList();continue;}
  const h=line.match(/^\s*#{1,6}\s+(.*)$/),rule=/^\s*([-*_])(\s*\1){2,}\s*$/.test(line),item=line.match(/^\s*([-*•+]|(\d+)[.)])\s+(.*)$/);
  if(h){flushPara();flushList();out.push(`<p class="ac-h"><strong>${inline(h[1].replace(/^\*\*(.*)\*\*$/,'$1'))}</strong></p>`);continue;}
  if(rule){flushPara();flushList();out.push('<hr>');continue;}
  if(item){
   flushPara();const tag=item[2]?'ol':'ul';
   if(list&&list.tag!==tag)flushList();
   list||={tag,items:[],start:Number(item[2]||1)};list.items.push(item[3]);continue;
  }
  if(list&&/^\s{2,}\S/.test(line)){list.items[list.items.length-1]+=' '+line.trim();continue;} // a wrapped list item
  flushList();para.push(line);
 }
 flushPara();flushList();
 return out.join('');
}
/* What "Include this page" sends: a short label for the panel, and the text for the AI. */
function acPageContext(){
 const sel=getSelection?.()?.toString().trim().slice(0,4000);
 const parts=[];let label='';
 const paperBits=p=>{const ks=p.keywords.map(getKeyword).filter(Boolean).map(k=>k.title);return [`Paper: ${p.title}${p.author||p.year?` (${[p.author,p.year].filter(Boolean).join(', ')})`:''}`,p.apa?`Reference: ${p.apa.replace(/\*/g,'')}`:'',ks.length?`Themes: ${ks.join(', ')}`:'',p.relevance?`Why it matters to the user: ${p.relevance}`:''].filter(Boolean).join('\n');};
 if(page==='reader'&&getPaper(currentPaper)){
  const p=getPaper(currentPaper),hs=data.passages.filter(h=>h.paperId===p.id);label=p.title;parts.push(paperBits(p));
  if(hs.length)parts.push(`All ${hs.length} passages the user saved from it:\n`+hs.map(h=>`- “${h.quote.slice(0,1500)}” (${h.location})`).join('\n'));
  // Discussions linked to this paper: their notes, comments (the user's and pasted AI replies) and imported chats.
  const ts=data.threads.filter(t=>threadPapers(t).some(q=>q.id===p.id)).slice(0,15);
  if(ts.length)parts.push('Discussions about this paper:\n'+ts.map(t=>{
   const cm=(t.blocks||[]).filter(b=>!b.deleted).slice(-30).map(b=>`  - ${b.role==='AI'?'AI reply':'User'}: ${String(b.text||'').replace(/\s+/g,' ').slice(0,900)}${b.source?.quote?` [on “${b.source.quote.slice(0,160)}”]`:''}`).join('\n');
   return `• “${t.title}” (${t.status||'Open'})${t.note?`\n  User's note: ${t.note.slice(0,900)}`:''}${t.transcript?`\n  Imported conversation (excerpt): ${t.transcript.replace(/\s+/g,' ').slice(0,2500)}`:''}${cm?`\n  Comments:\n${cm}`:''}`;
  }).join('\n'));
  // The whole text: every PDF page (marked with its printed page number), or the pasted text.
  if(typeof usingPDF==='function'&&usingPDF(p)&&pdfState?.paperId===p.id&&pdfState.doc){
   const st=pdfState,clean=t=>typeof cleanForTranslation==='function'?cleanForTranslation(t):t;let pdf='',upto=0;
   for(let n=1;n<=st.doc.numPages;n++){const tc=st.tc?.[n];if(!tc)continue;const t=clean(tc.items.map(i=>i.str+(i.hasEOL?'\n':'')).join(''));if(!t)continue;if(pdf.length+t.length>AC_PDF_MAX)break;pdf+=`\n[${typeof pdfPageName==='function'?pdfPageName(n):'p. '+n}]\n${t}\n`;upto=n;}
   if(pdf)parts.push(`Full text of the PDF${upto<st.doc.numPages?` (pages 1–${upto} of ${st.doc.numPages}; the rest was too long to include)`:` (${st.doc.numPages} pages)`}; page markers like [p. 12] give the printed page:${pdf}`);
   else parts.push('The PDF has no selectable text (it may be scanned), so only the passages above are available.');
   if(typeof pdfCurrentPage==='function')parts.push(`The user is currently looking at ${typeof pdfPageName==='function'?pdfPageName(pdfCurrentPage()):'page '+pdfCurrentPage()}.`);
   label=p.title+' · whole PDF';
  }else if(p.text){parts.push(`Full text of the paper${p.text.length>AC_PDF_MAX?' (start; the rest was too long to include)':''}:\n`+p.text.slice(0,AC_PDF_MAX));label=p.title+' · full text';}
 }else if(page==='claim'&&typeof getClaim==='function'&&getClaim(currentClaim)){
  const c=getClaim(currentClaim);label='Thought: '+c.text.slice(0,50);
  parts.push(`The user's thought (${c.status}): ${c.text}`);
  const ev=typeof liveEvidence==='function'?liveEvidence(c):[];
  if(ev.length)parts.push('Evidence linked to it:\n'+ev.map(e=>`- ${e.relation}: “${e.passage.quote.slice(0,500)}” ${typeof citation==='function'?citation(e.passage):''}`).join('\n'));
 }else if(page==='outline'&&typeof getPart==='function'&&typeof writePartId!=='undefined'&&getPart(writePartId)&&outlineMode==='write'){
  if(typeof flushDraft==='function')flushDraft();
  const s=getPart(writePartId);label='Writing: '+s.title;
  parts.push(`The user is writing the section “${s.title}”${s.note?` (its argument: ${s.note})`:''}. Their draft so far:\n`+(draftPlain(s.draft||'')||'(empty)').slice(0,12000));
  const cs=s.claimIds.map(getClaim).filter(Boolean);if(cs.length)parts.push('Thoughts placed in this section:\n'+cs.map(c=>`- ${c.text}`).join('\n'));
 }else if(page==='thread'&&data.threads.find(t=>t.id===currentThread)){
  const t=data.threads.find(t=>t.id===currentThread);label='Discussion: '+t.title;
  parts.push(`Discussion: ${t.title}`);const hs=threadPassages(t);if(hs.length)parts.push('Linked passages:\n'+hs.map(h=>`- “${h.quote.slice(0,600)}” (${getPaper(h.paperId)?.title}, ${h.location})`).join('\n'));
  const cm=(t.blocks||[]).filter(b=>!b.deleted).slice(-20);if(cm.length)parts.push('Recent comments:\n'+cm.map(b=>`- ${String(b.text).slice(0,600)}`).join('\n'));
 }else{
  label='Your literature list';
  parts.push('Papers in the user\'s literature list:\n'+data.papers.slice(0,120).map(p=>`- ${p.title}${p.author?` — ${p.author}`:''}${p.year?` (${p.year})`:''} [${p.status}]`).join('\n'));
  if(data.keywords.length)parts.push('Themes: '+data.keywords.map(k=>k.title).join(', '));
 }
 if(sel)parts.push(`Text the user has selected:\n“${sel}”`);
 return {label:label+(sel?' + selection':''),text:parts.join('\n\n').slice(0,AC_CONTEXT_MAX)};
}
function acPageLabel(){const el=$('#ac-page-what');if(el)el.textContent=acWithPage?`(${acPageContext().label.slice(0,48)})`:'';}
async function acSend(){
 const input=$('#ac-input'),text=input.value.trim();
 if(acAbort){acAbort.abort();return;} // the button doubles as Stop
 if(!text)return;
 if(acStatus!=='ready'){await acCheck();if(acStatus!=='ready')return;}
 if(acWithPage&&page==='reader'&&pdfState?.indexReady){$('#ac-status').textContent='Reading the PDF…';await pdfState.indexReady;acWhoStatus();}
 const ctx=acWithPage?acPageContext():null;
 // Library search: make sure every PDF's text has been read (once; cached afterwards).
 if(acWithLibrary&&typeof indexAllPdfs==='function'&&data.papers.some(p=>p.pdfName&&!searchPdfText.has(p.id))){$('#ac-status').textContent='Reading your PDFs for library search (first time only)…';await indexAllPdfs();acWhoStatus();}
 const lib=acWithLibrary&&typeof acLibrary==='function'?acLibrary(text,acWithPage&&page==='reader'?currentPaper:null):null,ov=acWithOverview&&typeof acOverview==='function'?acOverview():'';
 const context=[ov&&`=== Project overview ===\n${ov}`,lib?.count?`=== From the researcher's library: keyword matches for ${lib.kws.join(', ')} (may be incomplete or partly off-topic) ===\n${lib.text}`:'',ctx?.text&&`=== What the researcher is looking at now ===\n${ctx.text}`].filter(Boolean).join('\n\n');
 const label=[ctx?.label,ov&&'project overview',lib&&(lib.count?plural(lib.count,'library match','library matches'):'no library matches')].filter(Boolean).join(' · ');
 acChat.push({role:'user',content:text,page:label},{role:'assistant',content:'',who:acAssistant});input.value='';acRender();
 const reply=acChat.at(-1);acAbort=new AbortController();$('#ac-send').textContent='Stop';
 try{
  const r=await fetch(AC_URL+'/chat',{method:'POST',signal:acAbort.signal,headers:{Authorization:'Bearer '+acKey,'Content-Type':'application/json'},body:JSON.stringify({messages:acChat.slice(0,-1).map(({role,content,who})=>({role,content,who:who||(role==='assistant'?'claude':undefined)})),context,assistant:acAssistant,model:acAssistant==='claude'?acModel:'',effort:acAssistant==='chatgpt'?acModel:'',web:acWeb})});
  if(!r.ok)throw Error(r.status===409?'The assistant is still answering the previous message.':r.status===401?'The bridge key changed. Paste the new one.':`The bridge answered ${r.status}.`);
  const reader=r.body.getReader(),dec=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;reply.content+=dec.decode(value,{stream:true});acRender();}
  if(!reply.content.trim())reply.content=(acAssistant==='chatgpt'?'⚠︎ No answer came back. Is Codex signed in? Run `codex login` once in Terminal to check.':'⚠︎ No answer came back. Is Claude Code signed in? Run `claude` once in Terminal to check.');
 }catch(e){reply.content+=(reply.content?'\n\n':'')+(e.name==='AbortError'?'(stopped)':`⚠︎ ${e.message==='Failed to fetch'?'Couldn’t reach the bridge. Is `node ai-bridge.mjs` still running?':e.message}`);}
 acAbort=null;$('#ac-send').textContent='Send';acStore('theesees-chat',acChat.slice(-40));acRender();acPageLabel();
}
document.addEventListener('DOMContentLoaded',acMount);if(document.readyState!=='loading')acMount();
// Keep the "Include this page" label current as you move around.
document.addEventListener('click',()=>{if(!$('#ask-claude-panel')?.hidden)setTimeout(acPageLabel,50);});
