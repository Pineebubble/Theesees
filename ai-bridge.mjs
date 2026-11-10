#!/usr/bin/env node
/* Theesees ↔ AI bridge.
   Lets the "Ask AI" side panel in Theesees talk to Claude (through the `claude` CLI, Claude Code) or ChatGPT
   (through the `codex` CLI, OpenAI Codex) on this computer, using your existing subscriptions (no API keys).
   Run it in a terminal while you want the chat:

       node ai-bridge.mjs        (the old name, node claude-bridge.mjs, still works)

   Safety: it listens on this computer only (127.0.0.1), answers only the Theesees pages listed in ORIGINS, and
   only requests carrying the private key it prints (saved in ~/.config/theesees/bridge-key, never in this repo).
   Each assistant runs in an empty folder with its tools switched off, so it cannot read your files or run
   commands: Claude with --tools "" and no MCP servers; Codex read-only, without its shell, file-editing, image,
   browser, computer-use, plugin, app and hook tools, and without your Codex config (so no MCP servers). The only
   tool the page can turn on is web search, which returns search results and links and never touches this
   computer. Requires Node 18+ and Claude Code and/or Codex, each signed in once. */
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';

const PORT=Number(process.env.THEESEES_BRIDGE_PORT||8790);
const ORIGINS=new Set(['https://pineebubble.github.io','http://127.0.0.1:8765','http://localhost:8765','null']); // 'null': opened as a file
// Serving Theesees from another address? Add it: THEESEES_BRIDGE_ORIGIN=http://127.0.0.1:9000 node claude-bridge.mjs
if(process.env.THEESEES_BRIDGE_ORIGIN)ORIGINS.add(process.env.THEESEES_BRIDGE_ORIGIN.replace(/\/$/,''));
const MODELS=new Set(['sonnet','opus','haiku']),EFFORTS=new Set(['low','medium','high']);
const MAX_BODY=3_000_000; // room for a whole article's text

// The key: created once, then reused so it only needs pasting into Theesees once per browser.
const keyDir=join(homedir(),'.config','theesees'),keyFile=join(keyDir,'bridge-key');
// Which assistants are installed (checked once at start).
const HAVE={claude:spawnSync(process.env.CLAUDE_BIN||'claude',['--version'],{stdio:'ignore'}).status===0,chatgpt:spawnSync(process.env.CODEX_BIN||'codex',['--version'],{stdio:'ignore'}).status===0};
let key;try{key=readFileSync(keyFile,'utf8').trim();}catch{}
if(!key||process.argv.includes('--new-key')){key=randomBytes(18).toString('base64url');mkdirSync(keyDir,{recursive:true});writeFileSync(keyFile,key+'\n',{mode:0o600});}
const keyOk=h=>{const got=Buffer.from(String(h||'').replace(/^Bearer\s+/i,'')),want=Buffer.from(key);return got.length===want.length&&timingSafeEqual(got,want);};

const SYSTEM=`You are the research assistant built into Theesees, a literature-review workspace used by a thesis researcher in translation studies and intercultural communication.
- Help them read, compare and think about their literature, and write and revise their own text.
- The context can have up to three parts: a project overview (their research question, notes for you, papers, themes, thoughts, outline and progress), material found in their library by keyword search (numbered, with sources; it may miss things or include off-topic bits), and what they are looking at now. Connect your answer to their own thoughts, passages and draft where relevant, and cite library items by their source.
- Base claims about their papers only on the context they share. Never invent quotations, page numbers or references; say when the context doesn't contain something.
- Be concise and plain. Use short paragraphs or bullet points; quote briefly with page numbers when the context has them.
- Reply in the language the user writes in unless asked otherwise.
- When web search is available, use it to find sources, DOIs and links. Give only links that appeared in your search results; never make up a URL or DOI. Prefer the publisher's page or doi.org.`;

