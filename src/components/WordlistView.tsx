import { useEffect, useMemo, useState } from "react";
import type { ChapterData } from "../types";
import {
  allWords,
  groupLabel,
  type WordRow,
} from "../data";
import {
  CREATE_NOTE_EVENT,
  OPEN_NOTE_EVENT,
  noteMatchesQuery,
  notesForCourse,
  foldText,
  type SavedNote,
} from "../lib/notes";
import { sortNotes, type NoteSortMode } from "../lib/noteSort";
import { useLocalStorage } from "../lib/useLocalStorage";
import { speakDutch } from "../lib/speech";
import { Icon } from "./Icon";
import NoteSortControls from "./NoteSortControls";
import NotesPanel from "./NotesPanel";

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

interface GroupBlock {
  chapterNumber: number;
  chapterTitle: string;
  group: string;
  words: WordRow[];
}

/**
 * Searchable, printable wordlist with per-word audio, stars and a flashcard
 * mode. Words are kept in the chapter order of the printed wordlist.
 */
export default function WordlistView({
  courseId,
  chapters,
  notes,
  onUpdateNote,
  onDeleteNote,
  initialChapter,
  onChapterChange,
}: {
  courseId: string;
  chapters: ChapterData[];
  notes: SavedNote[];
  onUpdateNote: (id: string, note: string) => void;
  onDeleteNote: (id: string) => void;
  initialChapter: number;
  onChapterChange: (chapter: number) => void;
}) {
  const everyWord = useMemo(() => allWords(chapters), [chapters]);
  const [scope, setScope] = useState<number | "all">(initialChapter);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [hideEnglish, setHideEnglish] = useState(false);
  const [hideDutch, setHideDutch] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [mode, setMode] = useState<"list" | "cards">("list");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [dutchRevealed, setDutchRevealed] = useState<Set<string>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [noteSortMode, setNoteSortMode] = useState<NoteSortMode>("date");
  const [noteNewestFirst, setNoteNewestFirst] = useState(true);
  const [stars, setStars] = useLocalStorage<Record<string, true>>(
    `onestopdutch-stars-${courseId}`,
    {},
  );

  const wordNotes = useMemo(
    () => notesForCourse(notes, courseId, ["word", "pronunciation"]),
    [notes, courseId],
  );
  const visibleWordNotes = useMemo(
    () => wordNotes.filter((note) => noteMatchesQuery(note, query)),
    [wordNotes, query],
  );
  const sortedNotes = useMemo(
    () => sortNotes(visibleWordNotes, noteSortMode, noteNewestFirst),
    [visibleWordNotes, noteSortMode, noteNewestFirst],
  );
  const panelNotes = useMemo(() => {
    if (group === "pronunciation") {
      return sortedNotes.filter((note) => note.category === "pronunciation");
    }
    return sortedNotes.filter((note) => {
      if (note.category === "pronunciation") return true;
      return (
        note.category === "word" &&
        !everyWord.some(
          (word) => foldText(word.dutch) === foldText(note.text.trim()),
        )
      );
    });
  }, [sortedNotes, group, everyWord]);

  useEffect(() => {
    setScope(initialChapter);
  }, [initialChapter]);

  const groups = useMemo(
    () => [...new Set(everyWord.map((word) => word.group))],
    [everyWord],
  );

  const words = useMemo(() => {
    const search = fold(query.trim());
    return everyWord.filter((word) => {
      if (scope !== "all" && word.chapterNumber !== scope) return false;
      if (group !== "all" && group !== "mynote" && word.group !== group) return false;
      if (starredOnly && !stars[word.key]) return false;
      if (!search) return true;
      return [word.dutch, word.english, word.other ?? "", word.note ?? ""].some(
        (field) => fold(field).includes(search),
      );
    });
  }, [everyWord, scope, group, starredOnly, stars, query]);

  const blocks = useMemo<GroupBlock[]>(() => {
    const result: GroupBlock[] = [];
    for (const word of words) {
      const last = result[result.length - 1];
      if (
        last &&
        last.chapterNumber === word.chapterNumber &&
        last.group === word.group
      ) {
        last.words.push(word);
      } else {
        result.push({
          chapterNumber: word.chapterNumber,
          chapterTitle: word.chapterTitle,
          group: word.group,
          words: [word],
        });
      }
    }
    return result;
  }, [words]);

  const totalWords = everyWord.length;
  const hasWords = totalWords > 0;

  function toggleStar(key: string) {
    setStars((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }

  function toggleReveal(key: string) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleDutchReveal(key: string) {
    setDutchRevealed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const notesByWord = useMemo(() => {
    const map = new Map<string, SavedNote>();
    for (const note of wordNotes) {
      if (note.category !== "word") continue;
      map.set(foldText(note.text.trim()), note);
    }
    return map;
  }, [wordNotes]);

  function addNoteForWord(word: WordRow, element: HTMLElement) {
    const existing = notesByWord.get(foldText(word.dutch));
    if (existing) {
      window.dispatchEvent(
        new CustomEvent(OPEN_NOTE_EVENT, {
          detail: { id: existing.id, rect: element.getBoundingClientRect() },
        }),
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent(CREATE_NOTE_EVENT, {
        detail: {
          text: word.dutch,
          rect: element.getBoundingClientRect(),
          wordType: word.group,
          category: group === "pronunciation" ? "pronunciation" : "word",
        },
      }),
    );
  }

  return (
    <div className="page">
      <div className="toolbar wordlist-toolbar">
        <label className="select-field">
          <span className="visually-hidden">Chapter</span>
          <select
            value={scope}
            onChange={(event) => {
              if (event.target.value === "all") {
                setScope("all");
              } else {
                const next = Number(event.target.value);
                setScope(next);
                onChapterChange(next);
              }
            }}
          >
            <option value="all">All chapters</option>
            {chapters.map((chapter) => (
              <option key={chapter.number} value={chapter.number}>
                {chapter.number === 0
                  ? "Introduction"
                  : chapter.title
                    ? `${chapter.number}. ${chapter.title}`
                    : `Chapter ${chapter.number}`}
              </option>
            ))}
          </select>
          <Icon name="chevron" size={14} className="select-field__chevron" />
        </label>

        <label className="select-field">
          <span className="visually-hidden">Word type</span>
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="all">All types</option>
            <option value="mynote">MyNote</option>
            <option value="pronunciation">Pronunciation</option>
            {groups.map((value) => (
              <option key={value} value={value}>
                {groupLabel(value)}
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
            placeholder="Search Dutch or English…"
            aria-label="Search the wordlist"
          />
        </label>

        <div className="wordlist-actions" role="group" aria-label="Wordlist view options">
          <button
            type="button"
            className={mode === "list" ? "wordlist-action is-active" : "wordlist-action"}
            onClick={() => setMode("list")}
            aria-label="List view"
            title="List view"
          >
            <Icon name="viewList" size={16} />
          </button>
          <button
            type="button"
            className={hideEnglish ? "wordlist-action is-active" : "wordlist-action"}
            onClick={() => setHideEnglish((value) => !value)}
            aria-pressed={hideEnglish}
            aria-label="Hide English"
            title="Hide English"
          >
            <span className="wordlist-action__letter">EN</span>
          </button>
          <button
            type="button"
            className={hideDutch ? "wordlist-action is-active" : "wordlist-action"}
            onClick={() => setHideDutch((value) => !value)}
            aria-pressed={hideDutch}
            aria-label="Hide Dutch"
            title="Hide Dutch"
          >
            <span className="wordlist-action__letter">NL</span>
          </button>
          <button
            type="button"
            className={starredOnly ? "wordlist-action is-active" : "wordlist-action"}
            onClick={() => setStarredOnly((value) => !value)}
            aria-pressed={starredOnly}
            aria-label="Starred only"
            title="Starred only"
          >
            <Icon name="star" size={16} />
          </button>
          <button
            type="button"
            className={mode === "cards" ? "wordlist-action is-active" : "wordlist-action"}
            onClick={() => setMode("cards")}
            aria-label="Flashcards"
            title="Flashcards"
          >
            <Icon name="viewCards" size={16} />
          </button>
        </div>
      </div>

      {!hasWords ? (
        <div className="empty-state">
          <Icon name="list" size={30} />
          <h3>No wordlist for this book yet</h3>
          <p>
            The source wordlist for this book has not been uploaded. You can still
            use the textbook and workbook audio.
          </p>
        </div>
      ) : group === "mynote" ? null : mode === "cards" ? (
        <Flashcards
          words={words}
          stars={stars}
          onToggleStar={toggleStar}
          filterKey={`${scope}|${group}|${query}|${starredOnly}`}
        />
      ) : blocks.length === 0 ? (
        <div className="empty-state">
          <Icon name="search" size={30} />
          <h3>No words match those filters</h3>
          <p>Try a different search term, chapter or word type.</p>
          {scope !== "all" && query && (
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => setScope("all")}
            >
              Search all chapters
            </button>
          )}
        </div>
      ) : (
        <div className="wordlist">
          {blocks.map((block) => {
            const groupKey = `${block.chapterNumber}-${block.group}`;
            const collapsed = collapsedGroups.has(groupKey);
            return (
              <section key={groupKey} className="word-group">
                <button
                  type="button"
                  className="word-group__head"
                  onClick={() => toggleGroup(groupKey)}
                  aria-expanded={!collapsed}
                >
                  <span className="word-group__labels">
                    {scope === "all" && (
                      <span className="word-group__chapter">
                        {block.chapterNumber === 0
                          ? "Introduction"
                          : `Chapter ${block.chapterNumber}`}
                        {block.chapterTitle ? ` · ${block.chapterTitle}` : ""}
                      </span>
                    )}
                    <span className="word-group__title">{groupLabel(block.group)}</span>
                  </span>
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
                {!collapsed && (
                  <div className="word-table">
                    <div className="word-table__head" aria-hidden="true">
                      <span />
                      <span>Dutch</span>
                      <span>English</span>
                      <span />
                    </div>
                    {block.words.map((word) => (
                      <WordLine
                        key={word.key}
                        word={word}
                        starred={Boolean(stars[word.key])}
                        onToggleStar={() => toggleStar(word.key)}
                        hideEnglish={hideEnglish}
                        revealed={revealed.has(word.key)}
                        onReveal={() => toggleReveal(word.key)}
                        hideDutch={hideDutch}
                        dutchRevealed={dutchRevealed.has(word.key)}
                        onRevealDutch={() => toggleDutchReveal(word.key)}
                        onAddNote={(element) => addNoteForWord(word, element)}
                        attachedNote={notesByWord.get(foldText(word.dutch))}
                        onDeleteNote={onDeleteNote}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <NotesPanel
        title="MyNote"
        notes={panelNotes}
        compact
        preserveOrder
        actions={
          <NoteSortControls
            mode={noteSortMode}
            newestFirst={noteNewestFirst}
            onModeChange={setNoteSortMode}
            onNewestFirstChange={setNoteNewestFirst}
          />
        }
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
      />
    </div>
  );
}

function WordLine({
  word,
  starred,
  onToggleStar,
  hideEnglish,
  revealed,
  onReveal,
  hideDutch,
  dutchRevealed,
  onRevealDutch,
  onAddNote,
  attachedNote,
  onDeleteNote,
}: {
  word: WordRow;
  starred: boolean;
  onToggleStar: () => void;
  hideEnglish: boolean;
  revealed: boolean;
  onReveal: () => void;
  hideDutch: boolean;
  dutchRevealed: boolean;
  onRevealDutch: () => void;
  onAddNote: (element: HTMLElement) => void;
  attachedNote?: SavedNote;
  onDeleteNote?: (id: string) => void;
}) {
  const englishHidden = hideEnglish && !revealed;
  const dutchHidden = hideDutch && !dutchRevealed;

  return (
    <div className="word-line">
      <button
        type="button"
        className={starred ? "star-button is-starred" : "star-button"}
        onClick={onToggleStar}
        aria-pressed={starred}
        aria-label={starred ? "Remove star" : "Star this word"}
        title={starred ? "Remove star" : "Star this word"}
      >
        <Icon name="star" size={17} />
      </button>
      <div className="word-line__dutch">
        {dutchHidden ? (
          <button
            type="button"
            className="reveal-button"
            onClick={onRevealDutch}
            aria-label="Reveal Dutch"
            title="Reveal Dutch"
          >
            <Icon name="eye" size={15} />
          </button>
        ) : (
          <>
            <span>{word.dutch}</span>
            {(attachedNote?.note || word.note) && (
              <small>{attachedNote?.note || word.note}</small>
            )}
          </>
        )}
      </div>
      <div className="word-line__english">
        {englishHidden ? (
          <button
            type="button"
            className="reveal-button"
            onClick={onReveal}
            aria-label="Reveal English"
            title="Reveal English"
          >
            <Icon name="eye" size={15} />
          </button>
        ) : (
          <>
            <span>{word.english}</span>
            {word.other && <small>{word.other}</small>}
          </>
        )}
      </div>
      <div className="word-line__actions">
        <button
          type="button"
          className="speak-button speak-button--visible"
          onClick={() => speakDutch(word.dutch)}
          title="Listen to this word"
          aria-label={`Listen to ${word.dutch}`}
        >
          <Icon name="volume" size={16} />
        </button>
        <button
          type="button"
          className="speak-button speak-button--visible"
          onClick={(event) => onAddNote(event.currentTarget)}
          title="Add a note for this word"
          aria-label={`Add a note for ${word.dutch}`}
        >
          <Icon name="note" size={16} />
        </button>
        {attachedNote && onDeleteNote && (
          <button
            type="button"
            className="flashcard-icon-button"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteNote(attachedNote.id);
            }}
            aria-label="Delete note"
            title="Delete note"
          >
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function Flashcards({
  words,
  stars,
  onToggleStar,
  filterKey,
}: {
  words: WordRow[];
  stars: Record<string, true>;
  onToggleStar: (key: string) => void;
  filterKey: string;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [orderMode, setOrderMode] = useState<"sequential" | "shuffle">("sequential");

  useEffect(() => {
    setIndex(0);
    setRevealed(false);
  }, [filterKey]);

  if (words.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="star" size={30} />
        <h3>No cards in this deck</h3>
        <p>Adjust the filters above or star some words to build a deck.</p>
      </div>
    );
  }

  const safeIndex = Math.min(index, words.length - 1);
  const word = words[safeIndex];

  function goPrevious() {
    setIndex((current) => (current - 1 + words.length) % words.length);
    setRevealed(false);
  }

  function goNext() {
    if (orderMode === "shuffle" && words.length > 1) {
      setIndex((current) => {
        let next = current;
        while (next === current) next = Math.floor(Math.random() * words.length);
        return next;
      });
    } else {
      setIndex((current) => (current + 1) % words.length);
    }
    setRevealed(false);
  }

  return (
    <div className="flashcard-wrap">
      <div className="flashcard" onClick={() => setRevealed((value) => !value)}>
        <div className="flashcard__top">
          <span className="flashcard__counter">
            {safeIndex + 1} / {words.length}
          </span>
        </div>

        <div className="flashcard__body">
          <p className="flashcard__dutch">{word.dutch}</p>
          {revealed ? (
            <div className="flashcard__answer" aria-live="polite">
              <p>{word.english}</p>
              {word.other && <small>{word.other}</small>}
              {word.note && <em>{word.note}</em>}
            </div>
          ) : (
            <button
              type="button"
              className="reveal-button flashcard__reveal"
              onClick={(event) => {
                event.stopPropagation();
                setRevealed(true);
              }}
              aria-label="Reveal English"
              title="Reveal English"
            >
              <Icon name="eye" size={16} />
            </button>
          )}
        </div>

        <div className="flashcard__footer">
          <div className="flashcard__footer-actions">
            <button
              type="button"
              className={
                stars[word.key]
                  ? "flashcard-icon-button is-starred"
                  : "flashcard-icon-button"
              }
              onClick={(event) => {
                event.stopPropagation();
                onToggleStar(word.key);
              }}
              aria-pressed={Boolean(stars[word.key])}
              aria-label={stars[word.key] ? "Remove star" : "Star this word"}
              title={stars[word.key] ? "Remove star" : "Star this word"}
            >
              <Icon name="star" size={17} />
            </button>
            <button
              type="button"
              className="flashcard-icon-button"
              onClick={(event) => {
                event.stopPropagation();
                speakDutch(word.dutch);
              }}
              aria-label="Listen to this word"
              title="Listen to this word"
            >
              <Icon name="volume" size={17} />
            </button>
          </div>

          <div className="flashcard-controls">
            <button
              type="button"
              className="flashcard-icon-button"
              onClick={(event) => {
                event.stopPropagation();
                goPrevious();
              }}
              aria-label="Previous card"
              title="Previous card"
            >
              <Icon name="previous" size={17} />
            </button>
            <button
              type="button"
              className={
                orderMode === "sequential"
                  ? "flashcard-icon-button is-active"
                  : "flashcard-icon-button"
              }
              onClick={(event) => {
                event.stopPropagation();
                setOrderMode("sequential");
              }}
              aria-pressed={orderMode === "sequential"}
              aria-label="Sequential mode"
              title="Sequential mode"
            >
              <Icon name="sequential" size={17} />
            </button>
            <button
              type="button"
              className={
                orderMode === "shuffle"
                  ? "flashcard-icon-button is-active"
                  : "flashcard-icon-button"
              }
              onClick={(event) => {
                event.stopPropagation();
                setOrderMode("shuffle");
              }}
              aria-pressed={orderMode === "shuffle"}
              aria-label="Shuffle mode"
              title="Shuffle mode"
            >
              <Icon name="shuffle" size={17} />
            </button>
            <button
              type="button"
              className="flashcard-icon-button"
              onClick={(event) => {
                event.stopPropagation();
                goNext();
              }}
              aria-label="Next card"
              title="Next card"
            >
              <Icon name="next" size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
