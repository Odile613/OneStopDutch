import { useState, type ReactNode } from "react";
import {
  NOTE_LABELS,
  type NoteCategory,
  type SavedNote,
} from "../lib/notes";
import { Icon, type IconName } from "./Icon";

const ICONS: Record<NoteCategory, IconName> = {
  word: "book",
  pronunciation: "volume",
  grammar: "grammar",
};

/** Saved selection notes shown in the Wordlist, Grammar and chapter drawer. */
export default function NotesPanel({
  title,
  notes,
  empty,
  onUpdateNote,
  onDeleteNote,
  compact = false,
  preserveOrder = false,
  bare = false,
  actions,
  onNoteClick,
}: {
  title: string;
  notes: SavedNote[];
  empty?: string;
  onUpdateNote: (id: string, note: string) => void;
  onDeleteNote: (id: string) => void;
  compact?: boolean;
  preserveOrder?: boolean;
  bare?: boolean;
  actions?: ReactNode;
  onNoteClick?: (note: SavedNote, element: HTMLElement) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (notes.length === 0 && !empty) return null;

  const sorted = preserveOrder
    ? notes
    : [...notes].sort((a, b) => b.createdAt - a.createdAt);

  function startEditing(note: SavedNote) {
    setEditingId(note.id);
    setDraft(note.note);
  }

  function saveEditing() {
    if (!editingId) return;
    onUpdateNote(editingId, draft.trim());
    setEditingId(null);
  }

  const content =
    sorted.length === 0 ? (
      <p className="notes-panel__empty">{empty}</p>
    ) : (
      <ul className="notes-panel__list">
        {sorted.map((note) => (
          <li
            key={note.id}
            className={`notes-panel__item notes-panel__item--${note.category}`}
          >
            <div className="notes-panel__meta">
              <span className="notes-panel__category" title={NOTE_LABELS[note.category]}>
                <Icon name={ICONS[note.category]} size={compact ? 12 : 14} />
              </span>
            </div>
            <button
              type="button"
              className="notes-panel__quote notes-panel__quote-button"
              onClick={(event) => onNoteClick?.(note, event.currentTarget)}
              disabled={!onNoteClick}
              title={onNoteClick ? "Open note" : undefined}
            >
              {note.text}
            </button>

            {editingId === note.id ? (
              <div className="notes-panel__editor">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Add to this note…"
                  rows={5}
                  aria-label="Edit note"
                  autoFocus
                />
                <div className="notes-panel__actions">
                  <button
                    type="button"
                    className="link-button notes-panel__delete-button"
                    onClick={() => onDeleteNote(note.id)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={saveEditing}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="notes-panel__note-row">
                <p
                  className={
                    note.note
                      ? "notes-panel__text"
                      : "notes-panel__text notes-panel__text--empty"
                  }
                >
                  {note.note || "No note text yet."}
                </p>
                <div className="notes-panel__item-actions">
                  <button
                    type="button"
                    className="link-button notes-panel__edit-button"
                    onClick={() => startEditing(note)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="link-button notes-panel__delete-button"
                    onClick={() => onDeleteNote(note.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    );

  if (bare) {
    return <div className="notes-list">{content}</div>;
  }

  const header = (
    <div className="notes-panel__head">
      <button
        type="button"
        className="notes-panel__toggle"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        {title}
        <Icon
          name="chevron"
          size={15}
          className={
            collapsed
              ? "notes-panel__chevron"
              : "notes-panel__chevron is-open"
          }
        />
      </button>
      {actions}
    </div>
  );

  if (compact) {
    return (
      <div className="notes-list notes-list--panel">
        {header}
        {!collapsed && content}
      </div>
    );
  }

  return (
    <section className="notes-panel" aria-label={title}>
      {header}

      {!collapsed && content}
    </section>
  );
}
