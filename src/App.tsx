import { useEffect, useMemo, useRef, useState } from "react";
import type { CourseId, SectionId } from "./types";
import {
  chapterOptionLabel,
  courseById,
  courses,
  grammarStringCount,
  referenceStringCount,
  shortChapterName,
  tracksFor,
  vocabCount,
} from "./data";
import BookView from "./components/BookView";
import GrammarView from "./components/GrammarView";
import WordlistView from "./components/WordlistView";
import { Icon, type IconName } from "./components/Icon";

interface Route {
  courseId: CourseId;
  section: SectionId;
  chapter: number;
}

const SECTIONS: {
  id: SectionId;
  label: string;
  shortLabel: string;
  icon: IconName;
  hint: string;
}[] = [
  {
    id: "textbook",
    label: "Textbook",
    shortLabel: "Textbook",
    icon: "book",
    hint: "Chapter texts, dialogues and audio",
  },
  {
    id: "workbook",
    label: "Workbook",
    shortLabel: "Workbook",
    icon: "workbook",
    hint: "Listening exercises and audio",
  },
  {
    id: "wordlist",
    label: "Wordlist",
    shortLabel: "Words",
    icon: "list",
    hint: "Vocabulary, search and flashcards",
  },
  {
    id: "grammar",
    label: "Grammar",
    shortLabel: "Grammar",
    icon: "grammar",
    hint: "Rules, explanations and examples",
  },
];

function isSection(value: string): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

function isCourseId(value: string): value is CourseId {
  return courses.some((course) => course.id === value);
}

/** Supports #/contact-2/textbook/3 and the legacy #/textbook/3. */
function parseHash(): Route | null {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw) return null;
  const parts = raw.split("/");

  let course = courses[0];
  let sectionPart: string | undefined;
  let chapterPart: string | undefined;

  if (parts.length >= 3 && isCourseId(parts[0])) {
    course = courseById(parts[0]) ?? course;
    sectionPart = parts[1];
    chapterPart = parts[2];
  } else {
    sectionPart = parts[0];
    chapterPart = parts[1];
  }

  if (!sectionPart || !isSection(sectionPart)) return null;
  const chapter = Number(chapterPart);
  return {
    courseId: course.id,
    section: sectionPart,
    chapter: course.chapters.some((item) => item.number === chapter)
      ? chapter
      : course.chapters[0].number,
  };
}

function storedCourse(): CourseId {
  try {
    const value = localStorage.getItem("onestopdutch-course");
    return value && isCourseId(value) ? value : courses[0].id;
  } catch {
    return courses[0].id;
  }
}

