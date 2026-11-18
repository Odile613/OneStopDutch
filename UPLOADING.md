# Uploading Contact 4

The site ships **Contact! nieuw 1–3** in full, and **Contact! nieuw 4** with its
textbook and workbook audio plus the textbook transcripts. Contact 4 is a
separate book, so it has its own folder and a book switcher entry in the top bar.

## Status

| Book | Status |
| --- | --- |
| Contact 1 | Live: 16 chapters, 166 tracks, 981 words, 71 grammar topics |
| Contact 2 | Live: 15 chapters, 138 tracks, 817 words, 54 reference grammar topics. No textbook/workbook PDF or answer key, so no chapter titles yet |
| Contact 3 | Live: 16 chapters, 118 tracks (50 textbook + 68 workbook), 961 words, 68 reference grammar topics. No textbook/workbook PDF or answer key; textbook chapters 2, 7, 10 and 11 have no textbook audio, and chapter 10 has no audio at all |
| Contact 4 | Live (partial): 17 chapters, 196 tracks (80 textbook + 116 workbook) and the combined transcript PDF. Missing: wordlist, grammar, textbook/workbook PDFs and answer key. Workbook chapters 3, 8 and 11 have no workbook audio |

Contacts 2 and 3 were uploaded as four PDFs (textbook transcripts, workbook
transcripts, wordlist, grammar) plus two audio ZIPs. The ZIPs are extracted into
`audio/textbook/` and `audio/workbook/` as part of the import.

Contact 4 was uploaded as one combined transcript PDF and two audio ZIPs, and is
already imported. That PDF covers the textbook audio only, so workbook tracks
appear as audio without a printed transcript.

Drop everything into this project here:

```
/Users/yaming/WebstormProjects/OneStopDutch/source-materials/
  contact-2/
  contact-3/
  contact-4/
```

This folder is gitignored: the publisher PDFs and audio stay on your machine and
never get committed.

## Folder layout

Each book folder is already created with the audio subfolders:

```
source-materials/contact-2/
  01 Textbook.pdf
  02 Textbook Transcription.pdf
  03 Workbook.pdf
  04 Workbook Transcription.pdf
  05 Wordlist.pdf
  06 Grammar.pdf
  07 Answers.pdf
  audio/
    textbook/
      ...mp3
    workbook/
      ...mp3
```

PDF file names are flexible — the checker looks for keywords (`textbook`,
`workbook`, `transcri…`, `wordlist`, `grammar`, `answer`), so the publisher's
original names work as well as the numbered ones above.

## What to upload, in order

Do **one book at a time**, and finish Contact 4 first. Its audio is already in,
so only PDFs are outstanding.

### Batch 1 — enough to build a real preview

| File | Why it is needed |
| --- | --- |
| Textbook PDF | Chapter titles, texts and exercise structure |
| Wordlist PDF | The Wordlist section and flashcards |
| All textbook audio | ✅ already uploaded for Contact 4 (80 tracks) |

### Batch 2 — completes the listening experience

| File | Why it is needed |
| --- | --- |
| Textbook transcripts PDF | Read-along text under each audio track |
| Grammar PDF | The Grammar section |

### Batch 3 — completes the workbook

| File | Why it is needed |
| --- | --- |
| Workbook PDF | Workbook exercises |
| Workbook transcripts PDF | Workbook audio transcripts |
| All workbook audio | Workbook player |
| Answer key | Auto-checking of exercises |

You do not have to upload everything before I start. After each batch I digitise
what is there, build, and show you the result before moving on.

## Audio rules

- **Format:** MP3 preferred; M4A, WAV and OGG also work.
- **Naming:** keep the publisher's original file and folder names if possible —
  track numbers and chapter folders are read from them.
- If you must rename, keep the track number and the book, e.g.
  `c2_tb_track_07.mp3`, and put it in `audio/textbook/`.
- Put textbook tracks in `audio/textbook/` and workbook tracks in
  `audio/workbook/`. If the download already has chapter subfolders, dropping
  those folders inside `audio/` is fine — do not flatten them by hand.
- A `.zip` straight from the publisher is fine too: mention it and I will unpack
  it into the right folder.
- Audio is large. One book (textbook + workbook) may be 200–400 MB; that is
  expected and stays out of git.

## Check what you have uploaded

```bash
npm run check:materials
```

It prints a per-book checklist, for example:

```
○ CONTACT-2  0 PDFs · 0 audio files
   · Textbook PDF — not uploaded
   · Wordlist — not uploaded
   ...
```

When you are done with a batch, tell me and I will run the checker, map the
tracks to chapters, and build that book into the site.

## What I do with a new book

1. Read the PDFs and extract chapters, vocabulary, transcripts and grammar.
2. Map audio tracks to chapters and books; copy only the referenced tracks into
   `public/Audio/`.
3. Add the book to the data layer; it appears in the existing book switcher.
4. Build and verify the preview, then send you the link for review.

The shared four-section layout is reused as-is.

## Still useful for Contact 2 and 3

- **Textbook PDF** — would restore chapter titles and the reading texts.
- **Workbook PDF + answer key** — would enable interactive exercises.
- **Chapter grammar** (if your material has the grammar boxes separately from
  the appendix) — would let Grammar follow the chapter instead of the reference
  appendix.
- **Contact 2 workbook, chapter 3** — the listening audio is missing.
- **Contact 3 textbook chapters 2, 7, 10 and 11** — the textbook audio is
  missing; chapter 10 has no audio at all.
