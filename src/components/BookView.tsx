import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type {
  AudioTrack,
  BookId,
  ChapterData,
  TranscriptTrack,
  VocabEntry,
} from "../types";
import {
  audioUrl,
  tracksFor,
  transcriptsFor,
} from "../data";
import { CREATE_NOTE_EVENT, EXPAND_ALL_TRACKS_EVENT } from "../lib/notes";
import { notesForChapter, type SavedNote } from "../lib/notes";
import { useLocalStorage } from "../lib/useLocalStorage";
import AudioPlayer from "./AudioPlayer";
import NotesDrawer from "./NotesDrawer";
import { Icon } from "./Icon";

interface TrackItem {
  number: number;
  track?: AudioTrack;
  transcript?: TranscriptTrack;
}

type VocabIndex = Map<string, VocabEntry[]>;

interface ActiveHint {
  word: string;
  entries: VocabEntry[];
  rect: DOMRect;
}

const WORD_RE = /['’]?[\p{L}][\p{L}\p{M}'’]*/gu;

function hintKey(value: string): string {
  return value.toLowerCase().replace(/^['’]+|['’]+$/g, "");
}

/**
 * Textbook / workbook reader. The two sections share this view: each shows
 * the tracks that belong to the selected chapter and book, keeping the
 * printed book order (audio track → transcript → exercises).
 */
export default function BookView({
  courseId,
  chapter,
  book,
  tracks,
  notes,
  onUpdateNote,
  onDeleteNote,
}: {
  courseId: string;
  chapter: ChapterData;
  book: BookId;
  tracks: AudioTrack[];
  notes: SavedNote[];
  onUpdateNote: (id: string, note: string) => void;
  onDeleteNote: (id: string) => void;
}) {
  const items = useMemo<TrackItem[]>(() => {
    const chapterTracks = tracksFor(tracks, chapter, book);
    const transcripts = transcriptsFor(chapter, book);
    const numbers = new Set<number>([
      ...chapterTracks.map((track) => track.track),
      ...transcripts.map((transcript) => transcript.track),
    ]);
    return [...numbers]
      .sort((a, b) => a - b)
      .map((number) => ({
        number,
        track: chapterTracks.find((track) => track.track === number),
        transcript: transcripts.find((transcript) => transcript.track === number),
      }));
  }, [chapter, book, tracks]);

  const vocabIndex = useMemo<VocabIndex>(() => {
    const index = new Map<string, VocabEntry[]>();
    for (const group of chapter.vocab) {
      for (const entry of group.entries) {
        for (const word of entry.dutch.match(WORD_RE) ?? []) {
          const key = hintKey(word);
          if (!key) continue;
          const matches = index.get(key);
          if (matches) {
            if (!matches.includes(entry)) matches.push(entry);
          } else {
            index.set(key, [entry]);
          }
        }
      }
    }
    return index;
  }, [chapter]);

  const [wordHints, setWordHints] = useLocalStorage(
    "onestopdutch-word-hints",
    true,
  );
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(items.length > 0 ? [items[0].number] : []),
  );
  const allOpen = items.length > 0 && open.size === items.length;
  const [notesOpen, setNotesOpen] = useState(false);
  const chapterNotes = notesForChapter(notes, courseId, chapter.number);

  useEffect(() => {
    const expand = () => setOpen(new Set(items.map((item) => item.number)));
    window.addEventListener(EXPAND_ALL_TRACKS_EVENT, expand);
    return () => window.removeEventListener(EXPAND_ALL_TRACKS_EVENT, expand);
  }, [items]);

  function toggle(number: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  return (
    <div className="page book-page">
      {chapter.notice && (
        <div className="notice notice--amber">
          {chapter.notice}
        </div>
      )}

      {(items.length > 0 || vocabIndex.size > 0 || chapterNotes.length > 0) && (
        <div className="section-heading section-heading--toolbar">
          {items.length > 0 && vocabIndex.size > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setWordHints((current) => !current)}
              aria-pressed={wordHints}
              aria-label="Toggle word hints"
              title={
                wordHints
                  ? "Turn off word hints"
                  : "Underline words from the chapter wordlist and show their meaning"
              }
            >
              <Icon name="underlineU" size={16} />
            </button>
          )}
          {items.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() =>
                setOpen(allOpen ? new Set() : new Set(items.map((item) => item.number)))
              }
              aria-label={allOpen ? "Collapse all tracks" : "Expand all tracks"}
              title={allOpen ? "Collapse all tracks" : "Expand all tracks"}
            >
              <Icon name="triangleDown" size={16} />
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setNotesOpen(true)}
            aria-label="Show chapter notes"
            title="Show all notes in this chapter"
          >
            <Icon name="note" size={16} />
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <Icon name="headphones" size={30} />
          <h3>No audio or transcript for this chapter yet</h3>
          <p>
            The source material for this part of the course has not been added.
            Try another chapter or the wordlist and grammar sections.
          </p>
        </div>
      ) : (
        <div className="track-list">
          {items.map((item) => (
            <TrackCard
              key={item.number}
              item={item}
              open={open.has(item.number)}
              onToggle={() => toggle(item.number)}
              vocabIndex={vocabIndex}
              wordHints={wordHints}
            />
          ))}
        </div>
      )}

      {notesOpen && (
        <NotesDrawer
          chapter={chapter.number}
          notes={chapterNotes}
          onClose={() => setNotesOpen(false)}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
        />
      )}
    </div>
  );
}

