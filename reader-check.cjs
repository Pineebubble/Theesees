const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const element = () => ({innerHTML:'',textContent:'',hidden:false,style:{},dataset:{},
  classList:{values:new Set(),toggle(k,on){on?this.values.add(k):this.values.delete(k);},
    add(k){this.values.add(k);},remove(k){this.values.delete(k);},contains(k){return this.values.has(k);}},
  setAttribute(){},querySelector(){return element();},querySelectorAll(){return [];},
  scrollIntoView(){},focus(){},showModal(){},close(){},elements:{quote:{value:''},location:{value:''}}});
const document = {querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s);},
  querySelectorAll(){return [];},addEventListener(){},body:element(),fullscreenElement:null};
const context = vm.createContext({document,console,URL,URLSearchParams,Blob,structuredClone,
  location:{search:'?sandbox=1'},crypto:require('node:crypto').webcrypto,
  localStorage:{getItem(){return null;},setItem(){}},setTimeout(){},clearTimeout(){},
  requestAnimationFrame(){},window:{},indexedDB:{}});
let source=fs.readFileSync(__dirname+'/dist/workspace.js','utf8');
source=source.replace("render();if(storageProblem)toast('Could not read existing data. It has not been overwritten.');",'');
vm.runInContext(source,context);
const run = code => vm.runInContext(code,context);
(async()=>{
 run("data={papers:[{id:'p',title:'Test PDF',author:'',year:'',text:'One. Quote. End.',keywords:[],pdfName:'test.pdf',status:'To read'}],passages:[{id:'h',paperId:'p',quote:'Quote.',location:'p.1',start:5,end:11}],keywords:[],threads:[],trash:[]};currentPaper='p';page='reader';getPDF=async()=>new Blob(['fixture'],{type:'application/pdf'});renderReader();");
 await new Promise(resolve=>setImmediate(resolve));
 assert(!elements.get('#main').innerHTML.includes('id="source-text"'));
 assert(elements.get('#main').innerHTML.includes('id="pdf-preview"'));
 assert(elements.get('#record-pane').innerHTML.includes('Paste a passage'));
 assert(elements.get('#pdf-preview').innerHTML.includes('Full-screen PDF'));
 run('setPDFView(true)');
 assert(elements.get('#pdf-preview').classList.contains('pdf-focused'));
 run('setPDFView(false)');
 assert(!elements.get('#pdf-preview').classList.contains('pdf-focused'));
 run("getPaper('p').readingMode='text';renderReader();");
 assert(elements.get('#main').innerHTML.includes('id="source-text"'));
 assert(!elements.get('#main').innerHTML.includes('id="pdf-preview"'));
 assert(elements.get('#main').innerHTML.includes('Clear text'));
 run("updateOriginalText(getPaper('p'),'Intro. One. Quote. End.')");
 assert.equal(run("data.passages[0].start"),12);
 run("updateOriginalText(getPaper('p'),'')");
 assert.equal(run('data.passages.length'),1);
 assert.equal(run('data.passages[0].sourceDetached'),true);
 run("updateOriginalText(getPaper('p'),'One. Quote. End.')");
 assert.equal(run('data.passages[0].start'),5);
 run("updateOriginalText(getPaper('p'),'Quote. Quote.')");
 assert.equal(run('data.passages[0].start'),null);
 run("let detailsSubmit;modal=(title,body,submit)=>{detailsSubmit=submit;};const originalRender=render;render=()=>{};const preservedPaper=JSON.stringify(data.papers[0]);const preservedPassages=JSON.stringify(data.passages);editPaperDetails('p');detailsSubmit(new Map([['title',' Corrected title '],['author',' Corrected author '],['year',' 2024 ']]));");
 assert.equal(run("getPaper('p').title"),'Corrected title');
 assert.equal(run("getPaper('p').author"),'Corrected author');
 assert.equal(run("getPaper('p').year"),'2024');
 assert.equal(run("getPaper('p').pdfName"),'test.pdf');
 assert.equal(run("JSON.stringify(data.passages)===preservedPassages"),true);
 assert.equal(run("JSON.stringify({...getPaper('p'),title:'Test PDF',author:'',year:''})===preservedPaper"),true);
 assert.throws(()=>run("detailsSubmit(new Map([['title','   '],['author',''],['year','']]))"),/Enter a title/);
 run("const originalSave=save;save=()=>false;detailsSubmit(new Map([['title','Unsaved title'],['author',''],['year','']]));save=originalSave;render=originalRender;");
 assert.equal(run("getPaper('p').title"),'Corrected title');
 console.log('PASS: reader, passages, metadata edits, blank-title validation, preserved attachments and links, failed-save rollback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
