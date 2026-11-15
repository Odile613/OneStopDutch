import { useMemo, useState } from "react";
import type { AudioTrack, BookId, ChapterData, TranscriptTrack } from "../types";
import {
  audioUrl,
  chapterName,
  realExercises,
  tracksFor,
  transcriptLineCount,
  transcriptsFor,
  vocabCount,
} from "../data";
import { speakDutch } from "../lib/speech";
import AudioPlayer from "./AudioPlayer";
import ExerciseCard from "./ExerciseCard";
import { Icon } from "./Icon";

interface TrackItem {
  number: number;
  track?: AudioTrack;
  transcript?: TranscriptTrack;
}

/**
 * Textbook / workbook reader. The two sections share this view: each shows
 * the tracks that belong to the selected chapter and book, keeping the
 * printed book order (audio track → transcript → exercises).
 */
export default function BookView({
  chapter,
  book,
  tracks,
}: {
  chapter: ChapterData;
  book: BookId;
  tracks: AudioTrack[];
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

  const exercises = realExercises(chapter, book);
  const lines = transcriptLineCount(chapter, book);
  const isTextbook = book === "tb";
  const sectionName = isTextbook ? "Textbook" : "Workbook";
  const hasTranscripts = lines > 0;
  const description = isTextbook
    ? hasTranscripts
      ? "Read and listen to the chapter's texts and dialogues. Transcripts are shown where the source material provides them."
      : "Listen to the chapter's audio. The source material for this book does not include transcripts."
    : hasTranscripts
      ? "Work through the workbook listening exercises with the original audio and transcripts, then test yourself below."
      : "Work through the workbook listening exercises with the original audio. The source material for this book does not include workbook transcripts.";
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(items.length > 0 ? [items[0].number] : []),
  );
  const allOpen = items.length > 0 && open.size === items.length;

  function toggle(number: number) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div className="page-hero__copy">
          <p className="eyebrow">
            <Icon name={isTextbook ? "book" : "workbook"} size={14} />
            {sectionName}
          </p>
          <h1>{chapterName(chapter)}</h1>
          <p className="page-hero__intro">{description}</p>
        </div>
        <dl className="stat-row">
          <div className="stat">
            <dt>Tracks</dt>
            <dd>{items.length}</dd>
          </div>
          <div className="stat">
            <dt>Lines</dt>
            <dd>{lines}</dd>
          </div>
          <div className="stat">
            <dt>Wordlist</dt>
            <dd>{vocabCount(chapter)}</dd>
          </div>
        </dl>
      </header>

      {chapter.notice && (
        <div className="notice notice--amber">
          {chapter.notice}
        </div>
      )}

      <div className="section-heading">
        <div>
          <h2>Audio &amp; transcript</h2>
          <p>
            {items.length} track{items.length === 1 ? "" : "s"} · speeds from 0.5× to
            2×
          </p>
        </div>
        {items.length > 1 && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() =>
              setOpen(allOpen ? new Set() : new Set(items.map((item) => item.number)))
            }
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

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
            />
          ))}
        </div>
      )}

      {!isTextbook && exercises.length === 0 && (
        <p className="content-note">
          No interactive workbook exercises are available for this chapter yet. The
          audio and transcript above follow the printed workbook order.
        </p>
      )}

      {exercises.length > 0 && (
        <section className="exercise-section">
          <div className="section-heading">
            <div>
              <h2>Practice exercises</h2>
              <p>
                {exercises.length} digitised exercise
                {exercises.length === 1 ? "" : "s"} from the {sectionName.toLowerCase()}{" "}
                answer material
              </p>
            </div>
          </div>
          <div className="exercise-grid">
            {exercises.map((exercise, index) => (
              <ExerciseCard key={exercise.id} exercise={exercise} index={index} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TrackCard({
  item,
  open,
  onToggle,
}: {
  item: TrackItem;
  open: boolean;
  onToggle: () => void;
}) {
  const title = item.transcript?.title;
  const lineCount = item.transcript?.lines.length ?? 0;
  const hasTranscript = lineCount > 0;

  return (
    <article className={open ? "track-card track-card--open" : "track-card"}>
      <div className="track-card__top">
        <button
          type="button"
          className="track-card__toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="track-badge">Track {item.number}</span>
          <span className="track-card__titles">
            <strong>{title ?? "Listening exercise"}</strong>
            <small>
              {lineCount > 0
                ? `${lineCount} transcript line${lineCount === 1 ? "" : "s"}`
                : "No transcript"}
            </small>
          </span>
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
              {item.transcript?.lines.map((line, index) => (
                <TranscriptLine key={index} line={line} />
              ))}
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

function TranscriptLine({ line }: { line: string }) {
  if (!line.trim()) return <hr className="transcript__divider" />;

  const withoutBullet = line.replace(BULLET_RE, "");
  const speaker = SPEAKER_RE.exec(withoutBullet);
  const number = NUMBER_RE.exec(withoutBullet);
  const body = speaker ? speaker[2] : withoutBullet.replace(NUMBER_RE, "");

  return (
    <p className="transcript__line">
      {speaker ? (
        <span className="speaker-badge">{speaker[1]}</span>
      ) : number ? (
        <span className="line-number">{number[1]}</span>
      ) : BULLET_RE.test(line) ? (
        <span className="line-dot" aria-hidden="true" />
      ) : null}
      <span className="transcript__text">{body}</span>
      <button
        type="button"
        className="speak-button"
        onClick={() => speakDutch(body)}
        title="Listen to this line"
        aria-label={`Listen to: ${body}`}
      >
        <Icon name="volume" size={15} />
      </button>
    </p>
  );
}
