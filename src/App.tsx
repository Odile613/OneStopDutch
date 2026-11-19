import { useCallback, useEffect, useState } from "react";
import type { CourseId, SectionId } from "./types";
import {
  chapterOptionLabel,
  courseById,
  courses,
  shortChapterName,
} from "./data";
import AuthControl from "./components/AuthControl";
import BookView from "./components/BookView";
import GrammarNotesView from "./components/GrammarNotesView";
import SelectionTools from "./components/SelectionTools";
import WordlistView from "./components/WordlistView";
import { Icon, type IconName } from "./components/Icon";
import { useAuth } from "./lib/auth";
import { NOTES_STORAGE_KEY, type SavedNote } from "./lib/notes";
import { useCloudSync } from "./lib/sync";
import { useLocalStorage } from "./lib/useLocalStorage";

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

function AppShell() {
  const [notes, setNotes] = useLocalStorage<SavedNote[]>(NOTES_STORAGE_KEY, []);
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

  const course = courseById(route.courseId) ?? courses[0];
  const chapters = course.chapters;

  useEffect(() => {
    function updateStickyOffsets() {
      const header = document.querySelector<HTMLElement>(".topbar");
      const toolbar = document.querySelector<HTMLElement>(".section-heading--toolbar");
      document.documentElement.style.setProperty(
        "--topbar-height",
        `${header?.offsetHeight ?? 64}px`,
      );
      document.documentElement.style.setProperty(
        "--sticky-toolbar-space",
        `${toolbar?.offsetHeight ?? 34}px`,
      );
    }
    updateStickyOffsets();
    const observer = new ResizeObserver(updateStickyOffsets);
    const header = document.querySelector(".topbar");
    if (header) observer.observe(header);
    window.addEventListener("resize", updateStickyOffsets);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateStickyOffsets);
    };
  }, [route.section]);

  useEffect(() => {
    const handleHash = () => {
      const next = parseHash();
      if (next) setRoute(next);
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

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

  useEffect(() => {
    const section = SECTIONS.find((item) => item.id === route.section)?.label ?? "Study";
    document.title = `${shortChapterName(chapter)} · ${section} · ${course.title} | OneStopDutch`;
  }, [chapter, course, route.section]);

  // The topbar grows an extra row on narrow screens, so expose its real height
  // to CSS. Sticky elements (the toolbar and the audio bar) offset from it.
  useEffect(() => {
    const topbar = document.querySelector<HTMLElement>(".topbar");
    if (!topbar) return;
    const update = () => {
      document.documentElement.style.setProperty(
        "--topbar-height",
        `${Math.ceil(topbar.getBoundingClientRect().height)}px`,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(topbar);
    return () => observer.disconnect();
  }, []);

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

  function updateNote(id: string, text: string) {
    setNotes((current) =>
      current.map((note) => (note.id === id ? { ...note, note: text } : note)),
    );
  }

  function deleteNote(id: string) {
    setNotes((current) => current.filter((note) => note.id !== id));
  }

  return (
    <div className="shell">
      <div className="main">
        <header className="topbar">
          <div className="topbar__brand">
            <span className="brand__mark">NL</span>
            <span className="topbar__name">
              OneStop<span className="topbar__name-accent">Dutch</span>
            </span>
          </div>

          <div className="topbar__center">
            <div className="topbar__selectors">
              <label className="course-switcher">
                <span className="visually-hidden">Choose a book</span>
                <select
                  value={course.id}
                  onChange={(event) => setCourse(event.target.value as CourseId)}
                >
                  {courses.map((item) => (
                    <option key={item.id} value={item.id} title={item.title}>
                      Vol. {item.bookNumber}
                    </option>
                  ))}
                </select>
                <Icon name="chevron" size={15} className="course-switcher__chevron" />
              </label>

              <label className="chapter-jump">
                <span className="visually-hidden">Jump to chapter</span>
                <select
                  value={route.chapter}
                  onChange={(event) => setChapter(Number(event.target.value))}
                >
                  {chapters.map((item) => (
                    <option key={item.number} value={item.number} title={chapterOptionLabel(item)}>
                      Ch. {item.number}
                    </option>
                  ))}
                </select>
                <Icon name="chevron" size={15} className="course-switcher__chevron" />
              </label>
            </div>

            <span className="topbar__divider" aria-hidden="true" />

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
          </div>

          <div className="topbar__account">
            <AuthControl />
          </div>
        </header>

        <main className="content">
          {route.section === "textbook" && (
            <BookView
              key={`${course.id}-tb-${chapter.number}`}
              courseId={course.id}
              chapter={chapter}
              book="tb"
              tracks={course.audioTracks}
              notes={notes}
              onUpdateNote={updateNote}
              onDeleteNote={deleteNote}
            />
          )}
          {route.section === "workbook" && (
            <BookView
              key={`${course.id}-wb-${chapter.number}`}
              courseId={course.id}
              chapter={chapter}
              book="wb"
              tracks={course.audioTracks}
              notes={notes}
              onUpdateNote={updateNote}
              onDeleteNote={deleteNote}
            />
          )}
          {route.section === "wordlist" && (
            <WordlistView
              key={`${course.id}-words`}
              courseId={course.id}
              chapters={chapters}
              notes={notes}
              onUpdateNote={updateNote}
              onDeleteNote={deleteNote}
              initialChapter={chapter.number}
              onChapterChange={setChapter}
            />
          )}
          {route.section === "grammar" && (
            <div className="page">
              <GrammarNotesView
                key={course.id}
                courseId={course.id}
                chapters={chapters}
                initialChapter={chapter.number}
                notes={notes}
                onUpdateNote={updateNote}
                onDeleteNote={deleteNote}
              />
            </div>
          )}
        </main>

        <SelectionTools
          context={`${course.id}/${route.section}/${route.chapter}`}
          notes={notes}
          setNotes={setNotes}
        />
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  const [epoch, setEpoch] = useState(0);
  const onRemoteData = useCallback(() => setEpoch((value) => value + 1), []);
  useCloudSync(user, onRemoteData);
  return <AppShell key={epoch} />;
}
