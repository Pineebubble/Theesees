'use strict';
/* APA references on papers: shown with italics, copied as rich text (italics survive pasting into Word) and plain
   text, generated from Crossref when a DOI is known or from the paper's own fields otherwise. */
const apaHTML=s=>esc(s||'').replace(/\*([^*]+)\*/g,'<i>$1</i>');
async function copyAPA(p){
 const plain=apaPlain(p.apa),html=apaHTML(p.apa);
 try{
  if(window.ClipboardItem&&navigator.clipboard?.write)await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([plain],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);
  else await navigator.clipboard.writeText(plain);
  toast('APA reference copied.');
 }catch{toast('Could not copy automatically. Select the reference and copy it.');}
}
/* Online only when asked and the paper has a DOI; otherwise uses the stored Crossref record (if it is still for
   this DOI) or the paper's own fields. Returns {apa, source}. */
async function generateAPA(p,{online=false}={}){
 if(online&&p.doi){const c=await lookupDOI(p.doi);if(c?.csl){p.csl=c.csl;return {apa:apaFromCSL(c.csl),source:'Crossref'};}}
 if(p.csl&&normDOI(p.csl.DOI)===normDOI(p.doi))return {apa:apaFromCSL({...p.csl,title:[p.title],subtitle:[]}),source:'Crossref'};
 return {apa:apaFromCSL(paperToCSL(p)),source:'generated'};
}
function fillMissingAPA(){
 const missing=data.papers.filter(p=>!p.apa);
 modal('Fill in missing APA references',`<p>${missing.length?`${plural(missing.length,'paper')} ${missing.length===1?'has':'have'} no APA reference yet.`:'Every paper already has an APA reference.'} References from Crossref include journal, volume, pages and publisher; the rest are built from each paper’s title, authors and year, so check those.</p><form><label class="batch-check"><input type="checkbox" name="online" checked> Look up papers with a DOI on Crossref <small>Sends only the DOI.</small></label>${actions(missing.length?'Fill in':'Close')}</form>`,async(f,form)=>{
  if(!missing.length)return closeModal();
  const btn=form.querySelector('button[type=submit]');btn.disabled=true;let n=0,online=0;
  for(const p of missing){btn.textContent=`Working… ${++n} of ${missing.length}`;const r=await generateAPA(p,{online:!!f.get('online')});p.apa=r.apa;p.apaSource=r.source;if(r.source==='Crossref')online++;}
  save();closeModal();render();toast(`${plural(missing.length,'APA reference')} added${online?`, ${online} from Crossref`:''}.`);
 });
}
document.addEventListener('click',e=>{
 const c=e.target.closest('[data-copy-apa]');if(c){const p=getPaper(c.dataset.copyApa);if(p?.apa)copyAPA(p);return;}
 if(e.target.closest('#fill-apa'))fillMissingAPA();
});
