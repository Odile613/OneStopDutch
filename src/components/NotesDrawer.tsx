import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { noteMatchesQuery, OPEN_NOTE_EVENT, type SavedNote } from "../lib/notes";
import { goToNote } from "../lib/noteScroll";
import { sortNotes, type NoteSortMode } from "../lib/noteSort";
import { Icon } from "./Icon";
import NoteSortControls from "./NoteSortControls";
import NotesPanel from "./NotesPanel";

/** Right-side drawer listing every note saved in the current chapter. */
export default function NotesDrawer({
  chapter,
  notes,
  onClose,
  onUpdateNote,
  onDeleteNote,
}: {
  chapter: number;
  notes: SavedNote[];
  onClose: () => void;
  onUpdateNote: (id: string, note: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  const [mode, setMode] = useState<NoteSortMode>("date");
  const [newestFirst, setNewestFirst] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    document.body.classList.add("notes-drawer-open");
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("notes-drawer-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const ordered = useMemo(() => {
    const matching = notes.filter((note) => noteMatchesQuery(note, query));
    return sortNotes(matching, mode, newestFirst);
  }, [notes, mode, newestFirst, query]);

  return createPortal(
    <aside
      className="notes-drawer"
      role="dialog"
      aria-label={`Notes for chapter ${chapter}`}
    >
      <header className="notes-drawer__head">
        <span className="notes-drawer__eyebrow">Chapter {chapter}</span>

        <div className="notes-drawer__tools">
          <NoteSortControls
            mode={mode}
            newestFirst={newestFirst}
            onModeChange={setMode}
            onNewestFirstChange={setNewestFirst}
          />
          <button
            type="button"
            className="notes-drawer__tool"
            onClick={onClose}
            aria-label="Close notes"
            title="Close notes"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      <div className="notes-drawer__body">
        <label className="notes-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this chapter…"
            aria-label="Search notes in this chapter"
          />
        </label>

        <NotesPanel
          title={`Chapter ${chapter} notes`}
          notes={ordered}
          empty="No notes in this chapter yet."
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
          compact
          bare
          preserveOrder
          onNoteClick={(note, element) => {
            goToNote(note);
            window.dispatchEvent(
              new CustomEvent(OPEN_NOTE_EVENT, {
                detail: { id: note.id, rect: element.getBoundingClientRect() },
              }),
            );
            onClose();
          }}
        />
      </div>
    </aside>,
    document.body,
  );
}