function storedChapter(courseId: CourseId): number | null {
  try {
    const raw =
      localStorage.getItem(`onestopdutch-chapter:${courseId}`) ??
      localStorage.getItem("onestopdutch-chapter");
    if (raw === null || raw.trim() === "") return null;
    const value = Number(raw);
    const course = courseById(courseId);
    if (!course || !Number.isFinite(value)) return null;
    return course.chapters.some((chapter) => chapter.number === value) ? value : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => {
    const fromHash = parseHash();
    if (fromHash) return fromHash;
    const courseId = storedCourse();
    const course = courseById(courseId) ?? courses[0];
    return {
      courseId,
      section: "textbook",
      chapter: storedChapter(courseId) ?? course.chapters[0].number,
    };
  });
  const activeChapterRef = useRef<HTMLButtonElement | null>(null);

  const course = courseById(route.courseId) ?? courses[0];
  const chapters = course.chapters;

  const totalWords = useMemo(
    () => chapters.reduce((total, chapter) => total + vocabCount(chapter), 0),
    [chapters],
  );
  const totalGrammar = useMemo(
    () =>
      chapters.reduce((total, chapter) => total + chapter.grammar.length, 0) +
      (course.referenceGrammar?.length ?? 0),
    [chapters, course],
  );
  const totalGrammarStrings = useMemo(
    () =>
      chapters.reduce((total, chapter) => total + grammarStringCount(chapter), 0) +
      referenceStringCount(course),
    [chapters, course],
  );

  useEffect(() => {
    const handleHash = () => {
      const next = parseHash();
      if (next) setRoute(next);
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    activeChapterRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [route.chapter, route.courseId]);

  useEffect(() => {
    const nextHash = `#/${route.courseId}/${route.section}/${route.chapter}`;
    if (window.location.hash !== nextHash) {
      // Assigning the hash creates a history entry, so browser back/forward
      // moves between sections and chapters just like the in-app buttons.
      window.location.hash = nextHash;
    }
    try {
      localStorage.setItem("onestopdutch-course", route.courseId);
      localStorage.setItem(
        `onestopdutch-chapter:${route.courseId}`,
        String(route.chapter),
      );
    } catch {
      // Storage is optional; the URL hash still keeps the current chapter.
    }
    window.scrollTo({ top: 0 });
  }, [route]);

  const chapter = chapters.find((item) => item.number === route.chapter) ?? chapters[0];

  function setSection(section: SectionId) {
    setRoute((current) => ({ ...current, section }));
  }

  function setChapter(number: number) {
    setRoute((current) => ({ ...current, chapter: number }));
  }

  function setCourse(courseId: CourseId) {
    const next = courseById(courseId);
    if (!next) return;
    const saved = storedChapter(courseId);
    setRoute((current) => ({
      ...current,
      courseId,
      chapter:
        saved ?? next.chapters.find((item) => item.number === current.chapter)?.number
          ?? next.chapters[0].number,
    }));
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark">NL</span>
          <span className="brand__name">
            OneStop<span>Dutch</span>
          </span>
        </div>

        <div className="sidebar__course">
          <label className="course-switcher">
            <span className="visually-hidden">Choose a book</span>
            <select value={course.id} onChange={(event) => setCourse(event.target.value as CourseId)}>
              {courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <Icon name="chevron" size={15} className="course-switcher__chevron" />
          </label>
          <span>{course.subtitle}</span>
        </div>

        <nav className="chapter-nav" aria-label="Chapters">
          <p className="chapter-nav__label">Chapters</p>
          <ol className="chapter-list">
            {chapters.map((item) => {
              const tracks =
                tracksFor(course.audioTracks, item, "tb").length +
                tracksFor(course.audioTracks, item, "wb").length;
              return (
                <li key={item.number}>
                  <button
                    type="button"
                    ref={item.number === route.chapter ? activeChapterRef : undefined}
                    className={
                      item.number === route.chapter
                        ? "chapter-item is-active"
                        : "chapter-item"
                    }
                    onClick={() => setChapter(item.number)}
                    aria-current={item.number === route.chapter ? "page" : undefined}
                  >
                    <span className="chapter-item__number">
                      {item.number === 0 ? "0" : item.number}
                    </span>
                    <span className="chapter-item__text">
                      <strong>{shortChapterName(item)}</strong>
                      <small>
                        {vocabCount(item)} words · {tracks} track
                        {tracks === 1 ? "" : "s"}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="sidebar__footer">
          <div>
            <strong>{course.audioTracks.length}</strong>
            <span>audio tracks</span>
          </div>
          <div>
            <strong>{totalWords}</strong>
            <span>words</span>
          </div>
          <div>
            <strong>{totalGrammar}</strong>
            <span>grammar topics</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__brand">
            <span className="brand__mark">NL</span>
            <span>OneStopDutch</span>
          </div>

          <nav className="section-nav" aria-label="Sections">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={
                  route.section === section.id
                    ? "section-nav__item is-active"
                    : "section-nav__item"
                }
                onClick={() => setSection(section.id)}
                title={section.hint}
                aria-current={route.section === section.id ? "page" : undefined}
              >
                <Icon name={section.icon} size={17} />
                <span className="section-nav__label">{section.label}</span>
                <span className="section-nav__short">{section.shortLabel}</span>
              </button>
            ))}
          </nav>

          <label className="chapter-jump">
            <span className="visually-hidden">Jump to chapter</span>
            <select value={route.chapter} onChange={(event) => setChapter(Number(event.target.value))}>
              {chapters.map((item) => (
                <option key={item.number} value={item.number}>
                  {chapterOptionLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </header>

        <main className="content">
          {route.section === "textbook" && (
            <BookView
              key={`${course.id}-tb-${chapter.number}`}
              chapter={chapter}
              book="tb"
              tracks={course.audioTracks}
            />
          )}
          {route.section === "workbook" && (
            <BookView
              key={`${course.id}-wb-${chapter.number}`}
              chapter={chapter}
              book="wb"
              tracks={course.audioTracks}
            />
          )}
          {route.section === "wordlist" && (
            <WordlistView
              key={`${course.id}-words`}
              courseId={course.id}
              chapters={chapters}
              initialChapter={chapter.number}
              onChapterChange={setChapter}
            />
          )}
          {route.section === "grammar" && (
            <GrammarView
              key={`${course.id}-grammar`}
              chapters={chapters}
              reference={course.referenceGrammar}
              initialChapter={chapter.number}
              onChapterChange={setChapter}
            />
          )}
        </main>

        <footer className="site-footer">
          <span>
            {course.title} · built from your course audio, transcripts and wordlist
          </span>
          <span>
            {course.audioTracks.length} tracks · {totalWords} words · {totalGrammarStrings}{" "}
            grammar notes
          </span>
        </footer>
      </div>
    </div>
  );
}
