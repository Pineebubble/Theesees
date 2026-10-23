const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({console,structuredClone,Date,Map,document:{addEventListener(){}}});
vm.runInContext(`let saved=true,formHandler,page='',lastModal='';let data={keywords:[],papers:[{id:'p',title:'Audience commodity',author:'Dallas Smythe',year:'1977',doi:'10.1/x',keywords:[]},{id:'q',title:'Free labour',author:'Tiziana Terranova, Jane Doe, Ann Lee',year:'2000',keywords:[]},{id:'u',title:'Uncited',author:'Nobody',year:'1999',keywords:[]}],passages:[{id:'h',paperId:'p',quote:'Attention is\\na commodity.',location:'p. 3'},{id:'h2',paperId:'q',quote:'Free labour is unwaged.',location:'p. 33'}],threads:[],trash:[],claims:[]};
const uid=(()=>{let n=0;return()=>'x'+(++n);})();const esc=s=>String(s??'').replace(/</g,'&lt;');const colors=['#fff'];
const getPaper=id=>data.papers.find(p=>p.id===id),getKeyword=id=>data.keywords.find(k=>k.id===id);
const save=()=>saved;const modal=(a,b,c)=>{lastModal=b;formHandler=c;};const closeModal=()=>{};const actions=()=>'';const empty=t=>t;const toast=()=>{};const keywordChecks=()=>'';
const plural=(n,w)=>n+' '+w+(n===1?'':'s');const render=()=>{};const navigate=v=>{page=v;};const $=()=>({});const $$=()=>[];const threadPapers=()=>[],threadPassages=()=>[];`,c);
vm.runInContext(fs.readFileSync(__dirname+'/dist/claims.js','utf8'),c);
vm.runInContext(fs.readFileSync(__dirname+'/dist/draft.js','utf8'),c);
vm.runInContext(fs.readFileSync(__dirname+'/dist/outline.js','utf8'),c);
const run=s=>vm.runInContext(s,c);
run(`renderOutline=()=>{};renderClaim=()=>{};
const form=o=>({get:k=>o[k]??'',getAll:()=>[]});
const addPart=(title,opts)=>{editPart(null,opts);formHandler(form({title,note:''}));return data.outline.parts.at(-1).id===undefined?null:data.outline.parts.find(p=>p.title===title).id;};
const ch1=addPart('Chapter one'),ch2=addPart('Chapter two');
const s1=addPart('Section A',{level:2,chapterId:ch1}),s2=addPart('Section B',{level:2,chapterId:ch1});
const mk=(text,status,evidence)=>{const c=newClaim(text,{status,evidence});data.claims.push(c);return c.id;};
const a=mk('Attention is extracted like labour.','Developing',[{passageId:'h',relation:'supports'},{passageId:'h2',relation:'challenges'}]);
const b=mk('The wage is what is missing.','Hunch',[]);
const z=mk('Dropped idea.','Abandoned',[{passageId:'h2',relation:'supports'}]);`);
const titles=()=>run('data.outline.parts.map(p=>p.title).join("|")');
// Sections are inserted at the end of their own chapter, not at the end of the outline.
assert.equal(titles(),'Chapter one|Section A|Section B|Chapter two');
assert.equal(run('Object.values(partNumbers()).join()'),'1,1.1,1.2,2');
assert.throws(()=>run(`editPart();formHandler(form({title:'  '}))`),/Enter a title/);

// Placement: one place per thought, ordered, removable.
run(`placeClaim(a,s1);placeClaim(b,s1);placeClaim(z,s2);`);
assert.equal(run('getPart(s1).claimIds.join()'),run('[a,b].join()'));
run(`placeClaim(b,s1,0);`);assert.equal(run('getPart(s1).claimIds.join()'),run('[b,a].join()'));
run(`moveClaim(b,1);`);assert.equal(run('getPart(s1).claimIds.join()'),run('[a,b].join()'));
run(`placeClaim(b,ch2);`);assert.equal(run('placementOf(b).id'),run('ch2'));assert.equal(run('getPart(s1).claimIds.length'),1);
assert.equal(run('partPath(getPart(s2))'),'Chapter one › Section B');

