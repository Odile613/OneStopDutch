import { useEffect, useMemo, useState } from "react";
import type { ChapterData, GrammarSection } from "../types";
import { chapterName } from "../data";
import { speakDutch } from "../lib/speech";
import { Icon } from "./Icon";

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

interface GrammarBlock {
  chapterNumber: number;
  chapterTitle: string;
  section: GrammarSection;
}

/**
 * Grammar reference, grouped by chapter. Each section can be read on its own;
 * search covers titles, explanations and examples across the whole book. Books
 * that only ship a grammar appendix also get a "Reference grammar" scope.
 */
export default function GrammarView({
  chapters,
  reference,
  initialChapter,
  onChapterChange,
}: {
  chapters: ChapterData[];
  reference?: GrammarSection[];
  initialChapter: number;
  onChapterChange: (chapter: number) => void;
}) {
  const hasChapterGrammar = chapters.some((chapter) => chapter.grammar.length > 0);
  const hasReference = Boolean(reference && reference.length > 0);
  const defaultScope = hasChapterGrammar || !hasReference ? initialChapter : "reference";

  const [scope, setScope] = useState<number | "all" | "reference">(defaultScope);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setScope(hasChapterGrammar || !hasReference ? initialChapter : "reference");
  }, [initialChapter, hasChapterGrammar, hasReference]);

  const referenceBlocks = useMemo<GrammarBlock[]>(() => {
    const search = fold(query.trim());
    return (reference ?? [])
      .filter((section) => {
        if (!search) return true;
        return [section.title, ...section.paragraphs, ...(section.examples ?? [])].some(
          (value) => fold(value).includes(search),
        );
      })
      .map((section) => ({
        chapterNumber: -1,
        chapterTitle: "Reference",
        section,
      }));
  }, [reference, query]);

  const blocks = useMemo<GrammarBlock[]>(() => {
    if (scope === "reference") return referenceBlocks;
    const search = fold(query.trim());
    const chapterBlocks = chapters
      .filter((chapter) => scope === "all" || chapter.number === scope)
      .flatMap((chapter) =>
        chapter.grammar
          .filter((section) => {
            if (!search) return true;
            return [
              section.title,
              ...section.paragraphs,
              ...(section.examples ?? []),
            ].some((value) => fold(value).includes(search));
          })
          .map((section) => ({
            chapterNumber: chapter.number,
            chapterTitle: chapter.title,
            section,
          })),
      );
    return scope === "all" ? [...chapterBlocks, ...referenceBlocks] : chapterBlocks;
  }, [chapters, referenceBlocks, scope, query]);

  const chapterBlocks = useMemo(() => {
    const result: { chapterNumber: number; chapterTitle: string; sections: GrammarSection[] }[] =
      [];
    for (const block of blocks) {
      const last = result[result.length - 1];
      if (last && last.chapterNumber === block.chapterNumber) {
        last.sections.push(block.section);
      } else {
        result.push({
          chapterNumber: block.chapterNumber,
          chapterTitle: block.chapterTitle,
          sections: [block.section],
        });
      }
    }
    return result;
  }, [blocks]);

  const totalSections =
    chapters.reduce((total, chapter) => total + chapter.grammar.length, 0) +
    (reference?.length ?? 0);
  const hasAnyGrammar = totalSections > 0;
  const totalStrings =
    chapters.reduce(
      (total, chapter) =>
        total +
        chapter.grammar.reduce(
          (sum, section) =>
            sum + section.paragraphs.length + (section.examples?.length ?? 0),
          0,
        ),
      0,
    ) +
    (reference ?? []).reduce(
      (total, section) =>
        total + section.paragraphs.length + (section.examples?.length ?? 0),
      0,
    );
  const selectedChapter =
    typeof scope === "number"
      ? chapters.find((chapter) => chapter.number === scope)
      : undefined;

  return (
    <div className="page">
      <header className="page-hero">
        <div className="page-hero__copy">
          <p className="eyebrow">
            <Icon name="grammar" size={14} />
            Grammar
          </p>
          <h1>
            {!hasAnyGrammar
              ? "Grammar"
              : hasChapterGrammar
                ? "Grammar, chapter by chapter"
                : "Grammar reference"}
          </h1>
          <p className="page-hero__intro">
            {!hasAnyGrammar
              ? "The grammar reference for this book has not been added yet. The textbook and workbook audio are still available."
              : hasChapterGrammar
                ? "The complete grammar reference with every explanation and example from the course. Search for a rule, or read the overview for one chapter."
                : "The course's grammar appendix, from sounds and spelling to word order, verbs and prepositions. Search a rule or browse the reference."}
          </p>
        </div>
        <dl className="stat-row">
          <div className="stat">
            <dt>Topics</dt>
            <dd>{totalSections}</dd>
          </div>
          <div className="stat">
            <dt>Examples</dt>
            <dd>{totalStrings}</dd>
          </div>
          <div className="stat">
            <dt>Chapters</dt>
            <dd>{chapters.length}</dd>
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
            placeholder="Search a rule or example…"
            aria-label="Search grammar"
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
              } else if (event.target.value === "reference") {
                setScope("reference");
              } else {
                const next = Number(event.target.value);
                setScope(next);
                onChapterChange(next);
              }
            }}
          >
            <option value="all">All chapters</option>
            {reference && reference.length > 0 && (
              <option value="reference">Reference grammar</option>
            )}
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
      </div>

      <div className="results-bar">
        <span>
          <strong>{blocks.length}</strong> grammar topic
          {blocks.length === 1 ? "" : "s"}
          {selectedChapter && scope !== "all"
            ? ` · ${chapterName(selectedChapter)}`
            : ""}
        </span>
        {query && (
          <button type="button" className="link-button" onClick={() => setQuery("")}>
            Clear search
          </button>
        )}
      </div>

      {!hasAnyGrammar ? (
        <div className="empty-state">
          <Icon name="grammar" size={30} />
          <h3>No grammar for this book yet</h3>
          <p>
            The grammar reference for this book has not been uploaded. You can still
            use the textbook and workbook audio.
          </p>
        </div>
      ) : chapterBlocks.length === 0 ? (
        <div className="empty-state">
          <Icon name="grammar" size={30} />
          <h3>No grammar found</h3>
          <p>Try another search term or choose a different chapter.</p>
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
        <div className="grammar-list">
          {chapterBlocks.map((chapterBlock) => (
            <section key={chapterBlock.chapterNumber} className="grammar-chapter">
              {scope === "all" && (
                <div className="grammar-chapter__head">
                  <span className="word-group__chapter">
                    {chapterBlock.chapterNumber === 0
                      ? "Introduction"
                      : chapterBlock.chapterNumber === -1
                        ? "Reference"
                        : `Chapter ${chapterBlock.chapterNumber}`}
                  </span>
                  {chapterBlock.chapterTitle && <h2>{chapterBlock.chapterTitle}</h2>}
                </div>
              )}
              <div className="grammar-grid">
                {chapterBlock.sections.map((section, index) => (
                  <GrammarCard
                    key={`${section.id}-${index}`}
                    section={section}
                    index={index}
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

function GrammarCard({
  section,
  index,
}: {
  section: GrammarSection;
  index: number;
}) {
  return (
    <article className="grammar-card">
      <header className="grammar-card__head">
        <span className="grammar-card__number">{String(index + 1).padStart(2, "0")}</span>
        <h3>{section.title}</h3>
      </header>

      {section.paragraphs.length > 0 && (
        <div className="grammar-card__prose">
          {section.paragraphs.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex}>{paragraph}</p>
          ))}
        </div>
      )}

      {section.examples && section.examples.length > 0 && (
        <ul className="grammar-examples">
          {section.examples.map((example, exampleIndex) => (
            <li key={exampleIndex}>
              <span>{example}</span>
              <button
                type="button"
                className="speak-button"
                onClick={() => speakDutch(example)}
                title="Listen to this example"
                aria-label={`Listen to: ${example}`}
              >
                <Icon name="volume" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
