# OneStopDutch

A one-stop study site for the **Contact! nieuw** series (Intertaal), built from the
course audio, audio transcripts, wordlist and grammar reference. Contact! nieuw 1,
2 and 3 are online; the book switcher in the sidebar adds 4 as its material
arrives.

## The four sections

| Section | What it does |
| --- | --- |
| **Textbook** | Every textbook track with a custom audio player (0.5×–2×), full transcript and line-by-line pronunciation. |
| **Workbook** | The workbook listening tracks and transcripts, in book order. |
| **Wordlist** | 981 words (book 1), 817 words (book 2) and 961 words (book 3) grouped by chapter and word type, with search across all chapters, hidden-English practice, stars, text-to-speech and a flashcard deck. |
| **Grammar** | Book 1: 71 chapter-linked topics. Books 2–3: the 54- and 68-topic grammar appendices as a searchable reference. |

Chapter selection is shared across the site, and the current book, section and
chapter are kept in the URL hash (`#/contact-2/textbook/5`) so refresh and
browser back/forward work.

## Adding Contact 4

Drop the book's PDFs and audio into `source-materials/contact-4/`, then run
`npm run check:materials` to see what is still missing. See
[UPLOADING.md](UPLOADING.md) for the folder layout and upload order.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build
```

## Audio

The audio library is intentionally **not committed to git**. It lives in
`public/Audio/` and is copied into `dist/Audio/` by Vite at build time.

If you clone the project on a fresh machine, copy the source audio first:

```bash
npm run sync:audio
# Contact 1 defaults to /path/to/DutchLearning; override with:
MATERIALS_DIR=/path/to/DutchLearning npm run sync:audio
```

The sync script reads every `src/data/courses/*/audio-manifest.json` and copies
only the tracks the app actually uses (422 tracks, ~657 MB across the three books).

## Content pipeline

The structured content in `src/data/courses/<book>/chapters/*.json` was extracted
from the course materials:

- **Contact 1**: textbook transcripts, workbook material and audio, wordlist and
  the chapter grammar overview, plus the digitised chapter 1 exercises.
- **Contact 2**: `01 textbook_transcript.pdf`, `03 workbook_transcript.pdf`,
  `05 wordlist.pdf` and `06 grammar.pdf`, with 138 audio tracks (817 words,
  54 reference grammar topics). Re-run the importer after replacing the source
  files:

  ```bash
  npm run import:contact-2
  npm run check:materials
  ```

- **Contact 3**: `Contact-nieuw_3_tb_transcripties.pdf`,
  `Contact-nieuw_3_wb_transcripties.pdf`,
  `Contact-nieuw_3_tb_woordenlijst_Engels.pdf` and
  `Contact-nieuw_3_tb_grammaticaoverzicht.pdf`, with 118 audio tracks (961
  words, 68 reference grammar topics):

  ```bash
  npm run import:contact-3
  npm run check:materials
  ```

Each chapter file contains `vocab`, `transcripts`, `exercises`,
`workbookExercises` and `grammar`. Book-level grammar appendices live in
`grammar-reference.json` and are shown as the "Reference grammar" scope. Edit the
JSON files to correct or extend content; the UI updates automatically.

## Project layout

```
src/
  App.tsx                 book + chapter route and four-section navigation
  index.css               design system and responsive layout
  types.ts                course, chapter, transcript, vocab and exercise types
  data/
    index.ts              course lookup and content helpers
    courses/
      contact-1/          chapters, audio manifest
      contact-2/          chapters, audio manifest, grammar-reference.json
      contact-3/          chapters, audio manifest, grammar-reference.json
  components/
    BookView.tsx          textbook/workbook reader
    WordlistView.tsx      wordlist, search, stars and flashcards
    GrammarView.tsx       grammar reference and search
    AudioPlayer.tsx       speed + seek audio player
    ExerciseCard.tsx      interactive exercise types
  lib/
    speech.ts             browser Dutch text-to-speech
    progress.ts           exercise progress in localStorage
scripts/
  sync-audio.mjs          copy only referenced tracks into public/Audio
  import-book.mjs         shared PDF/audio importer for books 2–4
  check-materials.mjs     report missing uploads per book
```

## Features

- **Book switcher** — Contact 1, 2 and 3 share the same layout and chapter
  navigation; the choice is remembered per browser.
- **Shared chapter context** — switching chapters in the sidebar, the top-bar
  selector, the wordlist or grammar keeps the whole site in sync.
- **Custom audio player** — remembers playback speed, scrubbable range bar, no
  download button.
- **Transcript reader** — speaker badges, numbered lines, one-click pronunciation
  per line.
- **Wordlist practice** — chapter/type filters, English hiding, starred words,
  flashcard mode with shuffle, and per-word pronunciation.
- **Progress** — exercise answers are stored locally; no account or backend.
- **Responsive** — desktop sidebar becomes a horizontal chapter strip on mobile.
- **No external services** — speech uses the browser's built-in `nl-NL` voice.

## Known content gaps

- **Contact 1, chapter 7** has no audio in the source material. The site shows a
  notice and the transcript.
- **Contact 1 exercises** are fully digitised for chapter 1 only. Later chapters
  have audio/transcripts, wordlists and grammar, but no exercise questions yet.
- **Contact 2 and 3** were uploaded without the textbook/workbook PDFs and answer
  key, so chapters have no printed titles and there are no interactive exercises
  yet. The transcript, wordlist and grammar data are complete.
- **Contact 2 and 3 grammar** is the book's grammar appendix, not the per-chapter
  grammar boxes; it appears under the "Reference grammar" scope. Appendix tables
  are flattened to text, so spot-check them against the PDF.
- **Contact 2 workbook, chapter 3** has no listening tracks in the source
  material.
- **Contact 3 textbook chapters 2, 7, 10 and 11** have no textbook audio; chapter
  10 has no audio at all. Those chapters show workbook content where available
  and a clear notice otherwise.
- The wordlist and grammar are derived from PDFs; spot-check unusual OCR output
  against the originals.

## Deploy

Netlify configuration is included:

```bash
npm run build
netlify deploy --prod --dir=dist
```

`netlify.toml` sets long-lived caching for `/Audio/*`. Any static host works as
long as it serves `dist/` and supports range requests for MP3 files.
