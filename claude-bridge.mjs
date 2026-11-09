#!/usr/bin/env node
/* Theesees ↔ Claude Code bridge.
   Lets the "Ask Claude" side panel in Theesees talk to Claude through the `claude` CLI on this computer, using
   your existing Claude Code login (no API key). Run it in a terminal while you want the chat:

       node claude-bridge.mjs

   Safety: it listens on this computer only (127.0.0.1), answers only the Theesees pages listed in ORIGINS, and
   only requests carrying the private key it prints (saved in ~/.config/theesees/bridge-key, never in this repo).
   Claude runs with every tool switched off (--tools ""), no MCP servers, in an empty folder, so it cannot read
   your files or run commands. The only tool the page can turn on is web search, which returns search results
   and links and never touches this computer. Requires Node 18+ and Claude Code. */
import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';

const PORT=Number(process.env.THEESEES_BRIDGE_PORT||8790);
const ORIGINS=new Set(['https://pineebubble.github.io','http://127.0.0.1:8765','http://localhost:8765','null']); // 'null': opened as a file
// Serving Theesees from another address? Add it: THEESEES_BRIDGE_ORIGIN=http://127.0.0.1:9000 node claude-bridge.mjs
if(process.env.THEESEES_BRIDGE_ORIGIN)ORIGINS.add(process.env.THEESEES_BRIDGE_ORIGIN.replace(/\/$/,''));
const MODELS=new Set(['sonnet','opus','haiku']);
const MAX_BODY=3_000_000; // room for a whole article's text

// The key: created once, then reused so it only needs pasting into Theesees once per browser.
const keyDir=join(homedir(),'.config','theesees'),keyFile=join(keyDir,'bridge-key');
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
 const turns=(messages||[]).slice(-30).map(m=>`${m.role==='assistant'?'Assistant':'User'}: ${String(m.content||'').slice(0,20000)}`);
 const last=turns.pop()||'User: (empty)';
 return [context?`Context from Theesees (what the user is looking at):\n"""\n${String(context).slice(0,400000)}\n"""`:'',turns.length?`Conversation so far:\n${turns.join('\n\n')}`:'',`Reply to the user's latest message:\n${last}`].filter(Boolean).join('\n\n');
}
let busy=null;
const server=http.createServer((req,res)=>{
 const allowed=cors(req,res);
 if(req.method==='OPTIONS'){res.writeHead(allowed?204:403).end();return;}
 if(!allowed){res.writeHead(403).end('Origin not allowed');return;}
 if(!keyOk(req.headers.authorization)){res.writeHead(401,{'Content-Type':'application/json'}).end('{"error":"wrong key"}');return;}
 if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true,busy:!!busy}));return;}
 if(req.method!=='POST'||req.url!=='/chat'){res.writeHead(404).end();return;}
 let body='';
 req.on('data',c=>{body+=c;if(body.length>MAX_BODY){res.writeHead(413).end('Too long');req.destroy();}});
 req.on('end',()=>{
  if(res.writableEnded)return;
  let input;try{input=JSON.parse(body);}catch{res.writeHead(400).end('Bad JSON');return;}
  if(busy){res.writeHead(409,{'Content-Type':'text/plain'}).end('Claude is still answering the previous message.');return;}
  // One line per message, so you can see what the page sent (sizes only, never the text).
  const ctx=String(input.context||''),pdfPages=(ctx.match(/^\[p\. [^\]]+\]$/gm)||[]).length,passages=(ctx.match(/^All (\d+) passages/m)||[])[1],discussions=(ctx.match(/^• “/gm)||[]).length;
  console.log(`${new Date().toLocaleTimeString()}  message received · ${(input.messages||[]).length} turns${input.web?' · web search on':''} · page context ${ctx.length.toLocaleString()} characters${pdfPages?` · ${pdfPages} PDF pages`:''}${passages?` · ${passages} passages`:''}${discussions?` · ${discussions} discussions`:''}${/^=== Project overview ===$/m.test(ctx)?' · project overview':''}${(ctx.match(/^\[\d+\] /gm)||[]).length?` · ${(ctx.match(/^\[\d+\] /gm)||[]).length} library matches`:''}`);
  const dir=mkdtempSync(join(tmpdir(),'theesees-chat-'));
  const tools=input.web?'WebSearch':'';
  const args=['-p','--tools',tools,...(tools?['--allowedTools',tools]:[]),'--strict-mcp-config','--no-session-persistence','--disable-slash-commands','--system-prompt',SYSTEM,'--output-format','stream-json','--include-partial-messages','--verbose'];
  if(MODELS.has(input.model))args.push('--model',input.model);
  const child=spawn(process.env.CLAUDE_BIN||'claude',args,{cwd:dir,stdio:['pipe','pipe','pipe']});busy=child;
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  let buf='',streamed='',err='';
  child.stdout.on('data',d=>{
   buf+=d;let i;
   while((i=buf.indexOf('\n'))>=0){
    const line=buf.slice(0,i);buf=buf.slice(i+1);let e;try{e=JSON.parse(line);}catch{continue;}
    if(e.type==='stream_event'&&e.event?.type==='content_block_delta'&&e.event.delta?.type==='text_delta'){streamed+=e.event.delta.text;res.write(e.event.delta.text);}
    else if(e.type==='stream_event'&&e.event?.type==='content_block_start'&&/tool_use/.test(e.event.content_block?.type||'')){const t='\n\n*Searching the web…*\n\n';streamed+=t;res.write(t);}
    else if(e.type==='result'){
     if(e.is_error)res.write(`${streamed?'\n\n':''}⚠︎ ${e.result||'Claude Code reported an error.'}`);
     else if(!streamed&&e.result)res.write(e.result); // no partial chunks arrived: send the whole answer
    }
   }
  });
  child.stderr.on('data',d=>{err+=d;});
  child.on('error',e=>{res.write(`⚠︎ Couldn't start Claude Code (${e.code==='ENOENT'?'the claude command was not found':e.message}).`);});
  child.on('close',code=>{
   busy=null;rmSync(dir,{recursive:true,force:true});
   if(code&&!streamed&&err.trim())res.write(`⚠︎ ${err.trim().split('\n').slice(-3).join(' ')}`);
   res.end();
  });
  // Stop Claude if the page closes the request (New chat, Stop, or the tab closes).
  res.on('close',()=>{if(!child.killed&&child.exitCode===null)child.kill('SIGTERM');});
  child.stdin.end(prompt(input));
 });
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${PORT} is in use. Is the bridge already running?`:e.message);process.exit(1);});
server.listen(PORT,'127.0.0.1',()=>{
 console.log(`Theesees ↔ Claude bridge is running at http://127.0.0.1:${PORT}`);
 console.log(`\nIn Theesees, open Ask Claude and paste this key once:\n\n    ${key}\n`);
 console.log('Claude has no access to your files or commands (web search only when you switch it on). Keep this window open while chatting; Ctrl+C stops it.');
});
