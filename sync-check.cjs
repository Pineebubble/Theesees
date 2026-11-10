const assert=require('node:assert/strict');
const {syncDecide,syncPlanFiles,syncRecord,syncPath,syncKnownPaths}=require('./dist/sync-core.js');
const d=o=>syncDecide({folderStamp:'F1',seenStamp:'F1',changedAt:null,syncedAt:'2026-11-09T10:00:00Z',localHasContent:true,...o});
// First laptop, empty folder: write to it.
assert.equal(d({folderStamp:null}),'push');
// Nothing new anywhere.
assert.equal(d({}),'idle');
// Only this browser changed: save to folder. Only the folder changed (other laptop): load it.
assert.equal(d({changedAt:'2026-11-09T11:00:00Z'}),'push');
assert.equal(d({folderStamp:'F2'}),'load');
// Both changed since the last sync: ask. Unless this browser is empty, then just load.
assert.equal(d({folderStamp:'F2',changedAt:'2026-11-09T11:00:00Z'}),'conflict');
assert.equal(d({folderStamp:'F2',changedAt:'2026-11-09T11:00:00Z',localHasContent:false}),'load');
// Second laptop connecting for the first time: with its own work → ask; empty → load.
assert.equal(d({seenStamp:null,syncedAt:null,changedAt:'2026-11-01T09:00:00Z'}),'conflict');
assert.equal(d({seenStamp:null,syncedAt:null,changedAt:null,localHasContent:false}),'load');
// Changes before the last sync don't count.
assert.equal(d({changedAt:'2026-11-09T09:00:00Z'}),'idle');
// Another laptop overwrote our last write without having it (sync apps copy whole files): ask, don't load.
assert.equal(d({folderStamp:'B2',seenStamp:'A2',ownStamp:'A2',folderHistory:['A1','B1']}),'conflict');
// It had our write (it is in the history): loading is safe.
assert.equal(d({folderStamp:'B2',seenStamp:'A2',ownStamp:'A2',folderHistory:['A1','A2']}),'load');
// We wrote last and nothing changed since: idle. We only loaded (no own write): newer folder versions load.
assert.equal(d({folderStamp:'A2',seenStamp:'A2',ownStamp:'A2',folderHistory:['A1']}),'idle');
assert.equal(d({folderStamp:'B3',seenStamp:'B1',ownStamp:null,folderHistory:['B1','B2']}),'load');
// Files: write new or changed ones, remove ones deleted here, never touch other files in the folder.
const local=[{store:'pdfs',key:'p1',size:100,type:'application/pdf'},{store:'pdfs',key:'p2',size:50,type:'application/pdf'},{store:'images',key:'i/1',size:7,type:'image/png'}];
const folder=new Map([['PDFs/p1.pdf',100],['PDFs/p2.pdf',49],['PDFs/gone.pdf',10],['Pictures/old.png',3],['notes.txt',5]]);
const plan=syncPlanFiles(local,folder,new Set(['PDFs/gone.pdf','Pictures/old.png']));
assert.deepEqual(plan.write.map(f=>f.path),['PDFs/p2.pdf','Pictures/i_1.png']);
assert.deepEqual(plan.remove,['PDFs/gone.pdf','Pictures/old.png']);
// A PDF another laptop added (not in the version this write is based on) is never removed.
assert.deepEqual(syncPlanFiles(local,folder,new Set(['Pictures/old.png'])).remove,['Pictures/old.png']);
assert.deepEqual([...syncKnownPaths({files:{pdfs:{a:{path:'PDFs/a.pdf'}},images:{}}})],['PDFs/a.pdf']);
assert.equal(syncPath('pdfs','../evil','application/pdf'),'PDFs/.._evil.pdf');
// The workspace file records each file's path and size, and a stamp unique to this save and browser.
const rec=syncRecord({papers:[]},local,{device:'dev1',label:'Mac'},{stamp:'S1',history:['S0']});assert.deepEqual(rec.history,['S0','S1']);
assert.equal(rec.files.pdfs.p2.path,'PDFs/p2.pdf');assert.equal(rec.files.images['i/1'].size,7);assert.match(rec.stamp,/\|dev1$/);
console.log('PASS: sync folder rules (push, load, conflict, idle, first connect on each laptop) and file plan');
