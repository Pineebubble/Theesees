# Theesees

A browser-local literature-reading and thinking workspace. Organize papers, connect themes, save source passages, and preserve AI conversations and your developing thoughts.

## Use it online (any computer or phone)

Open **https://pineebubble.github.io/Theesees/** in your browser. The site is the `dist` folder, published to the `gh-pages` branch with `./publish-pages.sh` (it runs the checks first) after pushing `main`.

The app's code is public, but your research is not: records, PDFs and pictures are still saved only in the browser you use, never on GitHub. Each device and browser therefore has its own workspace, and the online address has its own storage, separate from a local copy.

One-time setup, done in the GitHub repository: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch **gh-pages**, folder **/ (root)**.

## Use a local copy instead

1. On GitHub, choose **Code → Download ZIP**, then unzip it. Alternatively, clone this repository.
2. Open `dist/prototype.html` in Chrome or Edge. No build, account, API key, or package installation is required.
3. Keep the entire `dist` folder together: its scripts and styles are required.

For a consistent browser storage origin, use a local server if Python 3 is installed. In a terminal opened in the downloaded folder:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

On Windows, use `py -3` instead of `python3` if necessary. Open **http://127.0.0.1:8765/prototype.html** and leave the terminal running. Stop it with Ctrl+C.

Keep using the same browser and address. File URLs and localhost have different storage; switching can make your existing records appear absent. File-URL storage behavior also varies by browser.

## Important: your research does not live in this repository

This repository contains application code and design assets, not personal papers or conversations. Downloading it on another computer starts a separate workspace.

- Records, pasted text, passages, conversations, replies, and key thoughts use browser localStorage.
- Attached PDFs use browser IndexedDB.
- **Export records** downloads JSON records but **does not include PDFs or pictures in comments**. Keep original PDFs separately.
- **Backup import is not implemented yet.** The JSON export is a safeguard, not a one-click migration feature. Do not clear the original browser or discard its files before migration has been implemented and verified.
- There is no cloud sync. GitHub does not synchronize research data.
- Do not commit exported research, private conversations, or PDFs to this public repository.

## Features

