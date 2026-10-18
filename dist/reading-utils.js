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
if(typeof module!=='undefined')module.exports={cleanPDFBreaks,conversationTurns};
