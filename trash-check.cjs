const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({console,structuredClone,Date,setInterval(){},document:{addEventListener(){}},sandbox:true});
vm.runInContext(`let storageProblem=false,ok=true;let data={papers:[],threads:[{id:'t',blocks:[{id:'b',text:'Secret deleted note',images:[{id:'pic-b'}],revisions:[{text:'old'}],deleted:true,parentId:null},{id:'child',text:'Keep reply',parentId:'b'}]}],trash:[{id:'old',type:'keyword',item:{id:'k'},at:'2000-01-01'},{id:'gone',type:'thread',item:{id:'t2',blocks:[{id:'x',images:[{id:'pic-x'}]}]},at:'2000-01-01'}]};function save(){return ok;}function showTrash(){}let goneImages=[];function deleteImages(ids){goneImages.push(...ids);}`,c);
vm.runInContext(fs.readFileSync(__dirname+'/dist/trash.js','utf8'),c);
const run=s=>vm.runInContext(s,c);
assert.equal(run('data.trash.length'),2); // Existing trash starts a new grace period.
run('const start=Date.parse(data.trashPolicyStarted);maintainTrash(start+29*86400000);');
assert.equal(run('data.threads[0].blocks[0].text'),'Secret deleted note');
run('ok=false;maintainTrash(start+31*86400000);');
assert.equal(run('data.trash.length'),2);
assert.equal(run('goneImages.length'),0); // nothing deleted while the save failed
assert.equal(run('data.threads[0].blocks[0].text'),'Secret deleted note');
run('ok=true;maintainTrash(start+31*86400000);');
assert.equal(run('data.trash.length'),0);
assert.equal(run('data.threads[0].blocks[0].text'),undefined);
assert.equal(run('data.threads[0].blocks[0].revisions'),undefined);
assert.equal(run('data.threads[0].blocks[0].expired'),true);
assert.equal(run('data.threads[0].blocks[1].text'),'Keep reply');
assert.equal(run('data.threads[0].blocks[1].parentId'),'b');
assert.equal(run('goneImages.sort().join()'),'pic-b,pic-x'); // pictures of expired comments and discussions are deleted
// Emptying Trash removes everything still in it at once, deleted comments included.
run(`data.trash.push({id:'n1',type:'keyword',item:{id:'kk'},at:new Date().toISOString(),expiresAt:Date.now()+20*86400000});data.threads[0].blocks.push({id:'d2',text:'Recent deletion',deleted:true,deletedAt:new Date().toISOString(),parentId:null});`);
assert.equal(run('trashCount()'),2);
run('maintainTrash(Number.MAX_SAFE_INTEGER);');
assert.equal(run('trashCount()'),0);assert.equal(run('data.threads[0].blocks.find(b=>b.id==="d2").text'),undefined);
console.log('PASS: 30-day grace period, expiry, removal of comment contents and history, surviving reply links, failed-save rollback, pictures removed on expiry.');
