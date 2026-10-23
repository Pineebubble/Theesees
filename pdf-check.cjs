const assert=require('node:assert/strict');
const {normalizeQuote,buildPdfIndex,findPassage,matchSegments,locationPage}=require('./dist/pdf-match.js');

// Text items as PDF.js returns them: lines split into items, hyphenated line breaks, ligatures, curly quotes.
const pages=[
 ['Introduction','The audience commodity is pro-','duced and sold to advertisers.','Attention is ﬁnite.'],
 ['On page two: “free labour” is','simultaneously voluntarily given and','unwaged, enjoyed and exploited.'],
 ['Again: the audience commodity is produced and sold to advertisers.','合作与剥削并存。'],
];
const index=buildPdfIndex(pages);
assert.equal(normalizeQuote('Free-labour, “is” ﬁne!'),'freelabourisfine');

// Exact across items and a hyphenated line break, ignoring punctuation and case.
let m=findPassage(index,'The audience commodity is produced and sold to advertisers.');
assert.equal(m.approx,false);assert.equal(index.page[m.start],1);
let segs=matchSegments(index,m.start,m.end);
assert.deepEqual(segs.map(s=>[s.page,s.item]),[[1,1],[1,2]]);
assert.equal(pages[0][1].slice(segs[0].from,segs[0].to),'The audience commodity is pro');
assert.equal(pages[0][2].slice(segs[1].from,segs[1].to),'duced and sold to advertisers');

// A preferred page picks the nearer of two identical quotes.
m=findPassage(index,'the audience commodity is produced and sold to advertisers',3);
assert.equal(index.page[m.start],3);
assert.equal(locationPage('pp. 12–14'),12);assert.equal(locationPage('p. iv'),null);

// Ligatures and straight quotes in the saved quote still match.
m=findPassage(index,'Attention is finite');assert.equal(m.approx,false);
segs=matchSegments(index,m.start,m.end);assert.equal(pages[0][3].slice(segs[0].from,segs[0].to),'Attention is ﬁnite');

// Spanning several items; curly quotes in the PDF, straight in the quote.
m=findPassage(index,'"free labour" is simultaneously voluntarily given and unwaged');
segs=matchSegments(index,m.start,m.end);assert.equal(segs.length,3);assert.equal(segs[0].page,2);

// CJK text.
m=findPassage(index,'合作与剥削并存');assert.equal(index.page[m.start],3);assert.equal(m.approx,false);

// Edited quote (a word changed) falls back to an approximate match on its opening and closing words.
m=findPassage(index,'simultaneously voluntarily offered and unwaged, enjoyed and exploited');
assert.equal(m.approx,true);assert.equal(index.page[m.start],2);
const hl=index.text.slice(m.start,m.end);assert(hl.startsWith('simultaneously'));assert(hl.endsWith('exploited'));

// Not present, too short, or an empty (scanned) PDF.
assert.equal(findPassage(index,'Nothing like this sentence appears anywhere in the document at all.'),null);
assert.equal(findPassage(index,'is'),null);
assert.equal(findPassage(buildPdfIndex([[],[]]),'The audience commodity'),null);
console.log('PASS: PDF matching ignores breaks/hyphens/ligatures/quotes, maps highlights to items, prefers the stated page, handles CJK, approximate edits, and missing text.');
