const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {zipCreate,zipRead,zipCrc32,zipJoin}=require('./dist/backup-zip.js');
(async()=>{
 const enc=new TextEncoder();
 // Known checksum: CRC-32 of "123456789".
 assert.equal(zipCrc32(enc.encode('123456789')),0xcbf43926);
 const pdf=new Uint8Array(200000).map((_,i)=>i*7%256);
 const files=[{name:'theesees/records.json',data:enc.encode(JSON.stringify({papers:[{id:'p',title:'Ünïcode — 翻译'}]}))},{name:'PDFs/Ünïcode — 翻译 (p).pdf',data:pdf},{name:'empty.txt',data:new Uint8Array(0)}];
 const zip=zipJoin(zipCreate(files));
 // Round trip through our own reader.
 const back=await zipRead(zip);
 assert.deepEqual([...back.keys()],files.map(f=>f.name));
 assert.deepEqual(back.get('PDFs/Ünïcode — 翻译 (p).pdf'),pdf);
 assert.equal(JSON.parse(new TextDecoder().decode(back.get('theesees/records.json'))).papers[0].title,'Ünïcode — 翻译');
 // A standard tool can open it, and we can read a file another tool compressed.
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zipcheck-'));
 try{
  fs.writeFileSync(path.join(dir,'ours.zip'),zip);
  const listing=execFileSync('unzip',['-t',path.join(dir,'ours.zip')]).toString();
  assert.match(listing,/No errors detected/);
  fs.writeFileSync(path.join(dir,'note.txt'),'hello '.repeat(5000));
  execFileSync('zip',['-q','-9',path.join(dir,'theirs.zip'),'note.txt'],{cwd:dir});
  const theirs=await zipRead(new Uint8Array(fs.readFileSync(path.join(dir,'theirs.zip'))));
  assert.equal(new TextDecoder().decode(theirs.get('note.txt')),'hello '.repeat(5000));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 // Damage is detected, and non-ZIP input is refused.
 const bad=zip.slice();bad[30+files[0].name.length+3]^=0xff;
 await assert.rejects(zipRead(bad),/damaged/);
 await assert.rejects(zipRead(enc.encode('not a zip at all, sorry')),/not a ZIP/);
 console.log('PASS: ZIP backup round trip (Unicode names, large and empty files), opens in unzip, reads deflated ZIPs, detects damage');
})().catch(e=>{console.error(e);process.exit(1);});
