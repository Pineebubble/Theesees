const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({console,document:{addEventListener(){},querySelector(){return null;}},NodeFilter:{}});
vm.runInContext(`const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');const alpha=a=>[...a].sort((x,y)=>x.title.localeCompare(y.title));const plural=(n,w)=>n+' '+w+(n===1?'':'s');
let data={keywords:[{id:'k',title:'Sociologie'}],papers:[{id:'p',title:'Le Traducteur invisible',author:'Venuti',year:'1995',keywords:['k'],pdfName:'v.pdf',text:''},{id:'q',title:'翻译社会学',author:'王',year:'2020',keywords:[],text:'译者在两种文化之间进行调解。'}],passages:[{id:'h',paperId:'p',quote:'Fluency masks the translator.',location:'p. 3'}],threads:[{id:'t',title:'Cosplay',note:'',transcript:'',blocks:[{id:'b',text:'Crossplay challenges gender norms',role:'AI'},{id:'d',text:'deleted fluency',deleted:true}]}],claims:[{id:'c',text:'Fluency hides the translator',status:'Hunch'}],outline:{parts:[{id:'o',level:1,title:'Café culture',note:'',draft:'<p>Translators mediate fluently.</p>'}]}};
const getPaper=id=>data.papers.find(p=>p.id===id),getKeyword=id=>data.keywords.find(k=>k.id===id);const draftPlain=h=>h.replace(/<[^>]+>/g,'');const partNumbers=()=>({o:'1'});`,c);
vm.runInContext(fs.readFileSync(__dirname+'/dist/reading-utils.js','utf8'),c);
vm.runInContext(fs.readFileSync(__dirname+'/dist/search.js','utf8'),c);
const run=s=>vm.runInContext(s,c);
// Folding: case and accents ignored, positions map back to the original text.
assert.equal(run(`foldMap('Café').f`),'cafe');
assert.equal(run(`JSON.stringify(parseQuery('  "Plain  Styles" café '))`),'["plain styles","cafe"]');
assert.equal(run(`findTerms('a Café here',parseQuery('cafe')).hits[0].join()`),'2,6');
// All words must appear; phrases must appear together.
assert.ok(run(`findTerms('fluency masks the translator',parseQuery('translator fluency'))`));
assert.equal(run(`findTerms('fluency masks the translator',parseQuery('"translator fluency"'))`),null);
assert.match(run(`snippetHTML(findTerms('Fluency masks the translator.',parseQuery('fluency translator')))`),/<mark>Fluency<\/mark> masks the <mark>translator<\/mark>/);
// Results land in the right groups, deleted comments are skipped, PDF pages are searched.
run(`searchPdfText.set('p',{name:'v.pdf',size:1,pages:['nothing here','The fluent translator disappears.'],labels:['i','ii']})`);
const g=k=>run(`JSON.stringify(Object.fromEntries(Object.entries(runSearch(${JSON.stringify(k)})).map(([a,b])=>[a,b.map(x=>x.kind+(x.label?':'+x.label:''))])))`);
assert.equal(g('fluency'),JSON.stringify({papers:[],text:[],passages:['passage:p. 3'],discussions:[],thoughts:['claim:Hunch'],writing:[]}));
assert.equal(g('translator disappears'),JSON.stringify({papers:[],text:['pdf:p. ii'],passages:[],discussions:[],thoughts:[],writing:[]}));
assert.equal(g('crossplay'),JSON.stringify({papers:[],text:[],passages:[],discussions:['comment:AI reply'],thoughts:[],writing:[]}));
assert.equal(g('cafe'),JSON.stringify({papers:[],text:[],passages:[],discussions:[],thoughts:[],writing:['part:section']}));
assert.equal(g('sociologie venuti'),JSON.stringify({papers:['paper'],text:[],passages:[],discussions:[],thoughts:[],writing:[]}));
assert.equal(g('文化之间'),JSON.stringify({papers:[],text:['srctext:pasted text'],passages:[],discussions:[],thoughts:[],writing:[]}));
console.log('PASS: search folding (case, accents), all-words and "phrase" matching, snippets, every group incl. PDF pages, Chinese, deleted comments skipped');
