import { useEffect, useMemo, useState } from "react";
import type { ChapterData } from "../types";
import {
  allWords,
  chapterName,
  groupLabel,
  type WordRow,
} from "../data";
import { useLocalStorage } from "../lib/useLocalStorage";
import { speakDutch } from "../lib/speech";
import { Icon } from "./Icon";

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
  initialChapter,
  onChapterChange,
}: {
  courseId: string;
  chapters: ChapterData[];
  initialChapter: number;
  onChapterChange: (chapter: number) => void;
}) {
  const everyWord = useMemo(() => allWords(chapters), [chapters]);
  const [scope, setScope] = useState<number | "all">(initialChapter);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [hideEnglish, setHideEnglish] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [mode, setMode] = useState<"list" | "cards">("list");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [stars, setStars] = useLocalStorage<Record<string, true>>(
    `onestopdutch-stars-${courseId}`,
    {},
  );

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
      if (group !== "all" && word.group !== group) return false;
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

  const starredTotal = Object.keys(stars).length;
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

  const activeChapter = chapters.find(
    (chapter) => chapter.number === (scope === "all" ? initialChapter : scope),
  );

  return (
    <div className="page">
      <header className="page-hero">
        <div className="page-hero__copy">
          <p className="eyebrow">
            <Icon name="list" size={14} />
            Wordlist
          </p>
          <h1>Words &amp; phrases</h1>
          <p className="page-hero__intro">
            {hasWords
              ? "Every word from the course wordlist, grouped by chapter and word type. Search across all chapters, hide the English, or practise with flashcards."
              : "The wordlist for this book has not been added yet. The textbook and workbook audio are still available."}
          </p>
        </div>
        <dl className="stat-row">
          <div className="stat">
            <dt>Words</dt>
            <dd>{totalWords}</dd>
          </div>
          <div className="stat">
            <dt>Chapters</dt>
            <dd>{chapters.length}</dd>
          </div>
          <div className="stat">
            <dt>Starred</dt>
            <dd>{starredTotal}</dd>
          </div>
        </dl>
      </header>

      <div className="toolbar">
        <label className="search-field">
          <Icon name="search" size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Dutch or English…"
            aria-label="Search the wordlist"
          />
          {query && (
            <button
              type="button"
              className="search-field__clear"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </label>

        <label className="select-field">
          <span>Chapter</span>
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
        </label>

        <label className="select-field">
          <span>Word type</span>
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="all">All types</option>
            {groups.map((value) => (
              <option key={value} value={value}>
                {groupLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <div className="segmented" role="group" aria-label="Wordlist view">
          <button
            type="button"
            className={mode === "list" ? "segmented__item is-active" : "segmented__item"}
            onClick={() => setMode("list")}
          >
            List
          </button>
          <button
            type="button"
            className={mode === "cards" ? "segmented__item is-active" : "segmented__item"}
            onClick={() => setMode("cards")}
          >
            Flashcards
          </button>
        </div>

        <button
          type="button"
          className={
            hideEnglish
              ? "toggle-button is-active"
              : "toggle-button"
          }
          onClick={() => setHideEnglish((value) => !value)}
          aria-pressed={hideEnglish}
          title="Hide the English translations"
        >
          <Icon name={hideEnglish ? "eyeOff" : "eye"} size={16} />
          {hideEnglish ? "English hidden" : "Hide English"}
        </button>

        <button
          type="button"
          className={starredOnly ? "toggle-button is-active" : "toggle-button"}
          onClick={() => setStarredOnly((value) => !value)}
          aria-pressed={starredOnly}
          title="Show only starred words"
        >
          <Icon name="star" size={16} />
          Starred
        </button>
      </div>

      <div className="results-bar">
        <span>
          <strong>{words.length}</strong> of {totalWords} words
          {activeChapter && scope !== "all" ? ` · ${chapterName(activeChapter)}` : ""}
        </span>
        {(query || group !== "all" || starredOnly) && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setQuery("");
              setGroup("all");
              setStarredOnly(false);
            }}
          >
            Clear filters
          </button>
        )}
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
      ) : mode === "cards" ? (
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
          {blocks.map((block) => (
            <section
              key={`${block.chapterNumber}-${block.group}`}
              className="word-group"
            >
              <div className="word-group__head">
                <div>
                  {scope === "all" && (
                    <span className="word-group__chapter">
                      {block.chapterNumber === 0
                        ? "Introduction"
                        : `Chapter ${block.chapterNumber}`}
                      {block.chapterTitle ? ` · ${block.chapterTitle}` : ""}
                    </span>
                  )}
                  <h2>{groupLabel(block.group)}</h2>
                </div>
                <span className="pill">
                  {block.words.length} word{block.words.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="word-table">
                <div className="word-table__head" aria-hidden="true">
                  <span />
                  <span>Dutch</span>
                  <span>English</span>
                  <span>Listen</span>
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
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
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
}: {
  word: WordRow;
  starred: boolean;
  onToggleStar: () => void;
  hideEnglish: boolean;
  revealed: boolean;
  onReveal: () => void;
}) {
  const englishHidden = hideEnglish && !revealed;

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
        <span>{word.dutch}</span>
        {word.note && <small>{word.note}</small>}
      </div>
      <div className="word-line__english">
        {englishHidden ? (
          <button type="button" className="reveal-button" onClick={onReveal}>
            <Icon name="eye" size={14} />
            Reveal
          </button>
        ) : (
          <>
            <span>{word.english}</span>
            {word.other && <small>{word.other}</small>}
          </>
        )}
      </div>
      <button
        type="button"
        className="speak-button speak-button--visible"
        onClick={() => speakDutch(word.dutch)}
        title="Listen to this word"
        aria-label={`Listen to ${word.dutch}`}
      >
        <Icon name="volume" size={16} />
      </button>
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

  function go(step: number) {
    setIndex((current) => (current + step + words.length) % words.length);
    setRevealed(false);
  }

  function shuffle() {
    if (words.length < 2) return;
    let next = safeIndex;
    while (next === safeIndex) next = Math.floor(Math.random() * words.length);
    setIndex(next);
    setRevealed(false);
  }

  return (
    <div className="flashcard-wrap">
      <div className="flashcard" onClick={() => setRevealed((value) => !value)}>
        <div className="flashcard__top">
          <span className="pill">
            {word.chapterNumber === 0 ? "Intro" : `Chapter ${word.chapterNumber}`} ·{" "}
            {groupLabel(word.group)}
          </span>
          <button
            type="button"
            className={stars[word.key] ? "star-button is-starred" : "star-button"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleStar(word.key);
            }}
            aria-pressed={Boolean(stars[word.key])}
            aria-label={stars[word.key] ? "Remove star" : "Star this word"}
          >
            <Icon name="star" size={18} />
          </button>
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
              className="flashcard__reveal"
              onClick={(event) => {
                event.stopPropagation();
                setRevealed(true);
              }}
            >
              Reveal English
            </button>
          )}
        </div>

        <div className="flashcard__footer">
          <span>
            {safeIndex + 1} / {words.length}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={(event) => {
              event.stopPropagation();
              speakDutch(word.dutch);
            }}
          >
            <Icon name="volume" size={15} />
            Listen
          </button>
        </div>
      </div>

      <div className="flashcard-controls">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => go(-1)}
          aria-label="Previous card"
        >
          <Icon name="previous" size={17} />
          Previous
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={shuffle}
          aria-label="Shuffle deck"
        >
          <Icon name="shuffle" size={17} />
          Shuffle
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => go(1)}
          aria-label="Next card"
        >
          Next
          <Icon name="next" size={17} />
        </button>
      </div>
    </div>
  );
}