function TrackCard({
  item,
  open,
  onToggle,
  vocabIndex,
  wordHints,
}: {
  item: TrackItem;
  open: boolean;
  onToggle: () => void;
  vocabIndex: VocabIndex;
  wordHints: boolean;
}) {
  const title = item.transcript?.title;
  const lines = item.transcript?.lines ?? [];
  const lineCount = lines.length;
  const hasTranscript = lineCount > 0;
  const tones = speakerToneMap(lines);

  return (
    <article className={open ? "track-card track-card--open" : "track-card"}>
      <div className="track-card__top">
        <button
          type="button"
          className="track-card__toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? `Collapse track ${item.number}` : `Expand track ${item.number}`}
        >
          <span className="track-card__track">Track {item.number}</span>
          <Icon name="chevron" size={18} className="track-card__chevron" />
        </button>
        {item.track ? (
          <AudioPlayer src={audioUrl(item.track)} label={title ?? `Track ${item.number}`} />
        ) : (
          <span className="track-card__no-audio">Audio not in source</span>
        )}
      </div>

      {open && (
        <div className="track-card__body">
          {hasTranscript ? (
            <div className="transcript">
              {lines.map((line, index) => {
                const previous = lines[index - 1];
                const previousSpeaker = previous ? speakerOf(previous) : null;
                const currentSpeaker = speakerOf(line);
                const speaker = currentSpeaker ?? previousSpeaker;
                return (
                  <TranscriptLine
                    key={index}
                    line={line}
                    previousSpeaker={previousSpeaker}
                    tone={speaker ? (tones.get(speaker) ?? 0) : 0}
                    vocabIndex={vocabIndex}
                    wordHints={wordHints}
                  />
                );
              })}
            </div>
          ) : (
            <p className="muted-copy">
              The audio for this track is available, but the source material does not
              include a transcript.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

const SPEAKER_RE = /^([A-ZÀ-Þ][A-Za-zÀ-ÿ0-9 .'’()\/-]{0,40}?):\s+(.*)$/;
const BULLET_RE = /^[■●]\s*/;
const NUMBER_RE = /^(\d+)\.\s+/;

const SPEAKER_TONES = [
  "#1a1a1a", // black
  "#1f4e79", // dark blue
  "#6b4f33", // brown
];

function speakerOf(line: string): string | null {
  const match = SPEAKER_RE.exec(line.replace(BULLET_RE, ""));
  return match ? match[1] : null;
}

/** Assigns colours by first appearance within one transcript. */
function speakerToneMap(lines: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    const speaker = speakerOf(line);
    if (speaker && !map.has(speaker)) {
      map.set(speaker, map.size % SPEAKER_TONES.length);
    }
  }
  return map;
}

function TranscriptLine({
  line,
  previousSpeaker,
  tone,
  vocabIndex,
  wordHints,
}: {
  line: string;
  previousSpeaker: string | null;
  tone: number;
  vocabIndex: VocabIndex;
  wordHints: boolean;
}) {
  const [hint, setHint] = useState<ActiveHint | null>(null);

  useEffect(() => {
    if (!wordHints) setHint(null);
  }, [wordHints]);

  if (!line.trim()) return <hr className="transcript__divider" />;

  const withoutBullet = line.replace(BULLET_RE, "");
  const speaker = SPEAKER_RE.exec(withoutBullet);
  const number = NUMBER_RE.exec(withoutBullet);
  const body = (
    speaker ? speaker[2] : withoutBullet.replace(NUMBER_RE, "")
  ).trim();

  return (
    <>
      <p className="transcript__line">
        <span className="transcript__marker">
          {speaker ? (
            <span
              className={`speaker-badge speaker-badge--tone-${tone}`}
              title={speaker[1]}
            >
              {speaker[1]}
            </span>
          ) : number ? (
            <span className="line-number">{number[1]}</span>
          ) : BULLET_RE.test(line) ? (
            <span className="line-dot" aria-hidden="true" />
          ) : previousSpeaker ? (
            <span className={`speaker-badge speaker-badge--ghost speaker-badge--tone-${tone}`} aria-hidden="true">
              {previousSpeaker}
            </span>
          ) : null}
        </span>
        <span className="transcript__text">
          {wordHints ? (
            <HintedText
              text={body}
              vocabIndex={vocabIndex}
              onSelect={(word, entries, element) =>
                setHint({ word, entries, rect: element.getBoundingClientRect() })
              }
              onNote={(word, element) => {
                setHint(null);
                window.dispatchEvent(
                  new CustomEvent(CREATE_NOTE_EVENT, {
                    detail: { text: word, rect: element.getBoundingClientRect() },
                  }),
                );
              }}
            />
          ) : (
            body
          )}
        </span>
      </p>
      {hint && <VocabPopover hint={hint} onClose={() => setHint(null)} />}
    </>
  );
}

function HintedText({
  text,
  vocabIndex,
  onSelect,
  onNote,
}: {
  text: string;
  vocabIndex: VocabIndex;
  onSelect: (word: string, entries: VocabEntry[], element: HTMLElement) => void;
  onNote: (word: string, element: HTMLElement) => void;
}) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(WORD_RE)) {
    const word = match[0];
    const entries = vocabIndex.get(hintKey(word));
    if (!entries) continue;

    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(
      <button
        key={`${index}-${word}`}
        type="button"
        className="vocab-word"
        onClick={(event) => onSelect(word, entries, event.currentTarget)}
        onMouseDown={(event) => {
          if (event.detail !== 2) return;
          event.preventDefault();
          event.stopPropagation();
          onNote(word, event.currentTarget);
        }}
        title="Show meaning — double-click to add a note"
      >
        {word}
      </button>,
    );
    lastIndex = index + word.length;
  }

  if (lastIndex === 0) return <>{text}</>;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

function VocabPopover({
  hint,
  onClose,
}: {
  hint: ActiveHint;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => ({
    left: Math.max(12, Math.min(hint.rect.left, window.innerWidth - 12)),
    top: hint.rect.bottom + 8,
  }));

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const margin = 12;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const centered = hint.rect.left + hint.rect.width / 2 - width / 2;
    const left = Math.max(margin, Math.min(centered, window.innerWidth - width - margin));
    let top = hint.rect.bottom + 8;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, hint.rect.top - height - 8);
    }
    setPosition({ left, top });
  }, [hint]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="vocab-popover"
      role="dialog"
      aria-label={`Meaning of ${hint.word}`}
      style={{ left: position.left, top: position.top }}
    >
      <p className="vocab-popover__word">{hint.word}</p>
      {hint.entries.map((entry, index) => (
        <div className="vocab-popover__entry" key={`${entry.dutch}-${index}`}>
          <strong>{entry.dutch}</strong>
          <span>{entry.english}</span>
          {entry.other && <em>{entry.other}</em>}
          {entry.note && <small>{entry.note}</small>}
        </div>
      ))}
    </div>,
    document.body,
  );
}
