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
// An existing paper with the same DOI, or the same title once case and punctuation are ignored.
function findDuplicate(papers,c){
 const d=normDOI(c.doi),t=String(c.title||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 return papers.find(p=>(d&&normDOI(p.doi)===d)||(t&&String(p.title||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')===t))||null;
}
if(typeof module!=='undefined')module.exports={findDOIs,normDOI,usableTitle,usableAuthor,titleFromItems,crossrefToPaper,titleSimilarity,findDuplicate};
