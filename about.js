'use strict';
/* About page: what Theesees is, a card about the researcher (kept in the records, so it travels with an export),
   a few numbers, and some small celebrations around the app. */
const ABOUT_DEFAULT={name:'The researcher',field:'Translation studies · Intercultural communication',bio:'Reads between the lines for a living. Currently following meaning across borders to see what it packs, what it leaves behind and what it picks up on the way, and building this tool so the reading notes stop escaping.',question:'',fuel:'Coffee, probably. Possibly tea. Definitely footnotes.'};
const ABOUT_CHEERS={read:['Another one read! 📚','Paper conquered.','One more voice in the conversation.','The shelf grows wiser.'],claim:['Defensible! Go on, defend it.','That thought has legs now.','Argument: assembled.','Your examiners are trembling.']};
const aboutPick=list=>list[Math.floor(Math.random()*list.length)];
const aboutData=()=>({...ABOUT_DEFAULT,...(data.about||{})});

function aboutStats(){
 const papers=data.papers,live=(data.claims||[]).filter(c=>c.status!=='Abandoned');
 const words=(data.outline?.parts||[]).reduce((n,p)=>n+(typeof partWords==='function'?partWords(p):0),0);
 const comments=data.threads.reduce((n,t)=>n+(t.blocks||[]).filter(b=>!b.deleted).length,0);
 return [
  [papers.length,'papers on the shelf',papers.length?'':'Very minimalist.'],
  [papers.filter(p=>p.status==='Read').length,'read cover to cover',''],
  [data.passages.length,'passages saved','Each with its page number. Nice.'],
  [comments,'comments in discussions',''],
  [live.length,'thoughts alive',''],
  [live.filter(c=>c.status==='Defensible').length,'ready to defend',''],
  [words,'words drafted',words>=1000?'That is a real chunk of thesis.':words?'Every chapter starts somewhere.':'The blank page is just shy.']
 ];
}
function renderAbout(){
 const a=aboutData();
 $('#main').innerHTML=`<div class="about">
 <section class="about-hero"><p class="about-kicker">About this tool</p><h1>Theesees</h1><p class="about-say">Say it out loud: it is <em>thesis</em>, after a very long day in the library.</p>
 <p class="about-lede">A quiet room for a loud literature review. Theesees keeps your papers, the passages that matter, the conversations you have about them, the thoughts they turn into and the outline those thoughts become, all in one place and all in this browser.</p></section>
 <section class="about-path" aria-label="How it works">
  <button data-view="library"><b>1</b><strong>Literature</strong><span>Collect papers and sort them into themes. The theme map sits right on top.</span></button>
  <button data-view="archive"><b>2</b><strong>Discussions</strong><span>Talk back to a passage. Bold it, quote it, attach a picture of your whiteboard.</span></button>
  <button data-view="thoughts"><b>3</b><strong>Thoughts</strong><span>Hunch → Developing → Defensible. Each one tied to the evidence.</span></button>
  <button data-view="outline"><b>4</b><strong>Outline</strong><span>Arrange thoughts into sections, then write, quote and export.</span></button>
 </section>
 <div class="about-grid">
  <section class="about-me"><div class="about-me-head"><p class="about-kicker">The researcher</p><button id="edit-about" class="link">Edit</button></div>
   <figure class="about-photo"><img src="assets/researcher.jpg" alt="The researcher, smiling, with pink-tipped hair and an iced drink under green leaves" width="480" height="640"></figure>
   <h2>${esc(a.name)}</h2><p class="about-field">${esc(a.field)}</p><p>${esc(a.bio)}</p>
   ${a.question?`<p class="about-q"><span>Currently asking</span>${esc(a.question)}</p>`:'<p class="about-q about-q-empty"><span>Currently asking</span>Add your research question under Edit.</p>'}
   <p class="about-fuel"><span>Runs on</span>${esc(a.fuel)}</p></section>
  <section class="about-stats"><p class="about-kicker">The receipts</p><ul>${aboutStats().map(([n,label,note])=>`<li><b>${n.toLocaleString()}</b><span>${label}${note?`<small>${note}</small>`:''}</span></li>`).join('')}</ul></section>
 </div>
 <section class="about-small"><h3>The small print</h3><p>Everything stays in this browser: no account, no cloud, no one reading over your shoulder. Use <strong>Export records</strong> to keep a copy or move to another computer. Some things in here like to celebrate; you will find out which.</p></section>
 </div>`;
 $$('.about-path [data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
 $('#edit-about').onclick=editAbout;
}
function editAbout(){
 const a=aboutData();
 modal('About the researcher',`<p>Shown on the About page and saved with your records.</p><form><label>Name<input name="name" value="${esc(a.name)}" required></label><label>Field<input name="field" value="${esc(a.field)}"></label><label>A few lines about you<textarea name="bio" rows="4">${esc(a.bio)}</textarea></label><label>Research question<textarea name="question" rows="2" placeholder="What are you trying to find out?">${esc(a.question)}</textarea></label><label>Runs on<input name="fuel" value="${esc(a.fuel)}"></label>${actions('Save')}</form>`,f=>{
  data.about=Object.fromEntries(Object.keys(ABOUT_DEFAULT).map(k=>[k,String(f.get(k)||'').trim()]));if(!data.about.name)data.about.name=ABOUT_DEFAULT.name;save();closeModal();renderAbout();
 });
}

/* Confetti: a short burst of paper scraps. Skipped for anyone who prefers reduced motion. */
function confetti(n=70){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const box=document.createElement('div');box.className='confetti';box.setAttribute('aria-hidden','true');
 const colors=['--c-lemon','--c-coral','--c-tangerine','--c-sky','--c-teal','--c-pink','--c-lime','--c-lavender'];
 for(let i=0;i<n;i++){const s=document.createElement('i');s.style.cssText=`left:${Math.random()*100}vw;background:var(${aboutPick(colors)});--dx:${(Math.random()-.5)*160}px;--r:${Math.random()*720-360}deg;animation-delay:${Math.random()*.25}s;animation-duration:${1.1+Math.random()*.9}s`;box.append(s);}
 document.body.append(box);setTimeout(()=>box.remove(),2600);
}
// Mark a paper Read or a thought Defensible, and the app notices.
document.addEventListener('change',e=>{
 const id=e.target.id,v=e.target.value;
 if(id==='paper-status'&&v==='Read'){confetti();toast(aboutPick(ABOUT_CHEERS.read));}
 if(id==='claim-status-edit'&&v==='Defensible'){confetti();toast(aboutPick(ABOUT_CHEERS.claim));}
},true);
// Click the name at the top five times in quick succession.
let brandClicks=0,brandTimer=null;
document.addEventListener('click',e=>{
 if(!e.target.closest('.brand'))return;
 brandClicks++;clearTimeout(brandTimer);brandTimer=setTimeout(()=>brandClicks=0,1500);
 if(brandClicks>=5){brandClicks=0;confetti(40);toast('You found the secret. Now back to reading.');}
});
