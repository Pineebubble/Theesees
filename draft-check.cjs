const assert=require('node:assert/strict');
const {sanitizeDraft,draftToMarkdown,draftPlain,wordCount,citesIn}=require('./dist/draft.js');
const chip='<span class="cite" contenteditable="false" data-paper="p1" data-passage="h1">(Hlavac et al., 2026, p. 1)</span>';

// What the editor produces survives unchanged.
const ok=`<p>Intercultural competence is <strong>contested</strong> and <em>plural</em> ${chip}.</p><p>Second<br>line.</p>`;
assert.equal(sanitizeDraft(ok),ok);

// Pasted Word / web markup: paragraphs, bold and italic kept; styles, classes, links, images and spans dropped.
assert.equal(sanitizeDraft('<div style="color:red"><b class="x">Bold</b> <i>it</i> <a href="http://x">link</a><img src=x></div><h2>Heading</h2><span style="font:x">plain</span>'),
 '<p><strong>Bold</strong> <em>it</em> link</p><p>Heading</p><p>plain</p>');
assert.equal(sanitizeDraft('<o:p></o:p><p class=MsoNormal><span lang=EN-GB>Word text</span><o:p></o:p></p>'),'<p>Word text</p>');
assert.equal(sanitizeDraft('loose text'),'<p>loose text</p>');

// Nothing executable gets through, including tricks that rebuild tags from fragments.
for(const bad of ['<script>alert(1)</script>ok','<img src=x onerror=alert(1)>ok','<p onclick="alert(1)">ok</p>','<scr<script>x</script>ipt>alert(1)</scr<script>y</script>ipt>ok','<style>p{}</style>ok','<a href="javascript:alert(1)">ok</a>','<svg><script>alert(1)</script></svg>ok','<!-- <script>alert(1)</script> -->ok']){
 const s=sanitizeDraft(bad);
 assert.doesNotMatch(s,/<(script|img|style|a|svg|iframe)\b|on\w+=|javascript:/i,bad+' → '+s);
 assert.match(s,/ok/);
}
// Citation chips need a valid id and hold plain text only.
assert.equal(sanitizeDraft('<span class="cite" data-paper="p1">(A, 2020)</span>'),'<p><span class="cite" contenteditable="false" data-paper="p1">(A, 2020)</span></p>');
assert.equal(sanitizeDraft('<span class="cite" data-paper="x&quot;onmouseover=alert(1)">(A)</span>'),'<p>(A)</p>');
assert.equal(sanitizeDraft('<span class="cite" data-paper="p1"><b>(A</b>, 2020)</span>'),'<p><span class="cite" contenteditable="false" data-paper="p1">(A, 2020)</span></p>');

// Markdown, plain text, word count and citations.
assert.equal(draftToMarkdown(ok),'Intercultural competence is **contested** and *plural* (Hlavac et al., 2026, p. 1).\n\nSecond  \nline.');
assert.equal(draftPlain('<p>A &amp; B</p><p>C</p>'),'A & B\nC');
assert.equal(wordCount('Intercultural competence isn’t one thing (2026).'),6);
assert.equal(wordCount('文化中介者 are brokers'),7);
assert.deepEqual(citesIn(ok).map(c=>`${c.paper}/${c.passage}`),['p1/h1']);
console.log('PASS: draft HTML kept to paragraphs/bold/italic/citations, pasted markup cleaned, scripts and tag tricks blocked, Markdown, word counts (incl. CJK), citations.');
