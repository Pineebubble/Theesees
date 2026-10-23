const assert=require('node:assert/strict');
const {findDOIs,normDOI,usableTitle,usableAuthor,titleFromItems,crossrefToPaper,openalexToPaper,titleSimilarity,matchScore,candidateScore,findDuplicate}=require('./dist/lit-meta.js');

// DOIs inside running text and reference lists; trailing punctuation dropped, balanced brackets kept, duplicates once.
assert.deepEqual(findDOIs('See https://doi.org/10.1215/01642472-18-2_63-33. Also (doi:10.1177/1367549407088333), and 10.1016/S0140-6736(20)30183-5; again 10.1215/01642472-18-2_63-33'),
 ['10.1215/01642472-18-2_63-33','10.1177/1367549407088333','10.1016/S0140-6736(20)30183-5']);
assert.deepEqual(findDOIs('no identifiers here'),[]);
assert.equal(normDOI('https://doi.org/10.1/ABC'),'10.1/abc');assert.equal(normDOI('doi: 10.1/x'),'10.1/x');

// PDF "Title"/"Author" fields that are really file names or tool output are ignored.
for(const junk of ['Microsoft Word - draft3.docx','untitled','paper_final.pdf','Layout 1','abc'])assert.equal(usableTitle(junk),'',junk);
assert.equal(usableTitle('  Free Labor:  Producing Culture '),'Free Labor: Producing Culture');
assert.equal(usableAuthor('owner'),'');assert.equal(usableAuthor('Tiziana Terranova'),'Tiziana Terranova');

// Title = the largest type in the top of page 1, in reading order; small journal header and body text excluded.
const items=[{str:'Social Text 63',size:8,y:40},{str:'Free Labor: Producing',size:22,y:120},{str:'Culture for the Digital Economy',size:22,y:148},{str:'Tiziana Terranova',size:12,y:190},
 ...Array.from({length:30},(_,i)=>({str:'body text line',size:10,y:250+i*12})),{str:'Huge footer figure',size:30,y:780}];
assert.equal(titleFromItems(items,842),'Free Labor: Producing Culture for the Digital Economy');
assert.equal(titleFromItems(Array.from({length:20},(_,i)=>({str:'same size text',size:10,y:50+i*12})),842),''); // no heading → no guess

// Crossref records → paper fields.
assert.deepEqual(crossrefToPaper({title:['Free Labor:  Producing Culture for the Digital Economy'],author:[{given:'Tiziana',family:'Terranova'},{literal:'Collective X'}],issued:{'date-parts':[[2000,6]]},DOI:'10.1215/01642472-18-2_63-33','container-title':['Social Text']}),
 {title:'Free Labor: Producing Culture for the Digital Economy',author:'Tiziana Terranova, Collective X',year:'2000',doi:'10.1215/01642472-18-2_63-33',journal:'Social Text'});
assert.equal(crossrefToPaper({}).title,'');
assert.equal(crossrefToPaper({title:['Free Labor'],subtitle:['Producing Culture for the Digital Economy']}).title,'Free Labor: Producing Culture for the Digital Economy');

// Title search results are accepted only when the titles clearly match.
assert(titleSimilarity('Free Labor: Producing Culture for the Digital Economy','Free labor. Producing culture for the digital economy')>0.9);
assert(titleSimilarity('Free Labor: Producing Culture for the Digital Economy','The Digital Economy and Its Discontents')<0.75);

// Matching found titles: a record stored without its subtitle matches; similar-but-different works do not;
// Chinese titles compare by characters; agreeing authors raise the score, disagreeing ones lower it.
assert(matchScore('Free Labor: Producing Culture for the Digital Economy','Free Labor')>=0.9);
assert(matchScore('Bourdieu and the sociology of translation: the case of Italian translations of Joyce','Bourdieu and the Sociology of Translation and Interpreting')<0.8);
assert(matchScore('翻译社会学的理论视角','翻译社会学的理论视角研究')>0.85);
assert(matchScore('翻译社会学的理论视角','从目的翻译理论视角看庄子')<0.5);
assert(candidateScore({title:'Translation and Globalization',author:'Michael Cronin'},{title:'Translation and Globalization',author:'Michael Cronin'})===1);
assert(candidateScore({title:'Translation and Globalization',author:'Michael Cronin'},{title:'Translation and Globalization',author:'Someone Else'})<0.95);
assert.deepEqual(openalexToPaper({display_name:'Constructing a Sociology of Translation',authorships:[{author:{display_name:'Michaela Wolf'}},{author:{display_name:'Alexandra Fukari'}}],publication_year:2007,doi:'https://doi.org/10.1075/btl.74',primary_location:{source:{display_name:'Benjamins Translation Library'}}}),
 {title:'Constructing a Sociology of Translation',author:'Michaela Wolf, Alexandra Fukari',year:'2007',doi:'10.1075/btl.74',journal:'Benjamins Translation Library'});

// Duplicates by DOI (any form) or by title ignoring case and punctuation.
const lib=[{title:'Free Labor: Producing Culture',doi:'10.1215/01642472-18-2_63-33'},{title:'Platform Capitalism',doi:''}];
assert.equal(findDuplicate(lib,{doi:'https://doi.org/10.1215/01642472-18-2_63-33',title:'x'}),lib[0]);
assert.equal(findDuplicate(lib,{doi:'',title:'platform capitalism.'}),lib[1]);
assert.equal(findDuplicate(lib,{doi:'10.9/new',title:'Something else'}),null);
console.log('PASS: DOI finding, junk PDF fields ignored, title from page layout, Crossref/OpenAlex mapping, title and author matching (incl. CJK), duplicates.');
