/** A single exercise, digitized from the textbook / workbook. */
export type Exercise = ChoiceExercise | FillInExercise | OpenExercise;

interface ExerciseBase {
  id: string;
  /** Instruction shown above the question, e.g. "Kies het juiste antwoord." */
  instruction?: string;
}

export interface ChoiceExercise extends ExerciseBase {
  type: "choice";
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
}

export interface FillInExercise extends ExerciseBase {
  type: "fill";
  /** Use "___" where the answer goes, e.g. "Ik ___ student. (zijn)" */
  question: string;
  /** All accepted answers (compared case-insensitively, trimmed). */
  accepted: string[];
  /** The canonical solution shown after checking. */
  solution: string;
  explanation?: string;
}

export interface OpenExercise extends ExerciseBase {
  type: "open";
  question: string;
  /** Model answer revealed when the learner checks. */
  solution: string;
  explanation?: string;
}

/** An audio track from the course (chapter 0 = introduction chapter). */
export interface AudioTrack {
  book: "tb" | "wb";
  chapter: number;
  track: number;
  /** Public path relative to the site root, e.g. Audio/contact-2/textbook/… */
  file: string;
  /** Source path inside the book's source-materials folder, when it needs syncing. */
  source?: string;
}

export interface VocabEntry {
  dutch: string;
  english: string;
  /** Additional gloss if the wordlist provides one (e.g. another English wording). */
  other?: string | null;
  /** Example sentence or usage note. */
  note?: string | null;
}

export interface VocabGroup {
  /** e.g. "verba", "substantieven", "adjectieven", "zinnen en vragen" */
  group: string;
  entries: VocabEntry[];
}

export interface TranscriptTrack {
  book: "tb" | "wb";
  track: number;
  /** Track heading as in the transcript book, e.g. "De dialoog". */
  title?: string | null;
  lines: string[];
}

export interface GrammarSection {
  id: string;
  title: string;
  /** Plain-text paragraphs; kept faithful to the grammar reference. */
  paragraphs: string[];
  /** Example lines shown as-is. */
  examples?: string[];
}

export interface ChapterData {
  /** 0 = introduction chapter */
  number: number;
  title: string;
  /** Optional notice shown above the chapter (e.g. missing audio). */
  notice?: string | null;
  vocab: VocabGroup[];
  transcripts: TranscriptTrack[];
  /** Exercises from the textbook. */
  exercises: Exercise[];
  /** Exercises from the workbook. */
  workbookExercises: Exercise[];
  grammar: GrammarSection[];
}

export type CourseId = "contact-1" | "contact-2" | "contact-3" | "contact-4";

export interface Course {
  id: CourseId;
  /** Book number in the Contact! nieuw series. */
  bookNumber: number;
  title: string;
  subtitle: string;
  chapters: ChapterData[];
  audioTracks: AudioTrack[];
  /** Book-level grammar appendix, for courses without per-chapter grammar. */
  referenceGrammar?: GrammarSection[];
}

export type BookId = "tb" | "wb";
export type SectionId = "textbook" | "workbook" | "wordlist" | "grammar";
