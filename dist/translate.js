'use strict';
/* Translate selected text into English or Chinese. Select text anywhere on a page (a PDF, pasted source text, a passage,
   a comment) and a small Translate button appears beside it.
   - Quick translation uses Chrome's built-in Translator and Language Detector (desktop Chrome 138+). Both run on
     this computer: language packs download once, then nothing is sent anywhere.
   - "Copy for AI translation" copies the text with instructions, to paste into Claude or ChatGPT. */
const TR_LIMIT=4000;
// Target languages offered in the dialog; the last choice is remembered on this browser.
const TR_TARGETS={en:{label:'English',name:'English'},zh:{label:'中文',name:'Chinese (Simplified)'}};
let trTarget=(()=>{try{const v=localStorage.getItem('theesees-translate-to');return TR_TARGETS[v]?v:'en';}catch{return 'en';}})();
let trChip=null,trText='',trResult='',trDetector=null;
const trTranslators=new Map();
const langName=code=>{try{return new Intl.DisplayNames(['en'],{type:'language'}).of(code)||code;}catch{return code;}};

function trChipEl(){
 if(trChip)return trChip;
 trChip=document.createElement('button');trChip.type='button';trChip.className='translate-chip';trChip.textContent='Translate';trChip.hidden=true;
 trChip.addEventListener('mousedown',e=>e.preventDefault()); // keep the selection while clicking
 trChip.onclick=()=>{trChip.hidden=true;openTranslate(trText);};
 document.body.append(trChip);return trChip;
}
// The selected text, if it is on the page itself (not in a form field or dialog).
function trSelection(){
 const s=getSelection();if(!s||s.isCollapsed||!s.rangeCount)return null;
 const text=s.toString().trim();if(text.length<2)return null;
 const n=s.anchorNode?.nodeType===1?s.anchorNode:s.anchorNode?.parentElement;
 if(!n||!n.closest('#main')||n.closest('input,textarea,dialog'))return null;
 return {text,rect:s.getRangeAt(0).getBoundingClientRect()};
}
document.addEventListener('mouseup',e=>{
 if(e.target.closest?.('.translate-chip'))return;
 setTimeout(()=>{
  const sel=trSelection(),chip=trChipEl();if(!sel){chip.hidden=true;return;}
  trText=sel.text;chip.hidden=false;const r=sel.rect;
  chip.style.left=Math.min(innerWidth-chip.offsetWidth-8,Math.max(8,r.right-chip.offsetWidth))+'px';
  chip.style.top=Math.min(innerHeight-40,Math.max(8,r.bottom+44>innerHeight?r.top-40:r.bottom+8))+'px'; // stays on screen
 },0);
});
document.addEventListener('selectionchange',()=>{if(trChip&&!trChip.hidden&&getSelection().isCollapsed)trChip.hidden=true;});
document.addEventListener('scroll',()=>{if(trChip)trChip.hidden=true;},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&trChip)trChip.hidden=true;});

