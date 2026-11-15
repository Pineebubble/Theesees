const assert=require('node:assert/strict');
const {zoteroPlan,zoteroApply,zoteroPlanEmpty,zoteroPaperFields,zoteroLink,zoteroDoi}=require('./dist/zotero-core.js');
let n=0;const newId=()=>'id'+(++n);
const ann=(key,parent,o={})=>({key,data:{itemType:'annotation',parentItem:parent,annotationType:'highlight',annotationText:' Quote '+key+' ',annotationComment:'',annotationPageLabel:'12',annotationSortIndex:'00011|000100|00000',annotationPosition:'{"pageIndex":3,"rects":[]}',dateAdded:'2026-10-30T09:00:00Z',dateModified:'2026-11-01T10:00:00Z',...o}});
const note=(key,parent,comment,o={})=>ann(key,parent,{annotationType:'note',annotationText:'',annotationComment:comment,...o});
const pdf=(key,parent,o={})=>({key,data:{itemType:'attachment',contentType:'application/pdf',parentItem:parent,title:'Full Text PDF',filename:'smith.pdf',...o}});
const top=(key,o={})=>({key,data:{itemType:'journalArticle',title:'Reading as Work',creators:[{creatorType:'author',firstName:'Ada',lastName:'Smith'},{creatorType:'editor',lastName:'Ed'},{creatorType:'author',name:'The Lab'}],date:'March 2019',DOI:'https://doi.org/10.1000/ABC',...o}});
const fresh=()=>({papers:[],passages:[],threads:[]});

// A Zotero item becomes a paper: authors only (not editors), a four-digit year, a bare lower-case DOI.
assert.deepEqual(zoteroPaperFields(top('T1').data),{title:'Reading as Work',author:'Ada Smith, The Lab',year:'2019',doi:'10.1000/abc'});
assert.equal(zoteroDoi('doi: 10.1/X'),'10.1/x');
// A PDF filed on its own is named after its file when it has no title.
assert.equal(zoteroPaperFields({filename:'Notes on method.pdf'}).title,'Notes on method');

// First sync. A1: a highlight → a passage. A2: a highlight with a comment → a passage + a discussion linked
// to it. N1: a note with no quoted text → a discussion under the paper. Drawings and empty notes are left out.
let data=fresh();
const lib={annotations:[ann('A2','P1',{annotationSortIndex:'00020|000100|00000',annotationComment:' Is this the same claim as in ch. 2?\nCheck. '}),ann('A1','P1'),note('N1','P1','A thought with no quote',{annotationSortIndex:'00030|000100|00000'}),note('N0','P1',''),ann('I1','P1',{annotationType:'ink',annotationText:''}),ann('O1','GONE')],attachments:[pdf('P1','T1')],tops:[top('T1')]};
let plan=zoteroPlan(lib,data,newId);
assert.equal(plan.papers.length,1);assert.deepEqual(plan.passages.map(h=>h.zoteroKey),['A1','A2']);assert.deepEqual(plan.threads.map(t=>t.zoteroKey),['A2','N1']);
assert.deepEqual(plan.skipped,{empty:2,removedHere:0,noPaper:1});
assert.equal(data.papers.length,0,'planning changes nothing');
zoteroApply(plan,data);
const paper=data.papers[0],[h1,h2]=data.passages,[t2,tn]=data.threads;
assert.equal(paper.zoteroKey,'T1');assert.equal(h1.paperId,paper.id);
assert.equal(h1.quote,'Quote A1');assert.equal(h1.location,'p. 12');assert.equal(h1.start,null);assert.equal('zoteroComment' in h1,false);
assert.equal(zoteroLink(h1),'zotero://open-pdf/library/items/P1?page=4&annotation=A1');assert.equal(zoteroLink({quote:'typed here'}),'');
// The comment's discussion: linked to its passage, one comment by you, titled by its first line.
assert.deepEqual(t2.passageIds,[h2.id]);assert.deepEqual(t2.paperIds,[]);assert.equal(t2.title,'Is this the same claim as in ch. 2?');
assert.equal(t2.blocks.length,1);assert.equal(t2.blocks[0].role,'Me');assert.equal(t2.blocks[0].text,'Is this the same claim as in ch. 2?\nCheck.');assert.deepEqual(t2.blocks[0].source,{id:h2.id,paperId:paper.id,quote:'Quote A2',location:'p. 12'});
// The quote-less note's discussion: under the paper, no passage.
assert.deepEqual(tn.paperIds,[paper.id]);assert.deepEqual(tn.passageIds,[]);assert.equal(tn.blocks[0].source,null);assert.equal(tn.status,'Open');
assert.deepEqual(data.zoteroSeen.sort(),['A1','A2','note:A2','note:N1']);

