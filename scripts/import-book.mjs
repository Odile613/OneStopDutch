import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Build one Contact! nieuw book from the PDFs and audio in
 * source-materials/contact-N/.
 *
 *   npm run import:contact-2
 *   npm run import:contact-3
 *
 * Writes src/data/courses/contact-N/chapters/chNN.json, audio-manifest.json
 * and (when the upload includes grammar) grammar-reference.json.
 *
 * The PDFs are text-extracted with Poppler's `pdftotext`; the extracted text is
 * cached in source-materials/contact-N/.extracted/ (gitignored).
 */

const BOOKS = {
  "contact-2": {
    number: 2,
    pdfs: {
      tbTranscript: "01 textbook_transcript.pdf",
      wbTranscript: "03 workbook_transcript.pdf",
      wordlist: "05 wordlist.pdf",
      grammar: "06 grammar.pdf",
    },
    audio: ["textbook", "workbook"],
  },
  "contact-3": {
    number: 3,
    pdfs: {
      tbTranscript: "Contact-nieuw_3_tb_transcripties.pdf",
      wbTranscript: "Contact-nieuw_3_wb_transcripties.pdf",
      wordlist: "Contact-nieuw_3_tb_woordenlijst_Engels.pdf",
      grammar: "Contact-nieuw_3_tb_grammaticaoverzicht.pdf",
    },
    audio: ["textbook", "workbook"],
  },
  "contact-4": {
    number: 4,
    pdfs: {
      // The Contact 4 upload has one combined textbook + workbook transcript.
      combinedTranscript: "Contact-nieuw_4_transcripties_leer-werkboek.pdf",
    },
    audio: ["textbook", "workbook"],
  },
};

