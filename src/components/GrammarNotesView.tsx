import { useEffect, useMemo, useState } from "react";
import type { ChapterData } from "../types";
import { noteMatchesQuery, type SavedNote } from "../lib/notes";
import { sortNotes, type NoteSortMode } from "../lib/noteSort";
import { Icon } from "./Icon";
import GrammarChat from "./GrammarChat";
import NoteSortControls from "./NoteSortControls";
import NotesPanel from "./NotesPanel";

/** Grammar section: searchable, editable saved grammar notes. */
export default function GrammarNotesView({
  courseId,
  chapters,
  initialChapter,
  notes,
  onUpdateNote,
  onDeleteNote,
}: {
  courseId: string;
  chapters: ChapterData[];
  initialChapter: number;
  notes: SavedNote[];
  onUpdateNote: (id: string, note: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState<number | "all">(initialChapter);
  const [sortMode, setSortMode] = useState<NoteSortMode>("date");
  const [newestFirst, setNewestFirst] = useState(true);

  useEffect(() => {
    setChapter(initialChapter);
  }, [initialChapter, courseId]);

  const scoped = useMemo(
    () =>
      notes.filter((note) => {
        if (note.category !== "grammar") return false;
        const [noteCourse, , noteChapter] = note.context.split("/");
        return (
          noteCourse === courseId &&
          (chapter === "all" || Number(noteChapter) === chapter)
        );
      }),
    [notes, courseId, chapter],
  );

  const filtered = scoped.filter((note) => noteMatchesQuery(note, query));
  const sorted = sortNotes(filtered, sortMode, newestFirst);
  const searching = query.trim().length > 0;
  const hasGrammarNotes = notes.some((note) => note.category === "grammar");

  return (
    <div className="notes-view">
      {hasGrammarNotes && (
        <div className="toolbar wordlist-toolbar grammar-toolbar">
          <label className="select-field">
            <span className="visually-hidden">Chapter</span>
            <select
              value={chapter}
              onChange={(event) =>
                setChapter(
                  event.target.value === "all" ? "all" : Number(event.target.value),
                )
              }
            >
              <option value="all">All chapters</option>
              {chapters.map((item) => (
                <option key={item.number} value={item.number}>
                  Ch. {item.number}
                </option>
              ))}
            </select>
            <Icon name="chevron" size={14} className="select-field__chevron" />
          </label>

          <label className="search-field">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search grammar notes…"
              aria-label="Search your grammar notes"
            />
          </label>
        </div>
      )}

      <GrammarChat />

      {hasGrammarNotes && (
        <NotesPanel
          title="Notes"
          notes={sorted}
          empty={searching ? "No grammar notes match your search." : "No notes in this selection."}
          compact
          preserveOrder
          actions={
            <NoteSortControls
              mode={sortMode}
              newestFirst={newestFirst}
              onModeChange={setSortMode}
              onNewestFirstChange={setNewestFirst}
              showCategory={false}
            />
          }
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
        />
      )}
    </div>
  );
}
