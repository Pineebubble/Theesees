'use strict';
/* Ask Claude: a side chat panel you can open on any page. It talks to Claude through claude-bridge.mjs, a small
   helper running on this computer that uses your Claude Code login, so there is no API key or extra cost.
   With "Include this page" on, each message carries what you are looking at (the paper and its passages, the
   PDF page, your selection, a thought, or the section you are writing), so you can ask about it directly.
   The conversation is kept in this browser only. */
const AC_URL='http://127.0.0.1:8790';
// About 100k tokens at most per message: room for a long article or a book chapter, within Claude's context.
const AC_PDF_MAX=300000,AC_CONTEXT_MAX=400000;
const acLoad=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}};
const acStore=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
let acKey=acLoad('theesees-bridge-key',''),acChat=acLoad('theesees-chat',[]),acWithPage=acLoad('theesees-chat-page',true);
let acModel=acLoad('theesees-chat-model',''),acWeb=acLoad('theesees-chat-web',true),acAbort=null,acStatus='unknown';

function acMount(){
 if($('#ask-claude-panel'))return;
 document.body.insertAdjacentHTML('beforeend',`<button class="ask-claude-open" id="ask-claude-open" aria-controls="ask-claude-panel" aria-expanded="false">Ask Claude</button>
 <aside class="ask-claude-panel" id="ask-claude-panel" aria-label="Ask Claude" hidden>
  <header><div><strong>Ask Claude</strong><small id="ac-status">via Claude Code on this computer</small></div><div class="actions"><button id="ac-new" title="Start a new conversation">New chat</button><button id="ac-close" aria-label="Close">×</button></div></header>
  <div class="ac-body" id="ac-body"></div>
  <form class="ac-form" id="ac-form">
   <label class="ac-page"><input type="checkbox" id="ac-with-page" ${acWithPage?'checked':''}> Include this page <span id="ac-page-what"></span></label>
   <textarea id="ac-input" rows="3" placeholder="Ask about this paper, a passage, your draft…" aria-label="Message to Claude"></textarea>
   <div class="ac-send-row"><label class="ac-web" title="Let Claude search the web for sources and links. It never touches your files."><input type="checkbox" id="ac-web" ${acWeb?'checked':''}> Web search</label><select id="ac-model" aria-label="Model"><option value="">Default model</option><option value="sonnet">Sonnet</option><option value="opus">Opus</option><option value="haiku">Haiku</option></select><button type="submit" class="primary" id="ac-send">Send</button></div>
  </form>
 </aside>`);
 $('#ac-model').value=acModel;
 $('#ask-claude-open').onclick=()=>acToggle(true);$('#ac-close').onclick=()=>acToggle(false);
 $('#ac-new').onclick=()=>{acAbort?.abort();acChat=[];acStore('theesees-chat',acChat);acRender();$('#ac-input').focus();};
 $('#ac-with-page').onchange=e=>{acWithPage=e.target.checked;acStore('theesees-chat-page',acWithPage);acPageLabel();};
 $('#ac-model').onchange=e=>{acModel=e.target.value;acStore('theesees-chat-model',acModel);};
 $('#ac-web').onchange=e=>{acWeb=e.target.checked;acStore('theesees-chat-web',acWeb);};
 $('#ac-form').onsubmit=e=>{e.preventDefault();acSend();};
 $('#ac-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();acSend();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#ask-claude-panel').hidden&&!$('#modal')?.open)acToggle(false);});
}
function acToggle(open){
 const panel=$('#ask-claude-panel');panel.hidden=!open;document.body.classList.toggle('ask-claude-on',open);
 $('#ask-claude-open').setAttribute('aria-expanded',String(open));
 if(open){acPageLabel();acRender();acCheck();$('#ac-input').focus();}
}
async function acCheck(){
 if(!acKey){acStatus='setup';acRender();return;}
 try{const r=await fetch(AC_URL+'/health',{headers:{Authorization:'Bearer '+acKey}});acStatus=r.ok?'ready':r.status===401?'badkey':'off';}
 catch{acStatus='off';}
 $('#ac-status').textContent=acStatus==='ready'?'Connected · Claude Code on this computer':acStatus==='badkey'?'The key doesn’t match the bridge':'Bridge not running';
 acRender();
}
const acSetupHTML=msg=>`<div class="ac-setup"><p>${msg}</p><ol><li>Open Terminal in your Theesees folder and run:<pre>node claude-bridge.mjs</pre></li><li>Paste the key it shows:</li></ol><form id="ac-key-form"><input id="ac-key" placeholder="Bridge key" autocomplete="off" value="${esc(acKey)}"><button class="primary">Connect</button></form><p class="help">It uses your Claude Code login, so there's no API key or extra cost. The bridge switches off Claude's tools, so it can't read your files or run anything; it can only search the web, when you tick Web search. In Chrome, allow access to this computer if asked.</p></div>`;
function acRender(){
 const body=$('#ac-body');if(!body)return;
 if(acStatus==='setup'||acStatus==='badkey'||acStatus==='off'&&!acChat.length){
  body.innerHTML=acSetupHTML(acStatus==='badkey'?'That key doesn’t match the one the bridge printed. Paste it again.':acStatus==='off'&&acKey?'The bridge isn’t running. Start it again, then reopen this panel.':'Chat with Claude about what you are reading or writing.');
  $('#ac-key-form').onsubmit=e=>{e.preventDefault();acKey=$('#ac-key').value.trim();acStore('theesees-bridge-key',acKey);acCheck();};
  return;
 }
 body.innerHTML=acChat.length?acChat.map(m=>`<div class="ac-msg ${m.role}">${m.role==='user'?`${m.page?`<small>About: ${esc(m.page)}</small>`:''}<p>${esc(m.content).replace(/\n/g,'<br>')}</p>`:acMarkdown(m.content)||'<p class="ac-typing">Thinking…</p>'}</div>`).join(''):`<div class="ac-empty"><p>Ask anything about what you're looking at. For example:</p><button data-ac-try>Summarise this paper's argument in three points</button><button data-ac-try>Which of my passages support each other?</button><button data-ac-try>Suggest a clearer way to say my last paragraph</button></div>`;
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
/* What "Include this page" sends: a short label for the panel, and the text for Claude. */
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
 if(acWithPage&&page==='reader'&&pdfState?.indexReady){$('#ac-status').textContent='Reading the PDF…';await pdfState.indexReady;$('#ac-status').textContent='Connected · Claude Code on this computer';}
 const ctx=acWithPage?acPageContext():null;
 acChat.push({role:'user',content:text,page:ctx?.label||''},{role:'assistant',content:''});input.value='';acRender();
 const reply=acChat.at(-1);acAbort=new AbortController();$('#ac-send').textContent='Stop';
 try{
  const r=await fetch(AC_URL+'/chat',{method:'POST',signal:acAbort.signal,headers:{Authorization:'Bearer '+acKey,'Content-Type':'application/json'},body:JSON.stringify({messages:acChat.slice(0,-1).map(({role,content})=>({role,content})),context:ctx?.text||'',model:acModel,web:acWeb})});
  if(!r.ok)throw Error(r.status===409?'Claude is still answering the previous message.':r.status===401?'The bridge key changed. Paste the new one.':`The bridge answered ${r.status}.`);
  const reader=r.body.getReader(),dec=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;reply.content+=dec.decode(value,{stream:true});acRender();}
  if(!reply.content.trim())reply.content='⚠︎ No answer came back. Is Claude Code signed in? Run `claude` once in Terminal to check.';
 }catch(e){reply.content+=(reply.content?'\n\n':'')+(e.name==='AbortError'?'(stopped)':`⚠︎ ${e.message==='Failed to fetch'?'Couldn’t reach the bridge. Is `node claude-bridge.mjs` still running?':e.message}`);}
 acAbort=null;$('#ac-send').textContent='Send';acStore('theesees-chat',acChat.slice(-40));acRender();acPageLabel();
}
document.addEventListener('DOMContentLoaded',acMount);if(document.readyState!=='loading')acMount();
// Keep the "Include this page" label current as you move around.
document.addEventListener('click',()=>{if(!$('#ask-claude-panel')?.hidden)setTimeout(acPageLabel,50);});