// Moving: a chapter moves with its sections; a section can move into the neighbouring chapter.
run(`movePart(ch2,-1);`);assert.equal(titles(),'Chapter two|Chapter one|Section A|Section B');
run(`movePart(ch2,1);`);assert.equal(titles(),'Chapter one|Section A|Section B|Chapter two');
run(`movePart(s2,1);`);assert.equal(titles(),'Chapter one|Section A|Chapter two|Section B');
assert.equal(run('chapterOf(getPart(s2)).title'),'Chapter two');
run(`movePart(s2,-1);movePart(s1,-1);`);assert.equal(titles(),'Chapter one|Section A|Section B|Chapter two');

// Markdown: numbered headings, citations, quotes on one line, abandoned thoughts and uncited papers left out.
const md=run('outlineMarkdown()');
assert.match(md,/^## 1 Chapter one$/m);assert.match(md,/^### 1\.1 Section A$/m);assert.match(md,/^## 2 Chapter two$/m);
assert.match(md,/- \*\*Attention is extracted like labour\.\*\*/);
assert.match(md,/Supports: “Attention is a commodity\.” \(Smythe, 1977, p\. 3\)/);
assert.match(md,/Challenges: “Free labour is unwaged\.” \(Terranova et al\., 2000, p\. 33\)/);
assert.doesNotMatch(md,/Dropped idea/);
assert.match(md,/## References\n\n- Dallas Smythe \(1977\)\. \*Audience commodity\*\. https:\/\/doi\.org\/10\.1\/x\n- Tiziana Terranova/);
assert.doesNotMatch(md,/Uncited/);
const brief=run('outlineMarkdown({quotes:false,reasoning:false,status:true})');
assert.match(brief,/\*\*Attention is extracted like labour\.\*\* \(Smythe, 1977, p\. 3\) _\[Developing\]_/);
assert.doesNotMatch(brief,/Challenges:/);
assert.equal(run(`citeName({author:'Smith, J.',title:'T'})`),'Smith');
assert.equal(run(`citeName({author:'Jane Smith and John Doe',title:'T'})`),'Smith & Doe');

// Thoughts in Trash are hidden but keep their place; removing a chapter unplaces its thoughts.
run(`const trashed=data.claims.find(c=>c.id===a);data.claims=data.claims.filter(c=>c.id!==a);`);
assert.doesNotMatch(run('outlineMarkdown()'),/Attention is extracted/);
run(`data.claims.push(trashed);`);assert.equal(run('placementOf(a).id'),run('s1'));
run(`deletePart(ch1);formHandler();`);
assert.equal(titles(),'Chapter two');assert.equal(run('placementOf(a)'),undefined);assert.equal(run('data.claims.length'),3);

// Failed save rolls back.
run(`saved=false;placeClaim(b,null);saved=true;`);assert.equal(run('placementOf(b).id'),run('ch2'));
assert.equal(run('JSON.parse(JSON.stringify(data.outline)).parts[0].claimIds.length'),1);
// Written text: exported under its heading, with its citations added to the references; optional on export.
run(`data.outline.parts=[{id:'w1',level:1,title:'Written chapter',note:'',claimIds:[],draft:'<p>Fluency is <strong>not</strong> neutral <span class="cite" contenteditable="false" data-paper="u">(Nobody, 1999)</span>.</p>'}];`);
let wmd=run('outlineMarkdown()');
assert.match(wmd,/## 1 Written chapter\n\nFluency is \*\*not\*\* neutral \(Nobody, 1999\)\./);
assert.match(wmd,/## References[\s\S]*Uncited/); // the paper cited in the text is now listed
assert.doesNotMatch(run('outlineMarkdown({drafts:false})'),/Fluency/);
// Removing a part that has writing sends it to Trash, where it can be restored.
run(`data.trash=[];deletePart('w1');formHandler();`);
assert.equal(run('data.outline.parts.length'),0);assert.equal(run('data.trash[0].type'),'outline');assert.equal(run('data.trash[0].parts[0].draft.includes("Fluency")'),true);
console.log('PASS: chapters/sections, numbering, placement and order, chapter/section moves, Markdown headings, citations, references, export options, trashed thoughts, removal unplaces, save rollback, written text in export and references, parts with writing go to Trash.');
