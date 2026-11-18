import type {
  AudioTrack,
  BookId,
  ChapterData,
  Course,
  CourseId,
  TranscriptTrack,
  VocabEntry,
} from "../types";
import { courses } from "./courses";

export { courses };

export function courseById(id: string): Course | undefined {
  return courses.find((course) => course.id === id);
}

export function chapterByNumber(course: Course, number: number): ChapterData {
  return course.chapters.find((chapter) => chapter.number === number) ?? course.chapters[0];
}

export function chapterName(chapter: ChapterData): string {
  if (chapter.number === 0) return "Introduction";
  return chapter.title ? `Chapter ${chapter.number} · ${chapter.title}` : `Chapter ${chapter.number}`;
}

export function shortChapterName(chapter: ChapterData): string {
  if (chapter.number === 0) return "Introductie";
  return chapter.title || `Chapter ${chapter.number}`;
}

export function chapterOptionLabel(chapter: ChapterData): string {
  if (chapter.number === 0) return "Introduction";
  return chapter.title ? `${chapter.number}. ${chapter.title}` : `Chapter ${chapter.number}`;
}

export function tracksFor(
  tracks: AudioTrack[],
  chapter: ChapterData,
  book: BookId,
): AudioTrack[] {
  return tracks
    .filter((track) => track.chapter === chapter.number && track.book === book)
    .sort((a, b) => a.track - b.track);
}

export function transcriptsFor(chapter: ChapterData, book: BookId): TranscriptTrack[] {
  return chapter.transcripts
    .filter((transcript) => transcript.book === book)
    .sort((a, b) => a.track - b.track);
}

export function audioUrl(track: AudioTrack): string {
  const path = track.file.replace(/^materials\//, "");
  return `${import.meta.env.BASE_URL}${path}`;
}

export function vocabCount(chapter: ChapterData): number {
  return chapter.vocab.reduce((total, group) => total + group.entries.length, 0);
}

export function transcriptLineCount(chapter: ChapterData, book: BookId): number {
  return transcriptsFor(chapter, book).reduce(
    (total, transcript) => total + transcript.lines.length,
    0,
  );
}

export function grammarStringCount(chapter: ChapterData): number {
  return chapter.grammar.reduce(
    (total, section) =>
      total + section.paragraphs.length + (section.examples?.length ?? 0),
    0,
  );
}

export function referenceStringCount(course: Course): number {
  return (course.referenceGrammar ?? []).reduce(
    (total, section) =>
      total + section.paragraphs.length + (section.examples?.length ?? 0),
    0,
  );
}

export interface WordRow extends VocabEntry {
  key: string;
  chapterNumber: number;
  chapterTitle: string;
  group: string;
}

export function allWords(chaptersToUse: ChapterData[]): WordRow[] {
  return chaptersToUse.flatMap((chapter) =>
    chapter.vocab.flatMap((group) =>
      group.entries.map((entry) => ({
        ...entry,
        key: `${chapter.number}|${group.group}|${entry.dutch}|${entry.english}`,
        chapterNumber: chapter.number,
        chapterTitle: chapter.title,
        group: group.group,
      })),
    ),
  );
}

export const GROUP_LABELS: Record<string, string> = {
  verba: "Verbs",
  "speciale verba": "Special verbs",
  substantieven: "Nouns",
  adjectieven: "Adjectives",
  "andere woorden": "Other words",
  "zinnen en vragen": "Phrases & questions",
  "zinnen, vragen en uitdrukkingen": "Phrases, questions & idioms",
  "vaste combinaties": "Fixed expressions",
};

export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.charAt(0).toUpperCase() + group.slice(1);
}

export const COURSE_IDS: CourseId[] = ["contact-1", "contact-2", "contact-3", "contact-4"];