- Editable colored theme folders and connections, shown in a collapsible **Themes** map at the top of the Literature page. Click a theme to list only its papers; click empty space to show them all.
- Pull-out literature drawer; editable title, authors, and year.
- PDF reading with PDF.js: select text in a PDF to save it as a passage (page filled in automatically); saved passages are found and highlighted in the PDF, and “Show source” jumps to them. Matching ignores line breaks, hyphenation, ligatures and punctuation, and falls back to an approximate match for lightly edited quotes. Scanned PDFs without a text layer cannot be searched (no OCR).
- Pasted-text reading and editable source passages. Long passages collapse to a few lines with “Show full passage”.
- Everything you add can be edited and deleted: themes and connections, papers (details, DOI, text, themes, attached PDF), passages, discussions (title, text, status, platform), comments (including their linked passage), thoughts and evidence links, and outline parts.
- Source-linked discussions with paper and theme filters.
- Original imported conversations preserved alongside new comments and pasted AI replies.
- Comments support **bold** and *italic* (B / I buttons or ⌘B / ⌘I) and pictures: add them with the button, paste a screenshot into the comment box, or drop files on it. Pictures are stored in the browser's file storage next to PDFs (large ones scaled to 2000px), open full-size on click, and are deleted when their comment or discussion expires from Trash.
- Flat paper-note conversation timelines; optional subthreads tucked behind parent notes.
- Key-thought markers, editing, and Trash with 30-day recovery; **Empty Trash** deletes everything in it for good (after a confirmation).
- **Thoughts**: claims in your own words. Promote a comment or passage with “→ Thought”, link passages as *supports*, *challenges* or *qualifies*, track status (Hunch → Developing → Defensible, or Abandoned), and filter for thoughts that need work (no evidence, no counter-evidence, no theme, not in the outline).
- **Outline**: arrange thoughts into numbered sections and subsections by drag-and-drop or menus, add a one-line argument per part, and export Markdown with evidence quotations, author–year–page citations, and a reference list. Citations are a simple author–year style, not a full citation style such as APA.
- **Outline → Write**: a writing area for each section and subsection, beside the thoughts placed there. Bold/italic, autosave, word counts per subsection, section and in total; **Insert thought** adds a thought with its citation, **Quote** adds the passage itself in quotation marks with its citation, and any saved passage can be quoted or cited from the picker; **Cite** adds a passage citation (e.g. *(Hlavac et al., 2026, p. 1)*) and **Cite a paper** adds *(Author, Year)*; citation labels follow later corrections to a paper. **Aa** cycles the selected words through Sentence case, Title Case, UPPERCASE and lowercase (also in discussion comments), keeping acronyms. Pasted text keeps paragraphs, bold and italic only. **Export text** copies the section or the whole draft (with formatting, for Word or Google Docs) or downloads it as .doc, Markdown or plain text, optionally with APA references. Markdown export includes the written text and lists every cited paper in the references; removing a part that has writing moves it to Trash.
- Trash expiry runs while open or on the next opening. Existing deleted records get a fresh grace period when this policy is introduced. Surviving replies retain routing links.
- **Add several papers** at once from PDFs and/or pasted DOIs. Title, authors and DOI are read from each PDF (its own title/author fields, the largest text on page 1, DOIs in the first pages) and, optionally, completed online from **Crossref**, plus **OpenAlex** if you save a free OpenAlex API key (better for books and non-English work). Only DOIs, or titles with the first author's surname when a PDF has no DOI, are sent; PDFs stay in the browser. A title search fills details in only on a near-certain match; otherwise it offers up to three possible matches to pick from, and each row has **Find online** to search again after correcting the title or author. Everything is shown for review first, and papers already in the library are flagged.
- Literature is grouped by each paper's first theme, in theme-map order.
- **Related literature** on a paper lists up to four papers that share the most themes with it, each once, with links to the theme folders for the rest.
- **Reading bookmark**: **Bookmark here** marks where you stopped in a PDF (page and spot, unaffected by zoom) or in pasted text. A marker shows it, **Go to bookmark** returns to it, and reopening the paper jumps back to it.
- Theme colours carry through: thoughts, outline cards, saved passages and discussion quotes are edged in the colour of their (first) theme.
- **APA 7 references** for each paper: built from the Crossref record during import (journal, volume, issue, pages, publisher, editors, DOI) or from the paper's own fields, shown with italics on the paper and in the Literature stack, editable in Edit details (with Generate), copyable with italics, filled in for older papers from the Literature ⋯ menu, and used for the Outline export's reference list. Titles keep their capitalisation; APA's sentence case for article and book titles is left to you.
- **About** page: what the tool is for, an editable card about the researcher (saved with your records), a few numbers about your reading and writing, and some small celebrations (marking a paper Read or a thought Defensible).
- **Translate** into English or Chinese (中文; the choice is remembered): select text anywhere (a PDF, source text, a passage, a comment) and click **Translate**. Quick translation uses Chrome's built-in translator (desktop Chrome 138 or later): it runs on your computer, downloads each language pack once after a click, and sends nothing anywhere. **Copy for AI translation** copies the text with instructions (translation, key terms, culture-specific notes) to paste into Claude or ChatGPT.
- Zotero CSL-JSON bibliography import, not live Zotero synchronization.

No live AI calls (the optional Crossref/OpenAlex lookups are the only network requests), automatic conclusions, or PDF OCR. A PDF match shows where a quote appears; it is not a check of your interpretation. Shared chat URLs alone do not import contents. Vendor-specific JSON chat exports are retained as raw text, not reconstructed.

## Developer checks

With Node.js installed, run from the repository root:

```sh
node reader-check.cjs
node discussion-check.cjs
node blocks-check.cjs
node trash-check.cjs
node claims-check.cjs
node outline-check.cjs
node pdf-check.cjs
node scripts-check.cjs
node lit-check.cjs
node draft-check.cjs
```

These cover reader logic, text cleanup, replies/subthreads, metadata preservation, Trash expiry, thoughts/evidence links, outline ordering and Markdown export, PDF passage matching, and that all app scripts load together without name clashes. They are not full browser tests. Latest visual changes have not been browser-verified because local-file automation was blocked.

`?sandbox=1` separates test records, but PDF storage is shared; do not use real PDF IDs for destructive tests.

## Fonts

Figtree and IBM Plex Mono are bundled in `dist/fonts` under the SIL Open Font License 1.1 (licence texts included there), so the app makes no font requests to the internet.

PDF.js 3.11.174 (Mozilla, Apache 2.0) is bundled in `dist/vendor/pdfjs` and loaded with `isEvalSupported: false`, which closes CVE-2024-4367 for this version.
