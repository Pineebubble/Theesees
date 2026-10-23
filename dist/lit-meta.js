'use strict';
/* Reading bibliographic details from PDFs and Crossref records. No DOM, so it can be tested in Node. */
// DOIs: "10." + registrant + "/" + suffix. Trailing punctuation from the surrounding sentence is dropped.
function findDOIs(text){
 const seen=new Set(),out=[];
 for(const m of String(text).matchAll(/\b(10\.\d{4,9}\/[^\s"'<>]+)/gi)){
  let doi=m[1].replace(/[.,;:\]}>]+$/,'');
  // A closing bracket belongs to the DOI only if it has an opening partner inside it.
  while(doi.endsWith(')')&&(doi.match(/\(/g)||[]).length<(doi.match(/\)/g)||[]).length)doi=doi.slice(0,-1).replace(/[.,;:]+$/,'');
  const k=doi.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(doi);}
 }
 return out;
}
const normDOI=d=>String(d||'').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').toLowerCase();
// PDF "Title" fields are often file names or tool output rather than the article title.
function usableTitle(t){
 const s=String(t||'').replace(/\s+/g,' ').trim();
 if(s.length<6||s.length>400)return '';
 if(/^(microsoft (word|powerpoint)|untitled|document\d*|untitled document|layout \d+)\b/i.test(s)||/\.(docx?|pdf|indd|tex|dvi)$/i.test(s)||/^[\w-]+\.\w{2,4}$/.test(s))return '';
 if(/^(doi|https?:)/i.test(s))return '';
 return s;
}
function usableAuthor(a){const s=String(a||'').replace(/\s+/g,' ').trim();return s.length>=3&&!/^(user|admin|owner|unknown|author)$/i.test(s)&&!/\.(docx?|pdf)$/i.test(s)?s:'';}
/* items: [{str, size, y}] from the first page, y measured from the top. The title is usually the largest text
   in the top part of the page; journal headers in small type are ignored. */
