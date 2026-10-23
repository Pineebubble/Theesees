const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({console,structuredClone,Date,Map,document:{addEventListener(){}}});
vm.runInContext(`let saved=true,formHandler,page='',rendered='',lastModal='';let data={keywords:[{id:'k',title:'Attention',color:5}],papers:[{id:'p',title:'Paper',keywords:['k']}],passages:[{id:'h',paperId:'p',quote:'Source quotation',location:'p. 3'},{id:'h2',paperId:'p',quote:'Counter point',location:'p. 9'}],threads:[{id:'t',title:'Chat',blocks:[{id:'b',role:'AI',text:'Attention works like unpaid labour.',source:{id:'h'}}],passageIds:['h']}],trash:[]};
const uid=(()=>{let n=0;return()=>'c'+(++n);})();const esc=s=>String(s??'').replace(/</g,'&lt;');const colors=['#fff'];
const getPaper=id=>data.papers.find(p=>p.id===id),getKeyword=id=>data.keywords.find(k=>k.id===id);
const save=()=>saved;const modal=(a,b,c)=>{lastModal=b;formHandler=c;};const closeModal=()=>{};const actions=()=>'';const empty=t=>t;const toast=()=>{};const keywordChecks=()=>'';const alpha=(l,k='title')=>[...l].sort((a,b)=>String(a[k]).localeCompare(String(b[k])));
const render=()=>{rendered=page;};const navigate=v=>{page=v;render();};const $=()=>({});
const threadPapers=t=>[getPaper('p')],threadPassages=t=>[data.passages[0]];`,c);
vm.runInContext(fs.readFileSync(__dirname+'/dist/claims.js','utf8'),c);
const run=s=>vm.runInContext(s,c);
run(`renderClaim=()=>{};`);

// Promote an AI reply: origin and source passage kept; AI text is not copied as your claim.
run(`promoteBlock(data.threads[0],data.threads[0].blocks[0]);`);
assert.match(run('lastModal'),/From the conversation: Attention works/);
assert.doesNotMatch(run('lastModal'),/<textarea[^>]*>Attention works/);
run(`formHandler({get:k=>({text:'Attention is extracted without a wage.',status:'Hunch',relation:'supports'})[k],getAll:()=>['k']});`);
assert.equal(run('data.claims.length'),1);
assert.equal(run('JSON.stringify(data.claims[0].origins)'),JSON.stringify([{threadId:'t',blockId:'b'}]));
assert.equal(run('JSON.stringify(data.claims[0].evidence)'),JSON.stringify([{passageId:'h',relation:'supports'}]));
assert.equal(run('claimForBlock("b").id'),run('data.claims[0].id'));
assert.equal(run('claimGaps(data.claims[0]).join()'),'No counter-evidence');
// Promoting the same comment again opens the existing thought instead of duplicating it.
run(`promoteBlock(data.threads[0],data.threads[0].blocks[0]);`);
assert.equal(run('data.claims.length'),1);assert.equal(run('page'),'claim');

// Linking evidence: relations are saved; passages not shown (in Trash) keep their links.
run(`const cl=data.claims[0];linkEvidence(cl);formHandler({get:k=>({'rel-h':'supports','rel-h2':'challenges'})[k]||''});`);
assert.equal(run('claimGaps(data.claims[0]).length'),0);
assert.match(run('evidenceSummary(data.claims[0])'),/Supports 1.*Challenges 1/);
run(`data.trash.push({type:'passage',item:data.passages.pop()});linkEvidence(data.claims[0]);formHandler({get:k=>k==='rel-h'?'qualifies':''});`);
assert.equal(run('data.claims[0].evidence.length'),2);
assert.equal(run('liveEvidence(data.claims[0]).length'),1);
run(`data.passages.push(data.trash.pop().item);`);
assert.equal(run('liveEvidence(data.claims[0]).length'),2);
assert.equal(run('claimsForPassage("h2").length'),1);

// Editing keeps earlier wordings; a blank thought is rejected.
run(`editClaim(data.claims[0].id);formHandler({get:k=>({text:'Revised wording',status:'Developing'})[k],getAll:()=>['k']});`);
assert.equal(run('data.claims[0].revisions[0].text'),'Attention is extracted without a wage.');
assert.equal(run('data.claims[0].status'),'Developing');
run(`editClaim(data.claims[0].id);`);
assert.throws(()=>run(`formHandler({get:k=>k==='text'?'   ':'Hunch',getAll:()=>[]})`),/Write the thought/);

// Failed save rolls back.
run(`saved=false;editClaim();formHandler({get:k=>({text:'Unsaved',status:'Hunch'})[k],getAll:()=>[]});saved=true;`);
assert.equal(run('data.claims.length'),1);

// Delete moves to Trash; restore brings it back intact.
run(`deleteClaim(data.claims[0].id);formHandler();`);
assert.equal(run('data.claims.length'),0);assert.equal(run('data.trash.at(-1).type'),'claim');
run(`restoreClaim(data.trash.pop());`);
assert.equal(run('data.claims[0].text'),'Revised wording');
assert.equal(run('JSON.parse(JSON.stringify(data)).claims[0].evidence.length'),2);
console.log('PASS: promote comment with origin and source, no duplicate promotion, evidence relations, trashed-passage links kept, gaps, revisions, validation, save rollback, trash restore.');
