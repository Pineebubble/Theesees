// The app's scripts share one global scope in the browser, so a name declared twice (e.g. two `const plural`)
// stops a whole file from loading. Compile them together, in the page's order, to catch that.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/dist/prototype.html','utf8');
const files=[...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map(m=>m[1]).filter(f=>!f.startsWith('vendor/'));
assert(files.length>5,'expected the app scripts in prototype.html');
const seen=new Map();
for(const f of files){
 const code=fs.readFileSync(__dirname+'/dist/'+f,'utf8');
 for(const m of code.matchAll(/^(?:const|let|class|function)\s+([A-Za-z_$][\w$]*)/gm)){
  assert(!seen.has(m[1]),`"${m[1]}" is declared in both ${seen.get(m[1])} and ${f}`);seen.set(m[1],f);
 }
 new vm.Script(code,{filename:f}); // each file parses on its own
}
new vm.Script(files.map(f=>fs.readFileSync(__dirname+'/dist/'+f,'utf8')).join('\n;\n'),{filename:'all-scripts.js'});
console.log(`PASS: ${files.length} app scripts parse together with no duplicate top-level names.`);
