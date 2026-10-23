# Theesees

A browser-local literature-reading and thinking workspace. Organize papers, connect keywords, save source passages, and preserve AI conversations and your developing thoughts.

## Use on another computer

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
- **Export records** downloads JSON records but **does not include PDFs**. Keep original PDFs separately.
- **Backup import is not implemented yet.** The JSON export is a safeguard, not a one-click migration feature. Do not clear the original browser or discard its files before migration has been implemented and verified.
- There is no cloud sync. GitHub does not synchronize research data.
- Do not commit exported research, private conversations, or PDFs to this public repository.

## Features

- Editable colored keyword folders and connections; links to literature.
- Pull-out literature drawer; editable title, authors, and year.
- PDF reading and expanded view, pasted-text reading, editable source passages.
- Source-linked discussions with paper and keyword filters.
- Original imported conversations preserved alongside new comments and pasted AI replies.
- Flat paper-note conversation timelines; optional subthreads tucked behind parent notes.
- Key-thought markers, editing, and Trash with 30-day recovery.
- **Thoughts**: claims in your own words. Promote a comment or passage with “→ Thought”, link passages as *supports*, *challenges* or *qualifies*, track status (Hunch → Developing → Defensible, or Abandoned), and filter for thoughts that need work (no evidence, no counter-evidence, no keyword, not in the outline).
- **Outline**: arrange thoughts into numbered chapters and sections by drag-and-drop or menus, add a one-line argument per part, and export Markdown with evidence quotations, author–year–page citations, and a reference list. Citations are a simple author–year style, not a full citation style such as APA.
- Trash expiry runs while open or on the next opening. Existing deleted records get a fresh grace period when this policy is introduced. Surviving replies retain routing links.
- Zotero CSL-JSON bibliography import, not live Zotero synchronization.

No live AI calls, automatic conclusions, PDF OCR, or automatic source verification. Shared chat URLs alone do not import contents. Vendor-specific JSON chat exports are retained as raw text, not reconstructed.

## Developer checks

With Node.js installed, run from the repository root:

```sh
node reader-check.cjs
node discussion-check.cjs
node blocks-check.cjs
node trash-check.cjs
node claims-check.cjs
node outline-check.cjs
```

These cover reader logic, text cleanup, replies/subthreads, metadata preservation, Trash expiry, thoughts/evidence links, and outline ordering and Markdown export. They are not full browser tests. Latest visual changes have not been browser-verified because local-file automation was blocked.

`?sandbox=1` separates test records, but PDF storage is shared; do not use real PDF IDs for destructive tests.
