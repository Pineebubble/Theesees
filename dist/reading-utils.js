'use strict';
// Conservative prose cleanup: retain paragraphs, lists, role labels and fenced code.
function cleanPDFBreaks(text){
 const lines=String(text).replace(/\r\n?/g,'\n').replace(/\u00ad\n(?=\S)/g,'').split('\n');
 const special=s=>/^\s*(?:[-*+•]\s|\d+[.)]\s|#{1,6}\s|>|\||(?:User|Assistant|Human|ChatGPT|Claude|You|用户|助手|我|你)\s*[:：])/i.test(s);
 let result='',previous='',code=false;
 for(const line of lines){
  const fence=/^\s*```/.test(line);
  if(result===''){result=line;previous=line;if(fence)code=!code;continue;}
  const keep=code||fence||!line.trim()||!previous.trim()||special(line)||special(previous)||/^\s{4}|\t/.test(line);
  if(keep)result+='\n'+line;
  else {const left=result.replace(/[ \t]+$/,''),right=line.trimStart();
   const noSpace=/[\u3400-\u9fff]$/.test(left)&&/^[\u3400-\u9fff]/.test(right);
   result=left+(noSpace||/[-‐]$/.test(left)?'':' ')+right;
  }
  previous=line;if(fence)code=!code;
 }
 return result;
}
/* Text selected from a PDF, tidied for machine translation: words split across lines are rejoined, lines are
   joined into sentences, and spacing is tidied. A hyphen at a line end is usually a typesetting break
   ("transla-|tion"), but sometimes part of a compound ("self-|evident"): the rest of the text decides when it can,
   otherwise a few common compound prefixes keep their hyphen. */
const KEEP_HYPHEN=/^(self|non|well|cross|half|so|ill|all|ex|quasi|semi|anti|pro|co)$/i;
function cleanForTranslation(text){
 let t=String(text).replace(/\r\n?/g,'\n').replace(/[   ]/g,' ').replace(/­/g,'').replace(/[ \t]+\n/g,'\n');
 const plain=t.replace(/\s+/g,' ').toLowerCase();
 t=t.replace(/(\p{L}+)[-‐]\n[ \t]*(\p{Ll}[\p{L}'’]*)/gu,(m,a,b)=>{
  const joined=(a+b).toLowerCase(),hyphenated=(a+'-'+b).toLowerCase();
  const seenJoined=plain.split(joined).length>1,seenHyphen=plain.includes(hyphenated+' ')||plain.includes(hyphenated+',')||plain.includes(hyphenated+'.');
  // The last word of a compound like "taken-for-|granted" keeps its hyphen too.
  const compound=seenHyphen&&!seenJoined||KEEP_HYPHEN.test(a)||/[-‐]\p{L}+$/u.test(t.slice(0,t.indexOf(m))+a);
  return compound?`${a}-${b}`:a+b;
 });
 return cleanPDFBreaks(t).replace(/[ \t]{2,}/g,' ').replace(/ +([,.;:!?)\]])/g,'$1').trim();
}
function conversationTurns(text){
 const turns=[];let current=null,code=false;
 for(const line of String(text).replace(/\r\n?/g,'\n').split('\n')){
  const normalized=line.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*/g,'');
  const match=!code&&normalized.match(/^\s*(User|Human|You(?: said)?|Assistant|ChatGPT(?: said)?|Claude(?: said)?|AI|用户|助手|我|你(?:说)?|ChatGPT 说)\s*(?:[:：]\s*(.*)|$)/i);
  if(match){if(current)turns.push(current);current={speaker:match[1],body:match[2]||''};}
  else {if(!current)current={speaker:'Unlabelled text',body:''};current.body+=(current.body?'\n':'')+line;}
  if(/^\s*```/.test(line))code=!code;
 }
 if(current)turns.push(current);
 return turns.filter(t=>t.body.trim()).map(t=>({...t,body:t.body.trim()}));
}
if(typeof module!=='undefined')module.exports={cleanPDFBreaks,conversationTurns,cleanForTranslation};