// Syncing again with nothing new does nothing.
plan=zoteroPlan(lib,data,newId);assert.ok(zoteroPlanEmpty(plan));assert.equal(plan.upToDate,3);

// Changes in Zotero: A1's highlight is extended and gains a comment; A2's comment is reworded; A3 is new.
lib.annotations[1]=ann('A1','P1',{annotationText:'Quote A1, extended',annotationComment:'Added later',dateModified:'2026-11-02T10:00:00Z'});
lib.annotations[0]=ann('A2','P1',{annotationSortIndex:'00020|000100|00000',annotationComment:'Reworded in Zotero',dateModified:'2026-11-02T11:00:00Z'});
lib.annotations.push(ann('A3','P1'));
plan=zoteroPlan(lib,data,newId);assert.equal(plan.papers.length,0);assert.deepEqual(plan.updates.map(u=>u.id).sort(),[h1.id,h2.id].sort());assert.deepEqual(plan.passages.map(h=>h.zoteroKey),['A3']);assert.deepEqual(plan.threads.map(t=>t.zoteroKey),['A1']);
zoteroApply(plan,data);
assert.equal(data.passages.find(h=>h.zoteroKey==='A1').quote,'Quote A1, extended');assert.equal(data.passages.find(h=>h.zoteroKey==='A1').id,h1.id,'same passage, so its discussions stay linked');
assert.equal(t2.blocks[0].text,'Reworded in Zotero');assert.equal(data.threads.length,3);
// A comment edited in Theesees is not overwritten by a later change in Zotero.
t2.blocks[0].text='My better wording, written in Theesees';
lib.annotations[0]=ann('A2','P1',{annotationComment:'Reworded again in Zotero',dateModified:'2026-11-03T11:00:00Z'});
zoteroApply(zoteroPlan(lib,data,newId),data);assert.equal(t2.blocks[0].text,'My better wording, written in Theesees');
assert.ok(zoteroPlanEmpty(zoteroPlan(lib,data,newId)),'and it is not offered again');

// What you delete in Theesees does not come back: a passage (its comment stays out with it), or just a discussion.
data.passages.push({id:'mine',paperId:paper.id,quote:'typed here',location:'p. 1',start:null,end:null});
data.passages=data.passages.filter(h=>h.zoteroKey!=='A1');data.threads=data.threads.filter(t=>t.zoteroKey==='A2');
plan=zoteroPlan(lib,data,newId);assert.ok(zoteroPlanEmpty(plan));assert.equal(plan.skipped.removedHere,2);
zoteroApply(plan,data);assert.ok(data.passages.some(h=>h.id==='mine'),'work typed in Theesees is never touched');

// A paper already in Theesees is matched, not duplicated: by DOI, or by title (and year when both have one).
data={...fresh(),papers:[{id:'p-doi',title:'Another title',doi:'10.1000/abc',year:''},{id:'p-title',title:'  The Second: Paper!',year:'2020',doi:''}]};
plan=zoteroPlan({annotations:[ann('B1','P1'),note('B2','P2','note on the second'),ann('B3','P3')],attachments:[pdf('P1','T1'),pdf('P2','T2'),pdf('P3','T3')],tops:[top('T1'),top('T2',{title:'the second paper',date:'2020',DOI:''}),top('T3',{title:'the second paper',date:'1999',DOI:''})]},data,newId);
assert.deepEqual(plan.link,[{id:'p-doi',zoteroKey:'T1'},{id:'p-title',zoteroKey:'T2'}]);assert.equal(plan.papers.length,1,'same title, different year: a different paper');
zoteroApply(plan,data);assert.equal(data.papers.length,3);assert.equal(data.passages.find(h=>h.zoteroKey==='B1').paperId,'p-doi');assert.deepEqual(data.threads[0].paperIds,['p-title']);

// A PDF with no parent item in Zotero still gets a paper; annotations in Zotero's trash are left out.
data=fresh();plan=zoteroPlan({annotations:[ann('C1','P9'),ann('C2','P9',{deleted:1})],attachments:[pdf('P9',undefined,{title:''})],tops:[]},data,newId);
assert.equal(plan.papers[0].title,'smith');assert.equal(plan.papers[0].zoteroKey,'P9');assert.equal(plan.passages.length,1);
console.log('PASS: Zotero sync rules (highlight → passage, comment → linked discussion, quote-less note → discussion; matched, updated, never deleted or resurrected)');
