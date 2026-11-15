import { readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Report what has been dropped into source-materials/contact-N/ so we know
 * which books are ready to be digitised.
 *
 *   npm run check:materials
 */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const materialsRoot = join(projectRoot, "source-materials");
const BOOKS = ["contact-2", "contact-3", "contact-4"];
const LIVE = new Set(["contact-2", "contact-3"]);
const PARTIAL = new Set(["contact-4"]);

// Order matters: transcripts and answer keys are tested before the plain
// textbook/workbook rules so their names win. The combined Contact 4
// "leer-werkboek" transcript must be tested before the workbook rule.
const DOC_KINDS = [
  { key: "transcripts-combined", label: "Combined textbook + workbook transcripts", test: (name) => /transcri|transcript/.test(name) && /leer-?werkboek|combined/.test(name) },
  { key: "transcripts-tb", label: "Textbook transcripts", test: (name) => /transcri|transcript/.test(name) && !/workbook|werkboek|wb/.test(name) },
  { key: "transcripts-wb", label: "Workbook transcripts", test: (name) => /transcri|transcript/.test(name) && /workbook|werkboek|wb/.test(name) },
  { key: "wordlist", label: "Wordlist", test: (name) => /wordlist|woordenlijst/.test(name) },
  { key: "grammar", label: "Grammar", test: (name) => /grammar|grammatica/.test(name) },
  { key: "answers", label: "Answer key", test: (name) => /answer|antwoord|sleutel|oplossing/.test(name) },
  { key: "workbook", label: "Workbook PDF", test: (name) => /workbook|werkboek|\bwb\b/.test(name) && !/transcri|transcript/.test(name) },
  { key: "textbook", label: "Textbook PDF", test: (name) => /textbook|tekstboek|\btb\b/.test(name) && !/transcri|transcript/.test(name) },
];

const DISPLAY_ORDER = [
  "textbook",
  "workbook",
  "transcripts-combined",
  "transcripts-tb",
  "transcripts-wb",
  "wordlist",
  "grammar",
  "answers",
];

async function walk(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walk(full)));
    } else {
      found.push(full);
    }
  }
  return found;
}

function classifyPdf(file) {
  const name = file.toLowerCase();
  for (const kind of DOC_KINDS) {
    if (kind.test(name)) return kind;
  }
  return null;
}

const icon = (ok) => (ok ? "✓" : "·");

console.log(`\nMaterials checklist — ${relative(projectRoot, materialsRoot)}/\n`);

for (const book of BOOKS) {
  const bookDir = join(materialsRoot, book);
  const files = await walk(bookDir);
  const pdfs = files.filter((file) => extname(file).toLowerCase() === ".pdf");
  const audio = files.filter((file) => /\.(mp3|m4a|wav|ogg)$/i.test(file));
  const archives = files.filter((file) => /\.zip$/i.test(file));

  const found = new Map();
  for (const pdf of pdfs) {
    const kind = classifyPdf(pdf);
    if (kind && !found.has(kind.key)) found.set(kind.key, pdf);
  }

  const audioWithBook = audio.filter((file) => {
    const rel = relative(bookDir, file).toLowerCase();
    return /textbook|tekstboek|\/tb|_tb|workbook|werkboek|\/wb|_wb/.test(rel);
  });
  const audioUnclear = audio.length - audioWithBook.length;

  const missingDocs = DOC_KINDS.filter((kind) => !found.has(kind.key));
  const ready = missingDocs.length === 0 && audio.length > 0;
  const live = LIVE.has(book);
  const partial = PARTIAL.has(book);
  const status = live ? "live" : partial ? "partial" : ready ? "ready" : "pending";

  console.log(
    `${live ? "●" : partial ? "◐" : ready ? "✓" : "○"} ${book.toUpperCase()}` +
      `  ${status}` +
      ` · ${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"} · ${audio.length} audio file${audio.length === 1 ? "" : "s"}` +
      (audioUnclear ? ` (${audioUnclear} not in textbook/workbook folder)` : ""),
  );

  for (const key of DISPLAY_ORDER) {
    const kind = DOC_KINDS.find((item) => item.key === key);
    if (!kind) continue;
    const file = found.get(kind.key);
    const shown = file ? relative(bookDir, file) : `${kind.label} — not uploaded`;
    console.log(`   ${icon(Boolean(file))} ${shown}`);
  }

  if (audio.length === 0) {
    console.log(
      archives.length
        ? `   ! Audio — ${archives.length} zip archive(s) not extracted yet`
        : "   · Audio — not uploaded",
    );
  } else if (audioUnclear) {
    console.log(
      `   ! ${audioUnclear} audio file(s) sit outside audio/textbook or audio/workbook`,
    );
  }

  if (partial) {
    console.log(
      "   · Live for textbook/workbook audio and transcripts; wordlist and grammar are not uploaded.",
    );
  }
  console.log("");
}

console.log("Minimum for a listening + wordlist preview: transcript PDFs, wordlist PDF, audio.");
console.log("Add the grammar PDF for the Grammar reference; textbook/workbook PDFs + answer key unlock chapter titles and exercises.\n");
