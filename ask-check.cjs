const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({console,document:{addEventListener(){},querySelector(){return null;}},NodeFilter:{}});
vm.runInContext(`const esc=s=>String(s??'');const alpha=a=>[...a];const plural=(n,w,m=w+'s')=>n+' '+(n===1?w:m);let page='library',currentPaper=null;
let data={aiNotes:'My thesis: cosplay is intercultural translation.',keywords:[{id:'k',title:'Fandom',note:''}],papers:[{id:'p',title:'Gender, Sexuality, and Cosplay',author:'Rachel Leng',year:'2013',status:'Read',keywords:['k'],pdfName:'l.pdf',relevance:'Core case study',text:''},{id:'q',title:'Hermeneutic Model',author:'Jijon',year:'2018',status:'Reading',keywords:[],text:'Brokers interpret before they adapt.\\n\\nCosplay appears as a sociological example.'}],
 passages:[{id:'h',paperId:'q',quote:'A sociological example is cosplay in North America.',location:'p. 3'}],threads:[{id:'t',title:'Crossplay',created:'2026-11-01',blocks:[{id:'b',text:'Is crossplay a kind of foreignizing translation?',role:'Me',at:'2026-11-02'}]}],
 claims:[{id:'c',text:'Crossplay performs the foreign Other',status:'Developing',evidence:[{relation:'supports'},{relation:'challenges'}]}],outline:{parts:[{id:'o',level:1,title:'Fandom as translation',note:'',claimIds:['c'],draft:'<p>Cosplay translates characters into bodies.</p>'}]}};
const getPaper=id=>data.papers.find(p=>p.id===id),getKeyword=id=>data.keywords.find(k=>k.id===id);const draftPlain=h=>h.replace(/<[^>]+>/g,'');const partNumbers=()=>({o:'1'});const partWords=p=>draftPlain(p.draft||'').split(/\\s+/).filter(Boolean).length;
const threadPapers=t=>[];const aboutData=()=>({name:'J.',field:'Translation studies',question:'How is fandom a form of translation?'});`,c);
for(const f of ['reading-utils.js','search.js','ask-context.js'])vm.runInContext(fs.readFileSync(__dirname+'/dist/'+f,'utf8'),c);
const run=s=>vm.runInContext(s,c);
// Keywords: stop-words dropped, phrases kept whole, Chinese split into character pairs.
assert.equal(run(`acKeywords('What does the paper say about "foreign Other" and crossplay?').join('|')`),'foreign other|crossplay');
assert.equal(run(`acKeywords('翻译社会学').join('|')`),'翻译|译社|社会|会学');
// Overview: research question, notes, progress, evidence counts, outline.
const ov=run('acOverview()');
for(const s of ['Research question: How is fandom a form of translation?','My thesis: cosplay is intercultural translation.','2 papers (1 read, 1 reading)','[Developing] Crossplay performs the foreign Other (evidence: 1 supports, 1 challenges','1 Fandom as translation','why it matters: Core case study','“Crossplay”'])assert.ok(ov.includes(s),s);
// Library: everything that shares words, best matches first, current paper's text skipped when the page already carries it.
run(`searchPdfText.set('p',{name:'l.pdf',size:1,pages:['Crossplay is distinct from drag.','Nothing relevant.'],labels:null})`);
const lib=run(`JSON.stringify(acLibrary('how crossplay performs the foreign'))`),L=JSON.parse(lib);
assert.match(L.text.split('\n')[0],/^\[1\] Thought \(Developing\)/);
assert.ok(L.text.includes('PDF — Gender, Sexuality, and Cosplay (Rachel Leng, 2013), p. 1'));assert.ok(L.text.includes('Your comment — “Crossplay”'));
assert.ok(!JSON.parse(run(`JSON.stringify(acLibrary('crossplay drag','p'))`)).text.includes('distinct from drag'));
assert.ok(run(`acLibrary('cosplay').text`).includes('Source text — Hermeneutic Model'));
// A question that is mostly instructions still finds the material on its one real topic word.
const wordy=JSON.parse(run(`JSON.stringify(acLibrary('In 3 short bullets: what have I collected so far about crossplay, and how does it bear on my thesis argument? Cite where each point comes from.'))`));
assert.ok(wordy.count>=3,'wordy question finds matches');assert.deepEqual(wordy.kws,['crossplay']);
assert.ok(wordy.text.includes('Thought (Developing)')&&wordy.text.includes('PDF — Gender')&&wordy.text.includes('Your comment'));
console.log('PASS: Ask Claude context: keywords (stop-words, phrases, Chinese), project overview, library ranking and sources, current paper skipped');
