'use strict';
/* Finding a saved quotation inside a PDF's extracted text.
   Both sides are reduced to lower-case letters and digits (after NFKC, so ligatures like "ﬁ" become "fi"),
   which makes matching ignore line breaks, hyphenation, spacing, quote styles and punctuation.
   Every kept character remembers the page, text item and offset it came from, so a match can be highlighted. */
const pdfKeep=/[\p{L}\p{N}]/u;
function pdfNormChars(str){
 const out=[];let o=0;
 for(const ch of String(str)){
  for(const x of ch.normalize('NFKC').toLowerCase())if(pdfKeep.test(x))out.push({c:x,o,e:o+ch.length});
  o+=ch.length;
 }
 return out;
}
function normalizeQuote(q){return pdfNormChars(q).map(x=>x.c).join('');}
/* pages: [[itemString, ...], ...] in page order (page numbers are 1-based in the result). */
function buildPdfIndex(pages){
 let text='';const page=[],item=[],from=[],to=[],pageStarts=[];
 pages.forEach((items,p)=>{
  pageStarts.push(text.length);
  items.forEach((s,i)=>{for(const x of pdfNormChars(s)){text+=x.c;page.push(p+1);item.push(i);from.push(x.o);to.push(x.e);}});
 });
 return {text,page,item,from,to,pageStarts,pageCount:pages.length};
}
function occurrences(text,needle,limit=60){const found=[];let i=text.indexOf(needle);while(i>=0&&found.length<limit){found.push(i);i=text.indexOf(needle,i+1);}return found;}
// Prefer the occurrence on (or nearest to) the page the passage says it is on.
function nearest(index,starts,preferPage){
 if(!preferPage||starts.length<2)return starts[0];
 return starts.reduce((best,s)=>Math.abs(index.page[s]-preferPage)<Math.abs(index.page[best]-preferPage)?s:best,starts[0]);
}
/* Returns {start,end,approx} as positions in index.text (end exclusive), or null. */
function findPassage(index,quote,preferPage=null){
 const q=normalizeQuote(quote),len=q.length;
 if(len<4||!index.text.length)return null;
 const exact=occurrences(index.text,q);
 if(exact.length){const s=nearest(index,exact,preferPage);return {start:s,end:s+len,approx:false};}
 if(len<24)return null;
 // Approximate: the quote was edited or the PDF text differs slightly. Anchor on its opening and closing words.
 const k=Math.min(30,Math.floor(len/3)),head=q.slice(0,k),tail=q.slice(-k),heads=occurrences(index.text,head),cands=[];
 for(const h of heads){
  for(const t of occurrences(index.text.slice(h+k,h+Math.ceil(len*1.6)),tail,5)){const end=h+k+t+k;if(end-h>=len*0.6){cands.push({start:h,end});break;}}
 }
 if(cands.length){const s=nearest(index,cands.map(c=>c.start),preferPage);return {...cands.find(c=>c.start===s),approx:true};}
 if(heads.length){const s=nearest(index,heads,preferPage);return {start:s,end:Math.min(s+len,index.text.length),approx:true};}
 const tails=occurrences(index.text,tail);
 if(tails.length){const e=nearest(index,tails,preferPage)+k;return {start:Math.max(0,e-len),end:e,approx:true};}
 return null;
}
/* Splits a match into per-item pieces: [{page,item,from,to}] with UTF-16 offsets into that item's string. */
function matchSegments(index,start,end){
 const segs=[];
 for(let i=start;i<end;i++){
  const last=segs.at(-1);
  if(last&&last.page===index.page[i]&&last.item===index.item[i])last.to=index.to[i];
  else segs.push({page:index.page[i],item:index.item[i],from:index.from[i],to:index.to[i]});
 }
 return segs;
}
// "p. 12", "pp. 12–14", "page 7" → 12 / 12 / 7.
function locationPage(location){const m=String(location||'').match(/\d+/);return m?Number(m[0]):null;}
if(typeof module!=='undefined')module.exports={pdfNormChars,normalizeQuote,buildPdfIndex,findPassage,matchSegments,locationPage};