const bookId = process.argv[2] ?? "contact-2";
const config = BOOKS[bookId];
if (!config) {
  console.error(`Unknown book "${bookId}". Use one of: ${Object.keys(BOOKS).join(", ")}`);
  process.exit(1);
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bookRoot = join(projectRoot, "source-materials", bookId);
const extractedDir = join(bookRoot, ".extracted");
const outDir = join(projectRoot, "src", "data", "courses", bookId);

await mkdir(extractedDir, { recursive: true });

async function extractPdf(relativePath) {
  if (!relativePath) return null;
  const path = join(bookRoot, relativePath);
  const target = join(extractedDir, `${relativePath.replace(/\.pdf$/, "")}.txt`);
  execFileSync("pdftotext", ["-layout", path, target]);
  return readFile(target, "utf8");
}

async function extractPdfBbox(relativePath) {
  if (!relativePath) return null;
  const path = join(bookRoot, relativePath);
  const target = join(extractedDir, `${relativePath.replace(/\.pdf$/, "")}.bbox.xml`);
  execFileSync("pdftotext", ["-bbox-layout", path, target]);
  return readFile(target, "utf8");
}

/* ------------------------------------------------------------------ helpers */

const clean = (value) => value.replace(/\s+/g, " ").trim();
const isNoise = (line) =>
  !line ||
  /^Transcripties (tekstboek|werkboek)( \d+)?$/.test(line) ||
  /^Transcripties (leer- en werkboek|leerwerkboek)$/i.test(line) ||
  /^Contact! .*Transcripties/.test(line) ||
  /^Contact_nieuw_\d+_.*\.indd/.test(line) ||
  /^Alle rechten voorbehouden/.test(line) ||
  /^\d{1,3}$/.test(line) ||
  /^[–—]$/.test(line) ||
  /^Deze track hoeft niet te worden opgenomen/.test(line) ||
  /^Deel \d+, (werkboek|tekstboek|leer- en werkboek)/.test(line) ||
  /^Dit is een track uit deel \d+/.test(line) ||
  /^Cd \d+\s*-\s*track/.test(line);

/** Collapse the wide gaps `pdftotext -layout` puts between table columns. */
const tableToText = (value) =>
  value
    .split(/\t+| {4,}/)
    .map(clean)
    .filter(Boolean)
    .join(" · ");

/** "Docent :  Welkom" -> "Docent: Welkom" so the UI recognises the speaker. */
const SPEAKER_RE = /^([A-ZÀ-Þ][A-Za-zÀ-ÿ0-9 .'’-]{0,40}?)\s*:\s*(\S.*)$/;
function normaliseSpeaker(value) {
  const match = SPEAKER_RE.exec(value);
  if (!match) return value;
  return `${clean(match[1])}: ${clean(match[2])}`;
}

/* --------------------------------------------------------------- transcripts */

const CHAPTER_RE = /^HOOFDSTUK (\d+)$/i;
const TRACK_RE = /^track (\d+)\b/i;
const TRACK_LABEL_RE = /^\d+:$/;
const NUMBER_ONLY_RE = /^(\d+)\.$/;
const TITLE_RE = /^(dialoog|gesprek|interview|tekst)\b/i;
const DASH_TITLE_RE = /^[–—-]\s+(\S.*)$/;

function parseTranscripts(text, book) {
  const chapters = new Map();
  let chapter = null;
  let track = null;
  let title = null;
  let lines = [];
  let titleOpen = true;
  let pendingNumber = null;

  const flush = () => {
    if (chapter === null || track === null) return;
    if (!chapters.has(chapter)) chapters.set(chapter, new Map());
    const tracks = chapters.get(chapter);
    if (!tracks.has(track)) {
      tracks.set(track, { book, track, title: title || null, lines: [] });
    }
    const entry = tracks.get(track);
    if (entry.title === null && title) entry.title = title;
    entry.lines.push(...lines);
    lines = [];
    pendingNumber = null;
  };

  for (const raw of text.replace(/\f/g, "").split("\n")) {
    const line = raw.replace(/\t/g, "    ").trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    const chapterMatch = CHAPTER_RE.exec(trimmed);
    if (chapterMatch) {
      flush();
      chapter = Number(chapterMatch[1]);
      track = null;
      title = null;
      lines = [];
      titleOpen = true;
      pendingNumber = null;
      continue;
    }

    const trackMatch = TRACK_RE.exec(trimmed);
    if (trackMatch) {
      flush();
      track = Number(trackMatch[1]);
      title = null;
      lines = [];
      titleOpen = true;
      pendingNumber = null;
      continue;
    }

    if (!track || isNoise(trimmed) || TRACK_LABEL_RE.test(trimmed)) continue;

    if (titleOpen) {
      const dashTitle = DASH_TITLE_RE.exec(trimmed);
      if (dashTitle && !/[.!?]$/.test(dashTitle[1])) {
        title = clean(dashTitle[1]);
        continue;
      }
      const colonTitle =
        /:$/.test(trimmed) && !/^[A-Z][A-Za-zÀ-ÿ.'’-]{0,24}\s*:\s+\S/.test(trimmed);
      if (colonTitle || TITLE_RE.test(trimmed)) {
        title = clean(trimmed.replace(/:\s*$/, ""));
        continue;
      }
      titleOpen = false;
    }

    const numberOnly = NUMBER_ONLY_RE.exec(trimmed);
    if (numberOnly) {
      pendingNumber = numberOnly[1];
      continue;
    }

    const normalised = normaliseSpeaker(trimmed);
    const body =
      normalised === trimmed
        ? // Table columns are joined with " · "; repair numbered-list markers
          // ("1.   ik beloof …" -> "1. ik beloof …") so the UI numbers the line.
          tableToText(trimmed).replace(/(^| · )(\d+)\. · /g, "$1$2. ")
        : normalised;
    lines.push(pendingNumber ? `${pendingNumber}. ${body}` : body);
    pendingNumber = null;
  }
  flush();

  return chapters;
}

/* ----------------------------------------------------------------- wordlist */

const GROUP_NAMES = [
  [/^speciale verba/i, "speciale verba"],
  [/^substantieven/i, "substantieven"],
  [/^adjectieven/i, "adjectieven"],
  [/^vaste combinaties/i, "vaste combinaties"],
  [/^andere woorden/i, "andere woorden"],
  [/^zinnen,? vragen/i, "zinnen en vragen"],
  [/^bijzins?conjuncties/i, "bijzinconjuncties"],
  [/^afkortingen/i, "afkortingen"],
  [/^preposities/i, "preposities"],
  [/^verba/i, "verba"],
];

const WORD_RE =
  /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;

const decodeXml = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

/**
 * Rebuild the wordlist's visual lines from `pdftotext -bbox-layout` output and
 * split them into the Dutch / English / third column by x-position.
 *
 * Splitting on whitespace alone breaks whenever a long Dutch headword runs
 * into the English column (`de bezienswaardigheid (de beziens- sight`). The
 * bounding boxes still tell us which column every word belongs to.
 */
function bboxLines(xml) {
  const pages = xml.split(/<page /).slice(1);
  const lines = [];
  const compounds = new Set();

  for (const page of pages) {
    const width = Number(/width="([\d.]+)"/.exec(page)?.[1] ?? 0) || 653.622;
    const words = [];
    for (const match of page.matchAll(WORD_RE)) {
      words.push({
        x: Number(match[1]),
        y: Number(match[2]),
        text: decodeXml(match[5]),
      });
    }

    // Remember real hyphenated words ("diploma-uitreiking") so a hyphen at
    // the end of a line can be told apart from a typesetting hyphenation
    // ("beziens-" + "waardigheden").
    for (const word of words) {
      if (/[\p{L}0-9]-[\p{L}0-9]/u.test(word.text)) {
        compounds.add(word.text.toLowerCase());
      }
    }

    const englishHeader = words.find((word) => word.text === "Engels")?.x;
    const englishLimit = (englishHeader ?? width * 0.39) - 4;

    const visual = [];
    for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const last = visual[visual.length - 1];
      if (!last || Math.abs(word.y - last.y) > 4) {
        visual.push({ y: word.y, words: [word] });
      } else {
        last.words.push(word);
      }
    }

    for (const line of visual) {
      const cells = { dutch: [], english: [], other: [] };
      for (const word of line.words.sort((a, b) => a.x - b.x)) {
        // The third "Andere taal" column is empty in these uploads; long
        // English glosses may run past its start, so treat it as English.
        const column = word.x < englishLimit ? "dutch" : "english";
        cells[column].push(word.text);
      }
      lines.push({
        dutch: cells.dutch.join(" "),
        english: cells.english.join(" "),
        other: cells.other.join(" "),
      });
    }
  }

  return { lines, compounds };
}

function parseWordlist(xml) {
  const { lines, compounds } = bboxLines(xml);
  const chapters = new Map();
  let chapter = null;
  let group = null;
  let previous = null;
  let example = null;

  const ensureChapter = (number) => {
    if (!chapters.has(number)) chapters.set(number, []);
    return chapters.get(number);
  };

  const startGroup = (name) => {
    const groups = ensureChapter(chapter);
    let target = groups.find((item) => item.group === name);
    if (!target) {
      target = { group: name, entries: [] };
      groups.push(target);
    }
    return target;
  };

  // Examples can wrap over several lines. Collect each one and attach it to
  // the entry above when it is complete.
  const flushExample = () => {
    if (!example) return;
    const note = [example.dutch, example.english].filter(Boolean).join(" ").trim();
    if (note && example.entry) {
      example.entry.note = example.entry.note
        ? `${example.entry.note}\n${note}`
        : note;
    }
    example = null;
  };

  const join = (current, addition) => {
    if (!current) return addition;
    // Alternatives share a slash ("heb/hebt"), so keep it as-is.
    if (/\/$/.test(current)) return current + addition;

    if (/-$/.test(current)) {
      const left = current.slice(0, -1);
      const leftWord = left.split(/\s+/).pop() ?? "";
      const rightWord = addition.split(/\s+/)[0]?.replace(/[.,;:)]+$/, "") ?? "";
      const compound = `${leftWord}-${rightWord}`.toLowerCase();
      const known = [...compounds].some(
        (word) => word === compound || word.startsWith(`${leftWord.toLowerCase()}-`),
      );
      // Keep the hyphen only when it belongs to a real compound that also
      // occurs elsewhere in the wordlist; otherwise this is a typeset break.
      return known ? `${current}${addition}` : left + addition;
    }

    return `${current} ${addition}`;
  };

  const endsSentence = (value) => {
    if (!value) return true;
    const base = value.replace(/\s*\([^()]*\)\s*$/, "").trim();
    return /[.!?…][”"’']?$/.test(base);
  };
  const isComplete = (item) => endsSentence(item.dutch) && endsSentence(item.english);

  for (const line of lines) {
    const dutch = clean(line.dutch);
    const english = clean(line.english);
    const other = clean(line.other);
    const combined = `${dutch} ${english} ${other}`.trim();
    if (
      !combined ||
      (dutch === "Nederlands" && /^Engels\b/.test(english)) ||
      /^Woordenlijst per hoofdstuk$/.test(dutch) ||
      /^Contact_nieuw_/.test(combined) ||
      /rechten voorbehouden/i.test(combined) ||
      /^\d{2}-\d{2}-\d{2} \d{2}:\d{2}$/.test(combined) ||
      /^\d+$/.test(combined) ||
      /^\d+\s+[a-zà-ÿ]+$/.test(dutch) ||
      /^[a-zà-ÿ]+\s+\d+$/.test(dutch) ||
      /^Aantekeningen$/.test(dutch)
    ) {
      continue;
    }

    const chapterMatch = /^Hoofdstuk (\d+)$/i.exec(dutch);
    if (chapterMatch) {
      flushExample();
      chapter = Number(chapterMatch[1]);
      ensureChapter(chapter);
      group = null;
      previous = null;
      continue;
    }
    if (chapter === null) continue;

    const groupName = GROUP_NAMES.find(([pattern]) => pattern.test(dutch))?.[1];
    if (groupName) {
      flushExample();
      group = startGroup(groupName);
      previous = null;
      continue;
    }
    if (!group) continue;

    if (dutch && english) {
      // A parenthetical can wrap, putting the tail of one entry on a line
      // that also has an English gloss (`… (ik draai me om /` + `ik draai …`).
      const unbalanced = (value) =>
        (value.match(/\(/g)?.length ?? 0) > (value.match(/\)/g)?.length ?? 0);
      if (previous && (unbalanced(previous.dutch) || unbalanced(previous.english))) {
        if (unbalanced(previous.dutch)) previous.dutch = join(previous.dutch, dutch);
        if (unbalanced(previous.english)) previous.english = join(previous.english, english);
        continue;
      }

      // The tail of a wrapped example sentence. Keep feeding the current
      // example until both columns end with sentence punctuation.
      if (example && !example.complete) {
        example.dutch = join(example.dutch, dutch);
        example.english = join(example.english, english);
        example.complete = isComplete(example);
        continue;
      }

      // An example sentence starts with a capital and has several words. In
      // the phrase section the entries themselves are full sentences.
      const looksExample =
        group.group !== "zinnen en vragen" &&
        /^[A-ZÀ-Þ]/.test(dutch) &&
        dutch.split(/\s+/).length >= 2;

      if (looksExample) {
        flushExample();
        example = { entry: previous, dutch, english, complete: false };
        example.complete = isComplete(example);
      } else {
        flushExample();
        previous = { dutch, english, other: other || null, note: null };
        group.entries.push(previous);
      }
      continue;
    }

    if (dutch) {
      if (example && !example.complete) {
        example.dutch = join(example.dutch, dutch);
        example.complete = isComplete(example);
      } else if (previous) {
        previous.dutch = join(previous.dutch, dutch);
      }
      continue;
    }

    if (english) {
      if (example) {
        example.english = join(example.english, english);
        if (!example.complete) example.complete = isComplete(example);
      } else if (previous) {
        previous.english = join(previous.english, english);
      }
    }
  }

  flushExample();
  return chapters;
}

/* ------------------------------------------------------------------ grammar */

const BODY_START_RE = /^\d\s+Lijst met grammaticale termen/;
const HEADING_RE = /^(\d+(?:\.\d+)+\.?|\d)\s+([A-ZÀ-Þ].{1,90})$/;

function cleanGrammarLine(value) {
  return value
    .replace(/\t/g, "    ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/[■●]\s*/g, "")
    .split(/\s{2,}/)
    .map(clean)
    .filter(Boolean)
    .join(" · ")
    .trim();
}

function parseGrammar(text) {
  const rawLines = text.replace(/\f/g, "").split("\n");
  const start = rawLines.findIndex((line) => BODY_START_RE.test(line.trim()));
  const body = start === -1 ? rawLines : rawLines.slice(start);

  const sections = [];
  let current = null;
  let expectExamples = false;
  let inSeeAlso = false;

  const pushSection = (id, title) => {
    current = {
      id: `ref-${id.replace(/\./g, "-")}`,
      title: clean(title),
      paragraphs: [],
      examples: [],
    };
    sections.push(current);
    expectExamples = false;
  };

  for (const raw of body) {
    const trimmed = raw.replace(/\t/g, "    ").trim();
    if (!trimmed) {
      inSeeAlso = false;
      continue;
    }
    if (
      /Contact_nieuw_\d+_.*\.indd/.test(trimmed) ||
      /^Grammaticaoverzicht$/.test(trimmed) ||
      /^\d+\s+honderd[a-zà-ÿ]+$/.test(trimmed) ||
      /^honderd[a-zà-ÿ]+ \d+$/.test(trimmed) ||
      /^Bijlagen$/.test(trimmed) ||
      /^\d{1,3}$/.test(trimmed)
    ) {
      continue;
    }

    // "Zie ook: 4.2.1 …" lines can wrap onto the next line, which looks like a
    // section heading. Keep the reference as text instead of opening a new
    // section (it used to duplicate `ref-4-5-2` and swallow table rows).
    if (/^[^\p{L}]*Zie ook\b/iu.test(trimmed)) {
      if (current) current.paragraphs.push(cleanGrammarLine(trimmed));
      inSeeAlso = true;
      continue;
    }
    if (inSeeAlso) {
      if (current) current.paragraphs.push(cleanGrammarLine(trimmed));
      continue;
    }

    const heading = HEADING_RE.exec(trimmed.replace(/\s{2,}/g, " "));
    if (heading && !/\s{2,}/.test(trimmed.replace(/^\d+(?:\.\d+)+\.?\s+/, ""))) {
      pushSection(heading[1].replace(/\.$/, ""), heading[2]);
      continue;
    }
    if (!current) continue;

    const hasBullet = /^[■●]/.test(trimmed);
    const textLine = cleanGrammarLine(trimmed);
    if (!textLine) continue;

    if (/^(bijvoorbeeld|voorbeeld|voorbeelden)\s*:?$/i.test(textLine)) {
      expectExamples = true;
      continue;
    }

    const isExample = hasBullet || expectExamples;
    if (isExample) {
      current.examples.push(textLine);
      // A "Bijvoorbeeld:" block can run over several lines; keep collecting
      // until a clearly prose-like line ends it.
      if (expectExamples && (textLine.endsWith(".") || textLine.endsWith("!"))) continue;
      expectExamples = false;
      continue;
    }

    current.paragraphs.push(textLine);
  }

  return sections.filter(
    (section) => section.paragraphs.length > 0 || section.examples.length > 0,
  );
}

/* --------------------------------------------------- contact 4 (combined) */

/**
 * Contact 4 ships one combined "leer-werkboek" transcript PDF and two audio
 * folders. The transcript headings carry a page, chapter and exercise instead
 * of a plain `track N`, and the filenames encode the same information. Build
 * one card per audio file and pair it with the best matching transcript block.
 */
const C4_CHAPTER_RE = /^HOOFDSTUK (\d+)$/i;
const C4_EXAM_RE = /^EXAMENTRAINING$/i;
const C4_HEADING_RE =
  /^p\.(\d+)\s+(?:hoofdstuk\s+(\d+)|(examentraining)(?:\s+(luisteren|spreken))?)\s+track\s+oefening\s+(.+)$/i;
const C4_TB_FILE_RE =
  /^Contact-nieuw-4-LWB-p(\d+)-(H(\d+)|Examentraining)-track-oef-(.+)\.mp3$/i;
const C4_WB_FILE_RE = /^Contact-nieuw-4-HW-H(\d+)-track-(\d+)-(.+)\.mp3$/i;

const C4_VARIANT_RE = /\b(gesprek|bericht|toespraak|fragment)-(\d+)\b/i;
const C4_HEADING_VARIANT_RE = /\b(gesprek|bericht|toespraak|fragment)\s+(\d+)\b/i;
const C4_GEHEEL_RE = /\bgeheel\b/i;
const C4_SPECIAL_RE = /\balleen-voor-1e-druk-1e-oplage\b/i;

function c4Noise(line) {
  return (
    /^Transcripties$/i.test(line) ||
    /^Contact!.*nieuw 4.*leer-werkboek$/i.test(line) ||
    /^Transcripties Contact!.*nieuw 4.*leer-werkboek$/i.test(line) ||
    /Contact!.*Transcripties.*Intertaal/i.test(line) ||
    /^Alle rechten voorbehouden/i.test(line) ||
    /^Deze track hoeft niet/i.test(line) ||
    /^\d{1,3}$/.test(line)
  );
}

function c4ParseExerciseSpec(spec) {
  const variantMatch = C4_HEADING_VARIANT_RE.exec(spec);
  const geheel = C4_GEHEEL_RE.test(spec);
  const numbersPart = spec
    .replace(/\b(gesprek|bericht|toespraak|fragment)\s+\d+\b/gi, "")
    .replace(/\bgeheel\b/gi, "")
    .trim();
  return {
    exercises: [...numbersPart.matchAll(/\d+/g)].map((match) => Number(match[0])),
    variant: variantMatch
      ? { type: variantMatch[1].toLowerCase(), number: Number(variantMatch[2]) }
      : geheel
        ? { type: "geheel" }
        : null,
  };
}

function c4ParseAudioSpec(spec) {
  const named = C4_VARIANT_RE.exec(spec);
  const geheel = C4_GEHEEL_RE.test(spec);
  const special = C4_SPECIAL_RE.test(spec);
  const leading = /^(\d+(?:-\d+)*)/.exec(spec)?.[1] ?? "";
  const numbers = leading ? leading.split("-").map(Number) : [];
  const candidates = [];
  for (let index = 1; index <= numbers.length; index += 1) {
    candidates.push(numbers.slice(0, index));
  }
  return {
    numbers,
    exerciseCandidates: candidates,
    variant: named
      ? { type: named[1].toLowerCase(), number: Number(named[2]) }
      : geheel
        ? { type: "geheel" }
        : null,
    special,
  };
}

const c4SameNumbers = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

function c4VariantRank(variant) {
  if (!variant) return 0;
  if (variant.type === "fragment") return 10 + (variant.number ?? 0);
  if (variant.type === "gesprek") return 20 + (variant.number ?? 0);
  if (variant.type === "bericht") return 30 + (variant.number ?? 0);
  if (variant.type === "toespraak") return 40 + (variant.number ?? 0);
  if (variant.type === "geheel") return 90;
  return 50;
}

function c4VariantLabel(variant) {
  if (!variant) return null;
  if (variant.type === "geheel") return "geheel";
  return `${variant.type} ${variant.number}`;
}

function c4ExerciseLabel(exercises) {
  if (!exercises.length) return "Oefening";
  if (exercises.length === 1) return `Oefening ${exercises[0]}`;
  return `Oefening ${exercises.slice(0, -1).join(", ")} en ${exercises[exercises.length - 1]}`;
}

function c4BlockTitle(block) {
  const base = c4ExerciseLabel(block.exercises);
  const variant = c4VariantLabel(block.variant);
  return variant ? `${base} · ${variant}` : base;
}

function c4AudioTitle(entry) {
  if (entry.book === "wb") return entry.title;
  const base = c4ExerciseLabel(entry.variant ? entry.numbers : entry.primary);
  const variant = c4VariantLabel(entry.variant);
  if (variant) return `${base} · ${variant}`;
  if (entry.special) return `${base} · alleen voor 1e druk, 1e oplage`;
  if (entry.remainder) return `${base} · deel ${entry.remainder}`;
  return base;
}

function c4WorkbookTitle(descriptor) {
  const [kind, ...rest] = descriptor.split("-");
  return [kind, rest.join(" ")]
    .filter(Boolean)
    .map((part) => {
      const value = part.trim();
      if (!value) return "";
      if (/^[a-z]{1,2}$/i.test(value)) return value.toUpperCase();
      return value.charAt(0).toUpperCase() + value.slice(1);
    })
    .filter(Boolean)
    .join(" · ");
}

function c4SpeakerName(value) {
  const name = clean(value);
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

function c4ParseLegend(line) {
  const map = new Map();
  for (const part of line.split(",")) {
    const match = /^([^\p{L}\p{N}]+)\s*=\s*(.+)$/u.exec(part.trim());
    if (!match) continue;
    const symbol = [...match[1]].find((character) => character.trim());
    if (symbol) map.set(symbol, c4SpeakerName(match[2]));
  }
  return map;
}

function c4IsSpeaker(value, legend) {
  const first = [...value][0];
  if (!first) return false;
  const code = first.codePointAt(0) ?? 0;
  if (code >= 0xe000 && code <= 0xf8ff) return true;
  if (legend.has(first)) return true;
  if (/^[A-ZÀ-Þ][A-Za-zÀ-ÿ0-9 .'’()\/-]{0,40}:\s/.test(value)) return true;
  if (/^[A-ZÀ-Þ][A-Za-zÀ-ÿ0-9 .'’()\/-]{0,40}\s{4,}\S/.test(value)) return true;
  return false;
}

function c4TitleCandidate(value, legend) {
  if (c4IsSpeaker(value, legend)) return null;
  if (/^[^\p{L}\p{N}]*=/.test(value)) return null;
  if (/^\d/.test(value)) return null;
  if (/^[–—]\s/.test(value)) return null;
  if (/[,;:]$/.test(value)) return null;
  if (/[.!?]$/.test(value)) return null;
  if (value.split(/\s+/).length > 9) return null;
  return clean(value);
}

function c4Line(value, legend) {
  let text = value;
  const first = [...text][0];
  const code = first?.codePointAt(0) ?? 0;
  if (first && code >= 0xe000 && code <= 0xf8ff) {
    const rest = text.slice(first.length).trim();
    text = legend.has(first) ? `${legend.get(first)}: ${rest}` : `■ ${rest}`;
  } else if (first && legend.has(first)) {
    text = `${legend.get(first)}: ${text.slice(first.length).trim()}`;
  }

  const normalised = normaliseSpeaker(text);
  if (normalised !== text) {
    text = normalised;
  } else {
    const gap = /^([A-ZÀ-Þ][A-Za-zÀ-ÿ0-9 .'’()\/-]{0,40}?)\s{4,}(\S.*)$/.exec(text);
    if (gap) text = `${gap[1].trim()}: ${gap[2].trim()}`;
  }

  return clean(text.replace(/(\d+)\.\s{2,}/g, "$1. "));
}

function c4ParseTranscript(text) {
  const blocks = [];
  let block = null;
  let titleOpen = false;
  let legend = new Map();

  const flush = () => {
    if (block) blocks.push(block);
    block = null;
  };

  for (const raw of text.replace(/\f/g, "").split("\n")) {
    const trimmed = raw.replace(/\t/g, "    ").trim();
    if (!trimmed || c4Noise(trimmed)) continue;

    if (C4_CHAPTER_RE.test(trimmed) || C4_EXAM_RE.test(trimmed)) {
      flush();
      continue;
    }

    const heading = C4_HEADING_RE.exec(trimmed);
    if (heading) {
      flush();
      const isExam = Boolean(heading[3]);
      const section = isExam ? (heading[4]?.toLowerCase() ?? null) : null;
      const spec = c4ParseExerciseSpec(heading[5]);
      block = {
        page: Number(heading[1]),
        chapter: isExam ? 17 : Number(heading[2]),
        section,
        exercises: spec.exercises,
        variant: spec.variant,
        title: section ? `Examentraining ${section}` : null,
        lines: [],
      };
      titleOpen = !section;
      legend = new Map();
      continue;
    }

    if (!block) continue;

    if (/^[^\p{L}\p{N}]*=/.test(trimmed) && / = /.test(trimmed)) {
      legend = c4ParseLegend(trimmed);
      continue;
    }

    if (titleOpen) {
      const title = c4TitleCandidate(trimmed, legend);
      if (title) {
        block.title = title;
        titleOpen = false;
        continue;
      }
      titleOpen = false;
    }

    const line = c4Line(trimmed, legend);
    if (line) block.lines.push(line);
  }
  flush();

  return blocks.filter((item) => item.lines.length > 0);
}

function c4MatchScore(block, entry) {
  if (!entry.exerciseCandidates.some((candidate) => c4SameNumbers(candidate, block.exercises))) {
    return -Infinity;
  }

  let score = 100;
  if (block.variant) {
    if (
      entry.variant &&
      entry.variant.type === block.variant.type &&
      entry.variant.number === block.variant.number
    ) {
      score += 50;
    } else if (!entry.variant) {
      score += 10;
    } else if (entry.variant.type === "geheel") {
      score += 5;
    } else {
      return -Infinity;
    }
  } else if (!entry.variant) {
    score += entry.special ? 0 : 20;
    if (!entry.special && !entry.remainder) score += 10;
  } else if (entry.variant.type === "geheel") {
    score += 30;
  } else {
    score += 5;
  }

  return score;
}

async function buildContact4() {
  const combinedText = await extractPdf(config.pdfs?.combinedTranscript);
  if (!combinedText) {
    throw new Error("Contact 4 needs Contact-nieuw_4_transcripties_leer-werkboek.pdf");
  }

  const blocks = c4ParseTranscript(combinedText);
  const audioEntries = [];

  const textbookDir = join(bookRoot, "audio", "textbook");
  for (const file of await readdir(textbookDir)) {
    const match = C4_TB_FILE_RE.exec(file);
    if (!match) continue;
    const parsed = c4ParseAudioSpec(match[4]);
    audioEntries.push({
      book: "tb",
      folder: "textbook",
      file,
      page: Number(match[1]),
      chapter: /^examentraining$/i.test(match[2]) ? 17 : Number(match[3]),
      numbers: parsed.numbers,
      primary: parsed.numbers.length ? [parsed.numbers[0]] : [],
      remainder: parsed.numbers.length > 1 ? parsed.numbers.slice(1).join("-") : "",
      exerciseCandidates: parsed.exerciseCandidates,
      variant: parsed.variant,
      special: parsed.special,
    });
  }

  const workbookDir = join(bookRoot, "audio", "workbook");
  for (const file of await readdir(workbookDir)) {
    const match = C4_WB_FILE_RE.exec(file);
    if (!match) continue;
    audioEntries.push({
      book: "wb",
      folder: "workbook",
      file,
      chapter: Number(match[1]),
      workbookTrack: Number(match[2]),
      title: c4WorkbookTitle(match[3]),
      numbers: [],
      primary: [],
      remainder: "",
      exerciseCandidates: [],
      variant: null,
      special: false,
    });
  }

  audioEntries.sort((left, right) => {
    if (left.book !== right.book) return left.book === "tb" ? -1 : 1;
    if (left.chapter !== right.chapter) return left.chapter - right.chapter;
    if (left.book === "wb") {
      return (
        left.workbookTrack - right.workbookTrack ||
        left.file.localeCompare(right.file, undefined, { numeric: true })
      );
    }
    if (left.page !== right.page) return left.page - right.page;
    const length = Math.max(left.numbers.length, right.numbers.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (left.numbers[index] ?? -1) - (right.numbers[index] ?? -1);
      if (difference) return difference;
    }
    return (
      c4VariantRank(left.variant) - c4VariantRank(right.variant) ||
      left.file.localeCompare(right.file, undefined, { numeric: true })
    );
  });

  const trackCounters = new Map();
  for (const entry of audioEntries) {
    const key = `${entry.book}-${entry.chapter}`;
    const next = (trackCounters.get(key) ?? 0) + 1;
    trackCounters.set(key, next);
    entry.track = next;
  }

  const usedAudio = new Set();
  for (const block of blocks) {
    let best = null;
    let bestScore = -Infinity;
    for (const entry of audioEntries) {
      if (entry.book !== "tb" || entry.chapter !== block.chapter) continue;
      if (usedAudio.has(entry)) continue;
      const score = c4MatchScore(block, entry);
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    if (best) {
      usedAudio.add(best);
      block.audio = best;
      block.track = best.track;
    }
  }

  for (const block of blocks) {
    if (block.audio) continue;
    const key = `tb-${block.chapter}`;
    const next = (trackCounters.get(key) ?? 0) + 1;
    trackCounters.set(key, next);
    block.track = next;
  }

  const transcriptsByChapter = new Map();
  const addTranscript = (chapter, entry) => {
    if (!transcriptsByChapter.has(chapter)) transcriptsByChapter.set(chapter, []);
    transcriptsByChapter.get(chapter).push(entry);
  };

  for (const block of blocks) {
    addTranscript(block.chapter, {
      book: "tb",
      track: block.track,
      title: block.title || c4BlockTitle(block),
      lines: block.lines,
    });
  }

  for (const entry of audioEntries) {
    if (entry.book !== "tb" || usedAudio.has(entry)) continue;
    addTranscript(entry.chapter, {
      book: "tb",
      track: entry.track,
      title: c4AudioTitle(entry),
      lines: [],
    });
  }

  for (const entry of audioEntries) {
    if (entry.book !== "wb") continue;
    addTranscript(entry.chapter, {
      book: "wb",
      track: entry.track,
      title: entry.title,
      lines: [],
    });
  }

  const chapterNumbers = new Set();
  for (let number = 1; number <= 17; number += 1) chapterNumbers.add(number);
  for (const entry of audioEntries) chapterNumbers.add(entry.chapter);
  for (const block of blocks) chapterNumbers.add(block.chapter);

  const sortedChapters = [...chapterNumbers].sort((left, right) => left - right);
  await mkdir(join(outDir, "chapters"), { recursive: true });

  let transcriptCount = 0;
  for (const number of sortedChapters) {
    const transcripts = (transcriptsByChapter.get(number) ?? []).sort(
      (left, right) =>
        left.book.localeCompare(right.book) || left.track - right.track,
    );
    transcriptCount += transcripts.length;
    const chapter = {
      number,
      title: number === 17 ? "Examentraining" : "",
      vocab: [],
      transcripts,
      exercises: [],
      workbookExercises: [],
      grammar: [],
    };
    await writeFile(
      join(outDir, "chapters", `ch${String(number).padStart(2, "0")}.json`),
      JSON.stringify(chapter, null, 2) + "\n",
    );
    console.log(
      `ch${String(number).padStart(2, "0")}: 0 words · ${transcripts.length} tracks`,
    );
  }

  const manifest = audioEntries.map((entry) => ({
    book: entry.book,
    chapter: entry.chapter,
    track: entry.track,
    file: `Audio/contact-4/${entry.folder}/${entry.file}`,
    source: `audio/${entry.folder}/${entry.file}`,
  }));

  await writeFile(
    join(outDir, "audio-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  console.log(
    `\n${sortedChapters.length} chapters · 0 words · ${blocks.length} transcript blocks · ${transcriptCount} track entries · 0 grammar sections · ${manifest.length} audio tracks`,
  );
}

/* ---------------------------------------------------------------- assembling */

if (bookId === "contact-4") {
  await buildContact4();
  process.exit(0);
}

const [tbText, wbText, combinedText, wordlistXml, grammarText] = await Promise.all([
  extractPdf(config.pdfs?.tbTranscript),
  extractPdf(config.pdfs?.wbTranscript),
  extractPdf(config.pdfs?.combinedTranscript),
  extractPdfBbox(config.pdfs?.wordlist),
  extractPdf(config.pdfs?.grammar),
]);

const tb = tbText ? parseTranscripts(tbText, "tb") : new Map();
const wb = wbText ? parseTranscripts(wbText, "wb") : new Map();
if (combinedText) {
  const combined = parseTranscripts(combinedText, "tb");
  for (const [number, tracks] of combined) {
    if (!tb.has(number)) tb.set(number, new Map());
    for (const [track, entry] of tracks) tb.get(number).set(track, entry);
  }
}
const vocab = wordlistXml ? parseWordlist(wordlistXml) : new Map();
const grammar = grammarText ? parseGrammar(grammarText) : [];

const chapterNumbers = [
  ...new Set([...tb.keys(), ...wb.keys(), ...vocab.keys()]),
].sort((a, b) => a - b);

await mkdir(join(outDir, "chapters"), { recursive: true });

let totalWords = 0;
let totalTracks = 0;

for (const number of chapterNumbers) {
  const transcripts = [
    ...[...(tb.get(number)?.values() ?? [])].map((item) => ({
      book: "tb",
      track: item.track,
      title: item.title,
      lines: item.lines,
    })),
    ...[...(wb.get(number)?.values() ?? [])].map((item) => ({
      book: "wb",
      track: item.track,
      title: item.title,
      lines: item.lines,
    })),
  ];

  const chapter = {
    number,
    title: "",
    vocab: vocab.get(number) ?? [],
    transcripts,
    exercises: [],
    workbookExercises: [],
    grammar: [],
  };

  await writeFile(
    join(outDir, "chapters", `ch${String(number).padStart(2, "0")}.json`),
    JSON.stringify(chapter, null, 2) + "\n",
  );

  const words = chapter.vocab.reduce((sum, group) => sum + group.entries.length, 0);
  totalWords += words;
  totalTracks += transcripts.length;
  console.log(
    `ch${String(number).padStart(2, "0")}: ${words} words · ${transcripts.length} transcripts`,
  );
}

/* ------------------------------------------------------------------- audio */

const trackChapters = new Map();
for (const [number, tracks] of tb) {
  for (const track of tracks.keys()) trackChapters.set(`tb-${track}`, number);
}
for (const [number, tracks] of wb) {
  for (const track of tracks.keys()) trackChapters.set(`wb-${track}`, number);
}

const manifest = [];
for (const [book, folder] of [
  ["tb", "textbook"],
  ["wb", "workbook"],
]) {
  if (!config.audio.includes(folder)) continue;
  const audioDir = join(bookRoot, "audio", folder);
  let files;
  try {
    files = await readdir(audioDir);
  } catch {
    continue;
  }

  const tracks = files
    .map((file) => ({ file, match: /Track_(\d+)\.mp3$/i.exec(file) }))
    .filter((item) => item.match)
    .map((item) => ({ file: item.file, track: Number(item.match[1]) }))
    .sort((a, b) => a.track - b.track);

  const chapterOf = (track) => {
    if (trackChapters.has(`${book}-${track}`)) return trackChapters.get(`${book}-${track}`);
    // Audio without a transcript (e.g. a production-only track) belongs to the
    // chapter of the closest preceding track in the same book.
    for (let previous = track - 1; previous >= 1; previous -= 1) {
      if (trackChapters.has(`${book}-${previous}`)) {
        return trackChapters.get(`${book}-${previous}`);
      }
    }
    for (let next = track + 1; next <= track + 40; next += 1) {
      if (trackChapters.has(`${book}-${next}`)) return trackChapters.get(`${book}-${next}`);
    }
    return chapterNumbers[0] ?? 0;
  };

  for (const item of tracks) {
    manifest.push({
      book,
      chapter: chapterOf(item.track),
      track: item.track,
      file: `Audio/${bookId}/${folder}/${item.file}`,
      source: `audio/${folder}/${item.file}`,
    });
  }
}

await writeFile(
  join(outDir, "audio-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

if (grammar.length > 0) {
  await writeFile(
    join(outDir, "grammar-reference.json"),
    JSON.stringify(grammar, null, 2) + "\n",
  );
}

console.log(
  `\n${chapterNumbers.length} chapters · ${totalWords} words · ${totalTracks} transcripts · ${grammar.length} grammar sections · ${manifest.length} audio tracks`,
);
