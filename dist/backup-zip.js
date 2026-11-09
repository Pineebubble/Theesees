'use strict';
/* A small ZIP writer and reader for Theesees backups. No DOM, so it is tested in Node (backup-check.cjs).
   Files are stored uncompressed (PDFs and pictures are compressed already), which keeps writing simple and fast.
   Reading also accepts compressed ("deflate") entries, in case a backup was re-zipped by another program.
   ZIP64 is not supported: a backup must stay under 4 GB, far beyond what a browser will store. */
const ZIP_CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function zipCrc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=ZIP_CRC[(c^bytes[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipDosTime(d){return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};}
/* entries: [{name, data: Uint8Array}] → array of Uint8Array parts that together form the ZIP file. */
function zipCreate(entries,when=new Date()){
 const enc=new TextEncoder(),{time,date}=zipDosTime(when),parts=[],central=[];let offset=0;
 for(const e of entries){
  const name=enc.encode(e.name),data=e.data,crc=zipCrc32(data);
  if(offset+data.length>0xffffffff)throw Error('This backup is too large for a ZIP file (over 4 GB).');
  const local=new DataView(new ArrayBuffer(30));
  // Local file header: signature, version, flags (UTF-8 names), method 0 (stored), time, date, crc, sizes, name length.
  local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(6,0x0800,true);local.setUint16(8,0,true);
  local.setUint16(10,time,true);local.setUint16(12,date,true);local.setUint32(14,crc,true);local.setUint32(18,data.length,true);local.setUint32(22,data.length,true);local.setUint16(26,name.length,true);local.setUint16(28,0,true);
  parts.push(new Uint8Array(local.buffer),name,data);
  const c=new DataView(new ArrayBuffer(46));
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);
  c.setUint16(12,time,true);c.setUint16(14,date,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);
  c.setUint32(42,offset,true);central.push(new Uint8Array(c.buffer),name);
  offset+=30+name.length+data.length;
 }
 const size=central.reduce((n,p)=>n+p.length,0),end=new DataView(new ArrayBuffer(22));
 end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,size,true);end.setUint32(16,offset,true);
 return [...parts,...central,new Uint8Array(end.buffer)];
}
/* bytes: Uint8Array of a ZIP file → Map(name → Uint8Array). Reads the central directory, so it copes with files
   added by other tools; checks every file's checksum. */
async function zipRead(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dec=new TextDecoder();
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('This is not a ZIP file.');
 const count=v.getUint16(eocd+10,true);let p=v.getUint32(eocd+16,true);const out=new Map();
 for(let n=0;n<count;n++){
  if(v.getUint32(p,true)!==0x02014b50)throw Error('The backup file is damaged (its file list is unreadable).');
  const method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),csize=v.getUint32(p+20,true),nlen=v.getUint16(p+28,true),xlen=v.getUint16(p+30,true),clen=v.getUint16(p+32,true),local=v.getUint32(p+42,true);
  const name=dec.decode(bytes.subarray(p+46,p+46+nlen));p+=46+nlen+xlen+clen;
  if(name.endsWith('/'))continue;
  const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true),raw=bytes.subarray(start,start+csize);
  let data;
  if(method===0)data=raw;
  else if(method===8)data=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  else throw Error(`“${name}” uses a compression this app can’t read.`);
  if(zipCrc32(data)!==crc)throw Error(`The backup file is damaged (“${name}” does not match its checksum).`);
  out.set(name,data);
 }
 return out;
}
const zipJoin=parts=>{const n=parts.reduce((a,p)=>a+p.length,0),u=new Uint8Array(n);let o=0;for(const p of parts){u.set(p,o);o+=p.length;}return u;};

if(typeof module!=='undefined')module.exports={zipCreate,zipRead,zipCrc32,zipJoin};
