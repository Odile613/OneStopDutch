export type NoteCategory = "word" | "pronunciation" | "grammar";

export interface SavedNote {
  id: string;
  text: string;
  note: string;
  category: NoteCategory;
  /** Wordlist group key when this is a word note, e.g. "verba". */
  wordType?: string;
  /** Course, section and chapter the note was created in, e.g. contact-1/textbook/3. */
  context: string;
  createdAt: number;
}

export const NOTES_STORAGE_KEY = "onestopdutch-notes";

export const NOTE_LABELS: Record<NoteCategory, string> = {
  word: "Word",
  pronunciation: "Pronunciation",
  grammar: "Grammar",
};

/** Notes that belong somewhere other than the grammar section. */
export function isWordNote(note: SavedNote): boolean {
  return note.category !== "grammar";
}

export const CREATE_NOTE_EVENT = "osd:create-note";
export const OPEN_NOTE_EVENT = "osd:open-note";
export const AI_EXPLAIN_EVENT = "osd:ai-explain";
export const EXPAND_ALL_TRACKS_EVENT = "osd:expand-all-tracks";

export function notesForCourse(
  notes: SavedNote[],
  courseId: string,
  categories?: NoteCategory[],
): SavedNote[] {
  return notes.filter(
    (note) =>
      note.context.startsWith(`${courseId}/`) &&
      (!categories || categories.includes(note.category)),
  );
}

export function foldText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Matches the quoted selection, the note body and the note location. */
export function noteMatchesQuery(note: SavedNote, query: string): boolean {
  const search = foldText(query.trim());
  if (!search) return true;
  return [
    note.text,
    note.note,
    NOTE_LABELS[note.category],
    noteLocation(note.context),
  ].some((value) => foldText(value).includes(search));
}

/** Notes saved anywhere in one chapter, across textbook/workbook and grammar. */
export function notesForChapter(
  notes: SavedNote[],
  courseId: string,
  chapter: number,
): SavedNote[] {
  return notes.filter((note) => {
    const [noteCourse, , noteChapter] = note.context.split("/");
    return noteCourse === courseId && Number(noteChapter) === chapter;
  });
}

export function noteLocation(context: string): string {
  const [, section, chapter] = context.split("/");
  const sectionLabel =
    section === "wordlist"
      ? "Wordlist"
      : section === "grammar"
        ? "Grammar"
        : section === "workbook"
          ? "Workbook"
          : "Textbook";
  const chapterLabel = Number(chapter) === 0 ? "Introduction" : `Chapter ${chapter}`;
  return `${sectionLabel} · ${chapterLabel}`;
}