function openTranslate(text){
 trResult='';const long=text.length>TR_LIMIT;
 modal('Translate',`<div class="translate-to"><span>To</span><div class="view-toggle" role="group" aria-label="Translate into">${Object.entries(TR_TARGETS).map(([code,t])=>`<button data-tr-target="${code}" aria-pressed="${code===trTarget}">${t.label}</button>`).join('')}</div></div>
  <blockquote class="reply-context translate-source">${esc(text.slice(0,600))}${text.length>600?'…':''}</blockquote>
  <div class="translate-out" id="translate-out" aria-live="polite"><p class="help">Translating…</p></div>
  ${long?`<p class="help">Only the first ${TR_LIMIT.toLocaleString()} characters are translated here.</p>`:''}
  <div class="actions translate-actions"><button id="tr-copy-result" disabled>Copy translation</button><button id="tr-copy-ai">Copy for AI translation</button></div>
  <p class="help">Quick translation runs in Chrome on this computer; nothing is sent anywhere. For a closer reading, “Copy for AI translation” copies the text with instructions to paste into Claude or ChatGPT.</p>`);
 $('#tr-copy-result').onclick=()=>trCopy(trResult,'Translation copied.');
 $('#tr-copy-ai').onclick=()=>trCopy(aiPrompt(text),'Copied. Paste it into Claude or ChatGPT.');
 $$('[data-tr-target]').forEach(b=>b.onclick=()=>{
  trTarget=b.dataset.trTarget;try{localStorage.setItem('theesees-translate-to',trTarget);}catch{}
  $$('[data-tr-target]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  trResult='';$('#tr-copy-result').disabled=true;$('#translate-out').innerHTML='<p class="help">Translating…</p>';quickTranslate(text.slice(0,TR_LIMIT));
 });
 quickTranslate(text.slice(0,TR_LIMIT));
}
// Chrome only downloads a language pack in response to a click, so a first-time download gets its own button.
function trAfterClick(message,label,run){
 const out=$('#translate-out');if(!out)return;
 out.innerHTML=`<p class="help">${message}</p><button id="tr-download">${label}</button>`;
 $('#tr-download').onclick=()=>run();
}
async function quickTranslate(text){
 const target=trTarget,targetName=TR_TARGETS[target].name.replace(/ \(.*/,'');
 const say=html=>{const out=$('#translate-out');if(out)out.innerHTML=html;};
 const failed=err=>say(`<p class="help">Couldn’t translate this: ${esc(String(err?.message||err).replace(/[.\s]+$/,''))}. Use “Copy for AI translation” instead.</p>`);
 if(!('Translator' in self)||!('LanguageDetector' in self)){say('<p class="help">Quick translation needs Chrome 138 or later on a computer. Use “Copy for AI translation” instead.</p>');return;}
 try{
  if(!trDetector){
   if(await LanguageDetector.availability()!=='available'){
    trAfterClick('Chrome needs to download its language detector once, on this computer.','Download and translate',()=>{say('<p class="help">Downloading…</p>');LanguageDetector.create().then(d=>{trDetector=d;quickTranslate(text);},failed);});
    return;
   }
   trDetector=await LanguageDetector.create();
  }
  const [top]=await trDetector.detect(text),src=top?.detectedLanguage;
  if(!src||src==='und'){say('<p class="help">Chrome couldn’t tell which language this is. Try selecting a longer stretch of text.</p>');return;}
  if(src.split('-')[0]===target){say(`<p class="help">This already looks like ${targetName}. Choose the other language above to translate it.</p>`);return;}
  const name=esc(langName(src));
  const pair=src+'>'+target;let t=trTranslators.get(pair);
  if(!t){
   const availability=await Translator.availability({sourceLanguage:src,targetLanguage:target});
   if(availability==='unavailable'){say(`<p class="help">Chrome can’t translate ${name} into ${targetName} yet. Use “Copy for AI translation” instead.</p>`);return;}
   const create=()=>Translator.create({sourceLanguage:src,targetLanguage:target,monitor(m){m.addEventListener('downloadprogress',e=>say(`<p class="help">Downloading the ${name}–${targetName} language pack… ${Math.round(e.loaded*100)}%</p>`));}});
   if(availability!=='available'){
    trAfterClick(`This is ${name}. Chrome needs to download its ${name}–${targetName} language pack once, on this computer. After that, translation works offline.`,'Download and translate',()=>{say('<p class="help">Downloading…</p>');create().then(tr=>{trTranslators.set(pair,tr);quickTranslate(text);},failed);});
    return;
   }
   t=await create();trTranslators.set(pair,t);
  }
  trResult=await t.translate(text);
  if(target!==trTarget)return; // the language was switched while this was running
  say(`<p class="translate-from">From ${name} · Chrome, on this computer</p><div class="translate-text">${esc(trResult).replace(/\n/g,'<br>')}</div>`);
  if($('#tr-copy-result'))$('#tr-copy-result').disabled=false;
 }catch(err){failed(err);}
}
// Instructions for Claude or ChatGPT, with the source when the text comes from a paper.
function aiPrompt(text){
 const p=page==='reader'&&typeof getPaper==='function'?getPaper(currentPaper):null;
 const lang=TR_TARGETS[trTarget].name;
 const source=p?`\nSource: ${p.title}${p.author||p.year?` (${[p.author,p.year].filter(Boolean).join(', ')})`:''}\n`:'';
 return `Translate the passage below into ${lang} for a translation-studies thesis.
1. Give a faithful ${lang} translation.
2. List the key terms, each with its original wording and other possible ${lang} renderings.
3. Note anything culture-specific or hard to carry over, and what the translation loses or adds.
${source}
Passage:
"""
${text}
"""`;
}
async function trCopy(text,done){
 if(!text)return;
 try{await navigator.clipboard.writeText(text);toast(done);}catch{toast('Couldn’t copy. Select the text and copy it instead.');}
}