function titleFromItems(items,pageHeight){
 const top=items.filter(i=>i.str.trim()&&i.y<pageHeight*0.6&&i.size>0);
 if(!top.length)return '';
 const max=Math.max(...top.map(i=>i.size)),body=top.map(i=>i.size).sort((a,b)=>a-b)[Math.floor(top.length/2)];
 if(max<body*1.15)return ''; // no clearly larger heading on the page
 const big=top.filter(i=>i.size>=max*0.9).sort((a,b)=>a.y-b.y);
 return usableTitle(big.map(i=>i.str.trim()).join(' ').replace(/\s+-\s*/g,'-').slice(0,300));
}
function crossrefToPaper(m){
 const authors=(m.author||[]).map(a=>a.literal||[a.given,a.family].filter(Boolean).join(' ')).filter(Boolean);
 const year=(m.issued?.['date-parts']?.[0]?.[0]??m.published?.['date-parts']?.[0]?.[0]??'');
 return {title:[(m.title||[])[0],(m.subtitle||[])[0]].filter(Boolean).join(': ').replace(/\s+/g,' ').trim(),author:authors.join(', '),year:year?String(year):'',doi:m.DOI||'',journal:String((m['container-title']||[])[0]||'')};
}
// Word-overlap similarity, used to accept a Crossref title search only when it clearly matches.
function titleSimilarity(a,b){
 const words=s=>new Set(String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>2));
 const A=words(a),B=words(b);if(!A.size||!B.size)return 0;
 let both=0;for(const w of A)if(B.has(w))both++;
 return both/(A.size+B.size-both);
}
// How well a found title matches ours (0–1). Also compares main titles (before a colon), so a record stored without
// its subtitle still matches, and uses character pairs for Chinese/Japanese/Korean, which have no spaces between words.
const cjk=/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
function bigramDice(a,b){
 const grams=s=>{const t=String(s).replace(/[^\p{L}\p{N}]/gu,''),m=new Map();for(let i=0;i<t.length-1;i++){const g=t.slice(i,i+2);m.set(g,(m.get(g)||0)+1);}return m;};
 const A=grams(a),B=grams(b);let both=0,n=0;for(const[g,c]of A){both+=Math.min(c,B.get(g)||0);n+=c;}for(const c of B.values())n+=c;
 return n?2*both/n:0;
}
function matchScore(ours,theirs){
 if(!ours||!theirs)return 0;
 if(cjk.test(ours)||cjk.test(theirs))return bigramDice(ours,theirs);
 const main=t=>String(t).split(/[:：]|\s[—–-]\s/)[0],words=t=>main(t).split(/\s+/).filter(w=>w.length>2).length;
 // The main-title route only counts when the main titles are near-identical, not merely similar.
 const full=titleSimilarity(ours,theirs),m=words(ours)>=2&&words(theirs)>=2?titleSimilarity(main(ours),main(theirs)):0,short=m>=0.9?m*0.95:0;
 return Math.max(full,short);
}
const surname=a=>String(a||'').split(/,|;| and | & /)[0].trim().split(/\s+/).at(-1)?.toLowerCase()||'';
// Author agreement nudges the score: +0.1 if our first author's surname is among theirs, −0.1 if not.
function candidateScore(row,c){
 let s=matchScore(row.title,c.title);const sn=surname(row.author);
 if(sn.length>2&&c.author)s+=c.author.toLowerCase().includes(sn)?0.1:-0.1;
 return Math.max(0,Math.min(1,s));
}
function openalexToPaper(w){
 return {title:String(w.display_name||w.title||'').replace(/\s+/g,' ').trim(),author:(w.authorships||[]).map(a=>a.author?.display_name).filter(Boolean).join(', '),year:w.publication_year?String(w.publication_year):'',doi:w.doi?normDOI(w.doi):'',journal:String(w.primary_location?.source?.display_name||'')};
}
// An existing paper with the same DOI, or the same title once case and punctuation are ignored.
function findDuplicate(papers,c){
 const d=normDOI(c.doi),t=String(c.title||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 return papers.find(p=>(d&&normDOI(p.doi)===d)||(t&&String(p.title||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')===t))||null;
}
/* ---------- APA 7 references ----------
   Built from a CSL-style record (what Crossref returns): type, author, editor, title, subtitle, container-title,
   volume, issue, page, publisher, issued, DOI. *Asterisks* mark italics (also valid Markdown). Titles keep the
   capitalisation they were given; APA's sentence case for article and book titles is left to you. */
const CSL_KEYS=['type','author','editor','title','subtitle','container-title','volume','issue','page','publisher','issued','DOI'];
const pickCSL=m=>Object.fromEntries(CSL_KEYS.filter(k=>m?.[k]!=null&&!(Array.isArray(m[k])&&!m[k].length)).map(k=>[k,m[k]]));
function initials(given){return String(given).split(/\s+/).filter(Boolean).map(w=>w.split('-').map(x=>x.replace(/\.$/,'')).filter(Boolean).map(x=>x[0].toUpperCase()+'.').join('-')).join(' ');}
function apaName(n,initialsFirst=false){
 if(n.literal)return n.literal;
 const given=n.given||'',family=n.family||'';
 if(!family)return given;
 if(!given)return family;
 if(cjk.test(family+given))return family+given; // Chinese/Japanese/Korean names are given in full
 return initialsFirst?`${initials(given)} ${family}`:`${family}, ${initials(given)}`;
}
function apaJoin(names,amp=', & '){
 if(names.length<=1)return names[0]||'';
 if(names.length===2)return amp===', & '?`${names[0]}, & ${names[1]}`:`${names[0]} & ${names[1]}`;
 if(names.length>20)return `${names.slice(0,19).join(', ')}, . . . ${names.at(-1)}`;
 return `${names.slice(0,-1).join(', ')}${amp}${names.at(-1)}`;
}
const endDot=s=>/[.?!]$/.test(s)?s:s+'.';
function apaFromCSL(m){
 const title=[(m.title||[])[0],(m.subtitle||[])[0]].filter(Boolean).join(': ').replace(/\s+/g,' ').trim();
 const container=String((m['container-title']||[])[0]||'').trim(),type=m.type||'';
 const year=m.issued?.['date-parts']?.[0]?.[0]||'n.d.';
 const authors=(m.author||[]).map(n=>apaName(n)),editors=(m.editor||[]).map(n=>apaName(n));
 const pages=String(m.page||'').replace(/\s*[-‐–]\s*/g,'–'),doi=m.DOI?` https://doi.org/${m.DOI}`:'';
 const publisher=/^(portico|crossref)$/i.test(m.publisher||'')?'':String(m.publisher||'').trim();
 const chapterLike=/chapter|proceedings-article|reference-entry|book-section|book-part/.test(type);
 const bookLike=/^(book|monograph|edited-book|reference-book|book-set|book-series)$/.test(type)||(!container&&!chapterLike&&type!=='journal-article');
 const eds=n=>n.length>1?'Eds.':'Ed.';
 // Authors lead; an edited book with no authors is led by its editors; with neither, the title leads.
 let lead=authors.length?endDot(apaJoin(authors)):(!chapterLike&&editors.length?`${apaJoin(editors)} (${eds(editors)}).`:'');
 const t=bookLike?`*${title}*`:title;
 let ref;
 if(!lead)ref=`${endDot(t)} (${year}).`;else ref=`${lead} (${year}). ${endDot(t)}`;
 if(type==='journal-article'||(!bookLike&&!chapterLike&&container)){
  ref+=container?` *${container}*${m.volume?`, *${m.volume}*`:''}${m.issue?`(${m.issue})`:''}${pages?`, ${pages}`:''}.`:'';
 }else if(chapterLike){
  const edited=(m.editor||[]).map(n=>apaName(n,true));
  ref+=` In ${edited.length?`${edited.length===2?edited.join(' & '):apaJoin(edited)} (${eds(edited)}), `:''}*${container||'[Book title]'}*${pages?` (pp. ${pages})`:''}.${publisher?` ${publisher}.`:''}`;
 }else if(publisher)ref+=` ${publisher}.`;
 return (ref+doi).replace(/\s+/g,' ').replace(/\.\./g,'.').trim();
}
// Turn a paper's own fields into a CSL-style record when there is nothing better (no DOI record).
function paperToCSL(p){
 let parts=String(p.author||'').split(/\s*;\s*|\s+&\s+|\s+and\s+/).filter(Boolean),names=[];
 for(const part of parts){
  const bits=part.split(/\s*,\s*/).filter(Boolean);
  // "Smith, J., Doe, A." pairs a surname with initials; "Jane Smith, John Doe" lists full names.
  if(bits.length>=2&&bits.length%2===0&&bits.filter((b,i)=>i%2).every(b=>/^([A-Z]\.?\s?-?)+$/.test(b)))for(let i=0;i<bits.length;i+=2)names.push({family:bits[i],given:bits[i+1]});
  else for(const b of bits){const w=b.trim().split(/\s+/);names.push(w.length>1&&!cjk.test(b)?{family:w.at(-1),given:w.slice(0,-1).join(' ')}:{literal:b.trim()});}
 }
 return {type:p.journal?'journal-article':'',author:names,title:[p.title],'container-title':p.journal?[p.journal]:[],issued:/^\d{4}/.test(p.year||'')?{'date-parts':[[Number(String(p.year).slice(0,4))]]}:undefined,DOI:p.doi||undefined};
}
const apaPlain=s=>String(s||'').replace(/\*([^*]+)\*/g,'$1');

if(typeof module!=='undefined')module.exports={findDOIs,normDOI,usableTitle,usableAuthor,titleFromItems,crossrefToPaper,openalexToPaper,titleSimilarity,matchScore,candidateScore,findDuplicate,pickCSL,apaFromCSL,paperToCSL,apaPlain};
