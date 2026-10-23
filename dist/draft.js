'use strict';
/* Section drafts in the Outline's Write mode. A draft is a small, safe subset of HTML:
   <p>, <br>, <strong>, <em>, and citation chips <span class="cite" data-paper data-passage>label</span>.
   Everything pasted or stored passes through sanitizeDraft, so nothing else (scripts, styles, links, images,
   Word markup) can reach the page. No DOM here, so it is tested in Node. */
const DRAFT_BLOCK=new Set(['p','div','h1','h2','h3','h4','h5','h6','li','blockquote','tr','section','article','header','footer','pre','dt','dd','figcaption']);
const DRAFT_SKIP=new Set(['script','style','template','noscript','iframe','object','svg','math','head','title','xml']);
const draftIdOk=v=>/^[\w-]{1,80}$/.test(v||'');
function draftAttr(attrs,name){const m=String(attrs).match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'));return m?(m[2]??m[3]??m[4]??''):null;}
// Raw < and > left in text (from malformed markup) are escaped, so the output can never form a new tag.
const draftText=t=>t.replace(/</g,'&lt;').replace(/>/g,'&gt;');
function sanitizeDraft(html){
 const src=String(html||'').replace(/<!--[\s\S]*?(-->|$)/g,'');
 const tokens=src.split(/(<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^<>]*)?\/?>)/);
 let out='',skip=null,bold=0,ital=0,inCite=false,para=false;
 const openPara=()=>{if(!para){out+='<p>';para=true;}};
 const closePara=()=>{if(para){if(ital){out+='</em>';}if(bold){out+='</strong>';}out+='</p>';para=false;if(ital)ital=0;if(bold)bold=0;}};
 for(const tok of tokens){
  const m=tok.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>$/);
  if(!m){if(skip||!tok)continue;if(!tok.trim()&&!para)continue;openPara();out+=draftText(tok);continue;}
  const close=m[1]==='/',tag=m[2].toLowerCase(),attrs=m[3];
  if(skip){if(close&&tag===skip)skip=null;continue;}
  if(DRAFT_SKIP.has(tag)){if(!close&&!/\/\s*$/.test(attrs))skip=tag;continue;}
  if(inCite){if(close&&tag==='span'){out+='</span>';inCite=false;}continue;} // a chip holds plain text only
  if(DRAFT_BLOCK.has(tag)){closePara();continue;}
  if(tag==='br'){openPara();out+='<br>';continue;}
  if(tag==='strong'||tag==='b'){if(close){if(bold){out+='</strong>';bold--;}}else if(!bold){openPara();out+='<strong>';bold++;}continue;}
  if(tag==='em'||tag==='i'){if(close){if(ital){out+='</em>';ital--;}}else if(!ital){openPara();out+='<em>';ital++;}continue;}
  if(tag==='span'&&!close&&/\bcite\b/.test(draftAttr(attrs,'class')||'')){
   const paper=draftAttr(attrs,'data-paper'),passage=draftAttr(attrs,'data-passage');
   if(draftIdOk(paper)){openPara();out+=`<span class="cite" contenteditable="false" data-paper="${paper}"${draftIdOk(passage)?` data-passage="${passage}"`:''}>`;inCite=true;}
  }
  // Any other tag (span, a, font, img…) is dropped; its text stays.
 }
 if(inCite)out+='</span>';
 closePara();
 return out.replace(/<p>(\s|<br>)*<\/p>/g,'').replace(/<strong><\/strong>|<em><\/em>/g,'');
}
const decodeEntities=s=>s.replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
function draftToMarkdown(html){
 return sanitizeDraft(html).split(/<\/p>/).map(p=>p.replace(/<p>/,'')
  .replace(/<strong>([\s\S]*?)<\/strong>/g,'**$1**').replace(/<em>([\s\S]*?)<\/em>/g,'*$1*').replace(/<br>/g,'  \n').replace(/<[^>]+>/g,''))
  .map(decodeEntities).map(s=>s.trim()).filter(Boolean).join('\n\n');
}
function draftPlain(html){return decodeEntities(sanitizeDraft(html).replace(/<\/p>/g,'\n').replace(/<br>/g,'\n').replace(/<[^>]+>/g,'')).trim();}
// Words; each Chinese/Japanese/Korean character counts as one, as word processors do.
function wordCount(text){const s=String(text||'');const cjkChars=(s.match(/[぀-ヿ㐀-鿿가-힯]/g)||[]).length;return cjkChars+(s.replace(/[぀-ヿ㐀-鿿가-힯]/g,' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)||[]).length;}
function citesIn(html){return [...sanitizeDraft(html).matchAll(/data-paper="([\w-]+)"(?: data-passage="([\w-]+)")?/g)].map(m=>({paper:m[1],passage:m[2]||null}));}
/* Aa button: each click moves the text one step through Sentence case → Title Case → UPPERCASE → lowercase.
   Words already written in capitals (AI, IC, UNESCO) stay so in sentence and title case, unless everything is upper. */
const MINOR=new Set('a an the and but or nor for so yet as at by in of off on per to up via vs from into onto with over upon'.split(' '));
function caseOf(t){const letters=t.replace(/[^\p{L}]/gu,'');if(!letters)return 'none';if(letters===letters.toUpperCase())return 'upper';if(letters===letters.toLowerCase())return 'lower';if(t===toTitleCase(t))return 'title';if(t===toSentenceCase(t))return 'sentence';return 'mixed';}
function keepCaps(word,allUpper){return !allUpper&&/^\p{Lu}{2,}s?$/u.test(word.replace(/[^\p{L}]/gu,''));}
function toSentenceCase(t){
 const allUpper=/^[^\p{Ll}]*$/u.test(t);let start=true;
 return t.replace(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu,w=>{const out=keepCaps(w,allUpper)?w:start?w[0].toUpperCase()+w.slice(1).toLowerCase():(w==='i'||w==='I'?'I':w.toLowerCase());start=false;return out;})
  .replace(/([.!?:]\s+)(\p{Ll})/gu,(m,p,c)=>p+c.toUpperCase());
}
function toTitleCase(t){
 const allUpper=/^[^\p{Ll}]*$/u.test(t);const words=[...t.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)];
 return t.replace(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu,(w,off)=>{
  if(keepCaps(w,allUpper))return w;
  const i=words.findIndex(m=>m.index===off),first=i===0,last=i===words.length-1,afterColon=/[:—–]\s*$/.test(t.slice(0,off));
  const lw=w.toLowerCase();
  if(!first&&!last&&!afterColon&&MINOR.has(lw))return lw;
  return lw.split('-').map(p=>p?p[0].toUpperCase()+p.slice(1):p).join('-');
 });
}
function cycleCase(t){const c=caseOf(t);return c==='sentence'?toTitleCase(t):c==='title'?t.toUpperCase():c==='upper'?t.toLowerCase():toSentenceCase(t);}

if(typeof module!=='undefined')module.exports={sanitizeDraft,draftToMarkdown,draftPlain,wordCount,citesIn,cycleCase,toSentenceCase,toTitleCase};