function cors(req,res){
 const o=req.headers.origin;
 if(o&&ORIGINS.has(o)){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 if(req.headers['access-control-request-private-network'])res.setHeader('Access-Control-Allow-Private-Network','true');
 return !o||ORIGINS.has(o);
}
function prompt({messages,context}){
 // Earlier replies are labelled with the assistant that wrote them, since you can switch mid-conversation.
 const turns=(messages||[]).slice(-30).map(m=>`${m.role==='assistant'?(m.who==='chatgpt'?'ChatGPT':m.who==='claude'?'Claude':'Assistant'):'User'}: ${String(m.content||'').slice(0,20000)}`);
 const last=turns.pop()||'User: (empty)';
 return [context?`Context from Theesees (what the user is looking at):\n"""\n${String(context).slice(0,400000)}\n"""`:'',turns.length?`Conversation so far:\n${turns.join('\n\n')}`:'',`Reply to the user's latest message:\n${last}`].filter(Boolean).join('\n\n');
}
// Claude Code: every tool off except (optionally) web search; streamed word by word.
const youAre=name=>`\n- You are ${name}. The user can switch between Claude and ChatGPT during a conversation, so earlier replies are labelled with the assistant that wrote them; only the ones labelled ${name} are yours.`;
function spawnClaude(input,dir){
 const tools=input.web?'WebSearch':'';
 const args=['-p','--tools',tools,...(tools?['--allowedTools',tools]:[]),'--strict-mcp-config','--no-session-persistence','--disable-slash-commands','--system-prompt',SYSTEM+youAre('Claude'),'--output-format','stream-json','--include-partial-messages','--verbose'];
 if(MODELS.has(input.model))args.push('--model',input.model);
 return spawn(process.env.CLAUDE_BIN||'claude',args,{cwd:dir,stdio:['pipe','pipe','pipe']});
}
function claudeEvents(write,sent){return e=>{
 if(e.type==='stream_event'&&e.event?.type==='content_block_delta'&&e.event.delta?.type==='text_delta')write(e.event.delta.text);
 else if(e.type==='stream_event'&&e.event?.type==='content_block_start'&&/tool_use/.test(e.event.content_block?.type||''))write('\n\n*Searching the web…*\n\n');
 else if(e.type==='result'){if(e.is_error)write(`${sent()?'\n\n':''}⚠︎ ${e.result||'Claude Code reported an error.'}`);else if(!sent()&&e.result)write(e.result);}
};}
// Codex: read-only, without its tools and your Codex config; web search only when asked. Codex sends whole
// messages rather than words; short progress notes before the answer are shown in italics.
const CODEX_OFF=['shell_tool','unified_exec','apps','browser_use','browser_use_external','computer_use','in_app_browser','plugins','hooks','view_image','image_generation'];
function spawnCodex(input,dir){
 const args=['exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only','-C',dir,...CODEX_OFF.flatMap(f=>['--disable',f]),'-c','include_apply_patch_tool=false','-c',`web_search="${input.web?'live':'disabled'}"`,'--json','-'];
 if(EFFORTS.has(input.effort))args.splice(1,0,'-c',`model_reasoning_effort="${input.effort}"`);
 return spawn(process.env.CODEX_BIN||'codex',args,{cwd:dir,stdio:['pipe','pipe','pipe']});
}
function codexEvents(write,sent){let pending=null;const flush=asNote=>{if(pending==null)return;write(asNote?`*${pending.trim().replace(/\*/g,'')}*\n\n`:pending);pending=null;};return e=>{
 const it=e.item||{};
 if(e.type==='item.completed'&&it.type==='agent_message'){flush(true);pending=it.text||'';}
 else if(e.type==='item.started'&&it.type==='web_search'){flush(true);write('*Searching the web…*\n\n');}
 else if(e.type==='turn.failed'||e.type==='error'){flush(false);write(`${sent()?'\n\n':''}⚠︎ ${e.error?.message||e.message||'Codex reported an error.'}`);}
 else if(e.type==='turn.completed'||e.type==='__end')flush(false);
};}
let busy=null;
const server=http.createServer((req,res)=>{
 const allowed=cors(req,res);
 if(req.method==='OPTIONS'){res.writeHead(allowed?204:403).end();return;}
 if(!allowed){res.writeHead(403).end('Origin not allowed');return;}
 if(!keyOk(req.headers.authorization)){res.writeHead(401,{'Content-Type':'application/json'}).end('{"error":"wrong key"}');return;}
 if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true,busy:!!busy,assistants:HAVE}));return;}
 if(req.method!=='POST'||req.url!=='/chat'){res.writeHead(404).end();return;}
 let body='';
 req.on('data',c=>{body+=c;if(body.length>MAX_BODY){res.writeHead(413).end('Too long');req.destroy();}});
 req.on('end',()=>{
  if(res.writableEnded)return;
  let input;try{input=JSON.parse(body);}catch{res.writeHead(400).end('Bad JSON');return;}
  if(busy){res.writeHead(409,{'Content-Type':'text/plain'}).end('The assistant is still answering the previous message.');return;}
  // One line per message, so you can see what the page sent (sizes only, never the text).
  const ctx=String(input.context||''),pdfPages=(ctx.match(/^\[p\. [^\]]+\]$/gm)||[]).length,passages=(ctx.match(/^All (\d+) passages/m)||[])[1],discussions=(ctx.match(/^• “/gm)||[]).length;
  console.log(`${new Date().toLocaleTimeString()}  message received · ${input.assistant==='chatgpt'?'ChatGPT':'Claude'} · ${(input.messages||[]).length} turns${input.web?' · web search on':''} · page context ${ctx.length.toLocaleString()} characters${pdfPages?` · ${pdfPages} PDF pages`:''}${passages?` · ${passages} passages`:''}${discussions?` · ${discussions} discussions`:''}${/^=== Project overview ===$/m.test(ctx)?' · project overview':''}${(ctx.match(/^\[\d+\] /gm)||[]).length?` · ${(ctx.match(/^\[\d+\] /gm)||[]).length} library matches`:''}`);
  const dir=mkdtempSync(join(tmpdir(),'theesees-chat-')),chatgpt=input.assistant==='chatgpt';
  const child=chatgpt?spawnCodex(input,dir):spawnClaude(input,dir);busy=child;
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  let buf='',sent='',err='';const write=t=>{sent+=t;res.write(t);};
  const onEvent=chatgpt?codexEvents(write,()=>sent):claudeEvents(write,()=>sent);
  child.stdout.on('data',d=>{buf+=d;let n;while((n=buf.indexOf('\n'))>=0){const line=buf.slice(0,n);buf=buf.slice(n+1);let e;try{e=JSON.parse(line);}catch{continue;}onEvent(e);}});
  child.stderr.on('data',d=>{err+=d;});
  const name=chatgpt?'Codex (ChatGPT)':'Claude Code',bin=chatgpt?'codex':'claude';
  child.on('error',e=>{write(`⚠︎ Couldn't start ${name} (${e.code==='ENOENT'?`the ${bin} command was not found; install it and sign in once`:e.message}).`);});
  child.on('close',code=>{
   busy=null;rmSync(dir,{recursive:true,force:true});onEvent({type:'__end'});
   if(code&&!sent.trim()&&err.trim())write(`⚠︎ ${err.trim().split('\n').filter(l=>!/^\s*$/.test(l)).slice(-3).join(' ')}`);
   res.end();
  });
  // Stop the assistant if the page closes the request (New chat, Stop, or the tab closes).
  res.on('close',()=>{if(!child.killed&&child.exitCode===null)child.kill('SIGTERM');});
  child.stdin.end(chatgpt?`${SYSTEM}${youAre('ChatGPT')}\n\n${prompt(input)}`:prompt(input));
 });
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${PORT} is in use. Is the bridge already running?`:e.message);process.exit(1);});
server.listen(PORT,'127.0.0.1',()=>{
 console.log(`Theesees ↔ AI bridge is running at http://127.0.0.1:${PORT}`);
 console.log(`\nIn Theesees, open Ask AI and paste this key once:\n\n    ${key}\n`);
 console.log(`Assistants found: ${[HAVE.claude&&'Claude (Claude Code)',HAVE.chatgpt&&'ChatGPT (Codex)'].filter(Boolean).join(', ')||'none: install Claude Code or Codex'}.`);
 console.log('They have no access to your files or commands (web search only when you switch it on). Keep this window open while chatting; Ctrl+C stops it.');
});
