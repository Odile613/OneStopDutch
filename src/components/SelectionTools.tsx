import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import {
  CREATE_NOTE_EVENT,
  OPEN_NOTE_EVENT,
  AI_EXPLAIN_EVENT,
  NOTE_LABELS,
  type NoteCategory,
  type SavedNote,
} from "../lib/notes";
import { useAuth } from "../lib/auth";
import { speakDutch } from "../lib/speech";
import {
  fetchAiModels,
  fetchAiPreferences,
  saveAiPreferences,
  type AiModelsResponse,
} from "../lib/aiModels";
import AiModelSelector from "./AiModelSelector";
import { Icon, type IconName } from "./Icon";
import NoteAiPanel from "./NoteAiPanel";

interface SelectionState {
  text: string;
  rect: DOMRect;
}

interface OpenNote {
  id: string;
  rect: DOMRect;
}

type AiMode = "vocab" | "grammar";
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const RESIZE_CURSOR: Record<ResizeDir, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize",
};

const CATEGORIES: {
  id: NoteCategory;
  label: string;
  icon: IconName;
}[] = [
  { id: "word", label: NOTE_LABELS.word, icon: "book" },
  { id: "grammar", label: NOTE_LABELS.grammar, icon: "grammar" },
  { id: "pronunciation", label: NOTE_LABELS.pronunciation, icon: "volume" },
];

const IGNORED_HIGHLIGHT_SELECTOR =
  "textarea, input, select, script, style, .selection-tools, .note-popover, .notes-panel";

const HIGHLIGHT_PREFIX = "osd-note-";
const ACTIVE_HIGHLIGHT = "osd-note-active";

interface NoteHighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

function highlightRegistry(): {
  registry?: NoteHighlightRegistry;
  HighlightCtor?: HighlightConstructor;
} {
  return {
    registry: (CSS as unknown as { highlights?: NoteHighlightRegistry }).highlights,
    HighlightCtor: (window as unknown as { Highlight?: HighlightConstructor })
      .Highlight,
  };
}

function findNoteRanges(root: HTMLElement, note: SavedNote): Range[] {
  if (!note.text) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(IGNORED_HIGHLIGHT_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const entries: { node: Text; start: number }[] = [];
  let combined = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    entries.push({ node, start: combined.length });
    combined += node.data;
  }

  function pointAt(offset: number) {
    for (const entry of entries) {
      if (offset <= entry.start + entry.node.data.length) {
        return { node: entry.node, offset: offset - entry.start };
      }
    }
    const last = entries[entries.length - 1];
    return last
      ? { node: last.node, offset: last.node.data.length }
      : null;
  }

  const ranges: Range[] = [];
  let index = combined.indexOf(note.text);
  while (index !== -1) {
    const start = pointAt(index);
    const end = pointAt(index + note.text.length);
    if (start && end) {
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      ranges.push(range);
    }
    index = combined.indexOf(note.text, index + note.text.length);
  }
  return ranges;
}

function rangeContainsPoint(range: Range, x: number, y: number): boolean {
  return Array.from(range.getClientRects()).some(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom,
  );
}

/**
 * Selection popup for saving a categorised note, plus the coloured highlights
 * those notes create. Clicking a highlight opens the saved note.
 */
export default function SelectionTools({
  context,
  notes,
  setNotes,
}: {
  context: string;
  notes: SavedNote[];
  setNotes: Dispatch<SetStateAction<SavedNote[]>>;
}) {
  const { accessToken } = useAuth();
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<NoteCategory>("word");
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const [openNote, setOpenNote] = useState<OpenNote | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState<NoteCategory>("word");
  const [noteSaved, setNoteSaved] = useState(false);
  const [notePosition, setNotePosition] = useState({ left: 12, top: 12 });
  const [aiMode, setAiMode] = useState<AiMode | null>(null);
  const [draftAiMode, setDraftAiMode] = useState<AiMode | null>(null);
  const [selectionSize, setSelectionSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [noteSize, setNoteSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [aiModels, setAiModels] = useState<AiModelsResponse | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const popupRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const clickableRanges = useRef<{ note: SavedNote; ranges: Range[] }[]>([]);
  const selectionSaved = useRef(false);
  const justOpened = useRef(false);
  const drag = useRef<{
    kind: "selection" | "note";
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const resize = useRef<{
    kind: "selection" | "note";
    dir: ResizeDir;
    x: number;
    y: number;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const activeNote = openNote
    ? (notes.find((item) => item.id === openNote.id) ?? null)
    : null;
  function persistOpenNoteDraft() {
    if (!activeNote) return;
    const next = noteDraft.trim();
    if (next !== activeNote.note || draftCategory !== activeNote.category) {
      setNotes((current) =>
        current.map((item) =>
          item.id === activeNote.id
            ? { ...item, note: next, category: draftCategory }
            : item,
        ),
      );
    }
  }

  function askOpenNoteAi(mode: AiMode) {
    setDraftAiMode(mode);
    fireAi(mode);
  }

  function placeNear(anchor: DOMRect, width: number, height: number) {
    const margin = 12;
    const gap = 16;
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(value, Math.max(min, max)));
    let left = clamp(anchor.left, margin, window.innerWidth - width - margin);
    let top = anchor.bottom + gap;
    if (top + height > window.innerHeight - margin) {
      top = anchor.top - height - gap;
    }
    top = clamp(top, margin, window.innerHeight - height - margin);

    const overlaps =
      left < anchor.right + 4 &&
      anchor.left - 4 < left + width &&
      top < anchor.bottom + 4 &&
      anchor.top - 4 < top + height;
    if (overlaps) {
      const right = anchor.right + gap;
      left =
        right + width <= window.innerWidth - margin
          ? right
          : clamp(anchor.left - width - gap, margin, window.innerWidth - width - margin);
      top = clamp(anchor.top, margin, window.innerHeight - height - margin);
    }
    return { left, top };
  }

  function startDrag(event: ReactPointerEvent, kind: "selection" | "note") {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const origin = kind === "selection" ? position : notePosition;
    drag.current = {
      kind,
      x: event.clientX,
      y: event.clientY,
      left: origin.left,
      top: origin.top,
    };
  }

  function resizeEdge(event: ReactPointerEvent<HTMLDivElement>): ResizeDir | null {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const zone = 8;
    const west = x <= zone;
    const east = x >= rect.width - zone;
    const north = y <= zone;
    const south = y >= rect.height - zone;
    if (north && west) return "nw";
    if (north && east) return "ne";
    if (south && west) return "sw";
    if (south && east) return "se";
    if (north) return "n";
    if (south) return "s";
    if (west) return "w";
    if (east) return "e";
    return null;
  }

  function startResize(
    event: ReactPointerEvent<HTMLDivElement>,
    kind: "selection" | "note",
    dir: ResizeDir,
  ) {
    const element = kind === "selection" ? popupRef.current : noteRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    event.preventDefault();
    resize.current = {
      kind,
      dir,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  const resizeProps = (kind: "selection" | "note") => ({
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      const dir = resizeEdge(event);
      if (dir) startResize(event, kind, dir);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const dir = resizeEdge(event);
      event.currentTarget.style.cursor = dir ? RESIZE_CURSOR[dir] : "";
    },
  });

  useEffect(() => {
    function move(event: PointerEvent) {
      if (resize.current) {
        const current = resize.current;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        let width = current.width;
        let height = current.height;
        if (current.dir.includes("e")) width = current.width + dx;
        if (current.dir.includes("w")) width = current.width - dx;
        if (current.dir.includes("s")) height = current.height + dy;
        if (current.dir.includes("n")) height = current.height - dy;
        width = Math.max(280, Math.min(width, window.innerWidth - 24));
        height = Math.max(120, Math.min(height, window.innerHeight - 24));
        let left = current.dir.includes("w")
          ? current.left + (current.width - width)
          : current.left;
        let top = current.dir.includes("n")
          ? current.top + (current.height - height)
          : current.top;
        left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
        top = Math.max(12, Math.min(top, window.innerHeight - height - 12));
        if (current.kind === "selection") {
          setPosition({ left, top });
          setSelectionSize({ width, height });
        } else {
          setNotePosition({ left, top });
          setNoteSize({ width, height });
        }
        return;
      }
      if (!drag.current) return;
      const next = {
        left: drag.current.left + event.clientX - drag.current.x,
        top: drag.current.top + event.clientY - drag.current.y,
      };
      if (drag.current.kind === "selection") setPosition(next);
      else setNotePosition(next);
    }
    function stop() {
      drag.current = null;
      resize.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, []);

  function fireAi(mode: AiMode) {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(AI_EXPLAIN_EVENT, { detail: { mode } }));
    }, 0);
  }

  useEffect(() => {
    if (!accessToken) {
      setAiModels(null);
      setSelectedModel("");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const data = await fetchAiModels(accessToken);
        if (!active) return;
        setAiModels(data);
        let prefs = null;
        try {
          prefs = await fetchAiPreferences();
        } catch {
          prefs = null;
        }
        if (!active) return;
        const fallback = prefs?.default_model || data.default;
        setDefaultModel(fallback);
        setSelectedModel(prefs?.last_model || fallback);
      } catch {
        // Model loading is best-effort; the selector stays empty for now.
      }
    })();
    return () => {
      active = false;
    };
  }, [accessToken]);

  async function changeModel(ref: string) {
    setSelectedModel(ref);
    try {
      await saveAiPreferences({ default_model: defaultModel, last_model: ref });
    } catch {
      // Preference persistence is best-effort.
    }
  }

  async function setDefault() {
    setDefaultModel(selectedModel);
    try {
      await saveAiPreferences({
        default_model: selectedModel,
        last_model: selectedModel,
      });
    } catch {
      // Preference persistence is best-effort.
    }
  }

  const modelSelector = (compact: boolean) =>
    accessToken ? (
      <AiModelSelector
        models={aiModels}
        value={selectedModel}
        defaultModel={defaultModel}
        onChange={(ref) => void changeModel(ref)}
        onSetDefault={() => void setDefault()}
        compact={compact}
      />
    ) : (
      <span className="note-model-hint">Sign in</span>
    );

  function openSelectionPopup(text: string, rect: DOMRect) {
    justOpened.current = true;
    window.setTimeout(() => {
      justOpened.current = false;
    }, 350);
    setOpenNote(null);
    setAiMode(null);
    setSelection({ text: text.slice(0, 600), rect });
    setNote("");
    setCategory("word");
    selectionSaved.current = false;
    setPosition({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 352)),
      top: rect.bottom + 8,
    });
  }

  function commitSelectionNote() {
    if (!selection || selectionSaved.current) return;
    selectionSaved.current = true;
    const entry: SavedNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: selection.text,
      note: note.trim(),
      category,
      context,
      createdAt: Date.now(),
    };
    setNotes((current) => [...current, entry]);
  }

  function cancelSelectionNote() {
    setSelection(null);
    setNote("");
    setAiMode(null);
    selectionSaved.current = false;
  }

  useEffect(() => {
    setSelection(null);
    setOpenNote(null);
    setNoteDraft("");
    setDraftCategory("word");
    setNoteSaved(false);
    setAiMode(null);
    setDraftAiMode(null);
    selectionSaved.current = false;
  }, [context]);

  useEffect(() => {
    function openSavedNote(event: Event) {
      const detail = (event as CustomEvent<{ id: string; rect: DOMRect }>).detail;
      const note = notes.find((item) => item.id === detail.id);
      if (!note) return;
      setSelection(null);
      setOpenNote({ id: note.id, rect: detail.rect });
      setNoteDraft(note.note);
      setDraftCategory(note.category);
      setNoteSaved(false);
      setDraftAiMode(null);
    }
    window.addEventListener(OPEN_NOTE_EVENT, openSavedNote);
    return () => window.removeEventListener(OPEN_NOTE_EVENT, openSavedNote);
  }, [notes]);

  useEffect(() => {
    function captureSelection() {
      if (popupRef.current) return;

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
      ) {
        return;
      }

      const browserSelection = window.getSelection();
      if (!browserSelection || browserSelection.isCollapsed) return;

      const text = browserSelection.toString().replace(/\s+/g, " ").trim();
      if (!text) return;

      const range = browserSelection.getRangeAt(0);
      const container =
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
          ? range.commonAncestorContainer.parentElement
          : (range.commonAncestorContainer as HTMLElement);
      const content = document.querySelector(".content");
      if (
        !container ||
        !content ||
        !content.contains(container) ||
        container.closest(".selection-tools, .note-popover, .notes-panel")
      ) {
        return;
      }

      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      openSelectionPopup(text.slice(0, 600), rect);
    }

    function openFromWordHint(event: Event) {
      const detail = (event as CustomEvent<{
        text: string;
        rect: DOMRect;
        category?: NoteCategory;
      }>).detail;
      setOpenNote(null);
      setAiMode(null);
      setSelection({ text: detail.text.slice(0, 600), rect: detail.rect });
      setNote("");
      setCategory(detail.category ?? "word");
      selectionSaved.current = false;
      justOpened.current = true;
      window.setTimeout(() => {
        justOpened.current = false;
      }, 350);
      setPosition({
        left: Math.max(12, Math.min(detail.rect.left, window.innerWidth - 352)),
        top: detail.rect.bottom + 8,
      });
    }

    document.addEventListener("mouseup", captureSelection);
    document.addEventListener("keyup", captureSelection);
    window.addEventListener(CREATE_NOTE_EVENT, openFromWordHint);
    return () => {
      document.removeEventListener("mouseup", captureSelection);
      document.removeEventListener("keyup", captureSelection);
      window.removeEventListener(CREATE_NOTE_EVENT, openFromWordHint);
    };
  }, []);

  // Both pop-out boxes stay open until an explicit button (cross, Cancel,
  // Save or Delete) closes them — scrolling or clicking elsewhere must not
  // dismiss them.

  useLayoutEffect(() => {
    const element = popupRef.current;
    if (!selection || !element) return;
    setPosition((current) => {
      const next = placeNear(
        selection.rect,
        element.offsetWidth,
        element.offsetHeight,
      );
      return current.left === next.left && current.top === next.top ? current : next;
    });
  }, [selection]);

  useLayoutEffect(() => {
    const element = noteRef.current;
    if (!openNote || !element) return;
    setNotePosition((current) => {
      const next = placeNear(
        openNote.rect,
        element.offsetWidth,
        element.offsetHeight,
      );
      return current.left === next.left && current.top === next.top ? current : next;
    });
  }, [openNote]);

  // Register the notes as native CSS highlights. This avoids changing React's
  // DOM, so expanding tracks or toggling word hints cannot break reconciliation.
  useEffect(() => {
    const content = document.querySelector<HTMLElement>(".content");
    const { registry, HighlightCtor } = highlightRegistry();
    if (!content || !registry || !HighlightCtor) return;

    const relevant = notes.filter(
      (item) => item.context === context && item.text,
    );

    let timer = 0;
    let observer: MutationObserver | null = null;

    const clear = () => {
      for (const category of CATEGORIES) {
        registry.delete(`${HIGHLIGHT_PREFIX}${category.id}`);
      }
      registry.delete(ACTIVE_HIGHLIGHT);
      clickableRanges.current = [];
    };

    const run = () => {
      clear();

      if (relevant.length === 0) return;

      const byCategory = new Map<NoteCategory, Range[]>();
      const activeRanges: Range[] = [];

      // Shorter notes first so the most specific note wins when ranges overlap.
      const ordered = [...relevant].sort(
        (a, b) => a.text.length - b.text.length,
      );
      for (const item of ordered) {
        const ranges = findNoteRanges(content, item);
        if (ranges.length === 0) continue;
        clickableRanges.current.push({ note: item, ranges });
        const categoryRanges = byCategory.get(item.category) ?? [];
        categoryRanges.push(...ranges);
        byCategory.set(item.category, categoryRanges);
        if (item.id === openNote?.id) activeRanges.push(...ranges);
      }

      for (const [category, ranges] of byCategory) {
        registry.set(
          `${HIGHLIGHT_PREFIX}${category}`,
          new HighlightCtor(...ranges),
        );
      }

      if (activeRanges.length > 0) {
        registry.set(ACTIVE_HIGHLIGHT, new HighlightCtor(...activeRanges));
      }
    };

    observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, 80);
    });

    run();
    observer.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer?.disconnect();
      window.clearTimeout(timer);
      clear();
    };
  }, [notes, context, openNote?.id]);

  // Use a capture listener so a highlight inside a vocabulary word takes
  // precedence over the word-hint button.
  useEffect(() => {
    function handleNoteClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".selection-tools, .note-popover, .notes-panel")) {
        return;
      }

      let found: SavedNote | undefined;
      let anchor: DOMRect | undefined;

      for (const entry of clickableRanges.current) {
        for (const range of entry.ranges) {
          if (!rangeContainsPoint(range, event.clientX, event.clientY)) {
            continue;
          }
          anchor = Array.from(range.getClientRects()).find(
            (rect) =>
              rect.width > 0 &&
              rect.height > 0 &&
              event.clientX >= rect.left &&
              event.clientX <= rect.right &&
              event.clientY >= rect.top &&
              event.clientY <= rect.bottom,
          );
          found = entry.note;
          break;
        }
        if (found) break;
      }

      if (!found) return;

      event.preventDefault();
      event.stopPropagation();
      setSelection(null);
      setOpenNote({
        id: found.id,
        rect: anchor ?? new DOMRect(event.clientX, event.clientY, 0, 0),
      });
      setNoteDraft(found.note);
      setDraftCategory(found.category);
      setNoteSaved(false);
      setDraftAiMode(null);
    }

    document.addEventListener("click", handleNoteClick, true);

    let hoveringNote = false;
    function handleNoteHover(event: PointerEvent) {
      let inside = false;
      for (const entry of clickableRanges.current) {
        for (const range of entry.ranges) {
          if (rangeContainsPoint(range, event.clientX, event.clientY)) {
            inside = true;
            break;
          }
        }
        if (inside) break;
      }
      if (inside !== hoveringNote) {
        hoveringNote = inside;
        document.body.classList.toggle("osd-note-hover", inside);
      }
    }

    document.addEventListener("pointermove", handleNoteHover);
    return () => {
      document.removeEventListener("click", handleNoteClick, true);
      document.removeEventListener("pointermove", handleNoteHover);
      document.body.classList.remove("osd-note-hover");
    };
  }, []);

  function saveOpenNote() {
    persistOpenNoteDraft();
    setNoteSaved(true);
  }

  function cancelOpenNote() {
    setOpenNote(null);
    setNoteDraft("");
    setDraftCategory("word");
    setNoteSaved(false);
    setDraftAiMode(null);
  }

  function deleteOpenNote() {
    if (!activeNote) return;
    setNotes((current) => current.filter((item) => item.id !== activeNote.id));
    setOpenNote(null);
    setNoteDraft("");
    setDraftCategory("word");
    setNoteSaved(false);
    setDraftAiMode(null);
  }

  return (
    <>
      {selection &&
        createPortal(
          <div
            ref={popupRef}
            className={`selection-tools${aiMode ? " is-ai-mode" : ""}`}
            style={{
              left: position.left,
              top: position.top,
              ...(selectionSize && {
                width: selectionSize.width,
                height: selectionSize.height,
              }),
            }}
            {...resizeProps("selection")}
            role="dialog"
            aria-label="Selection actions"
          >
            <div className="selection-tools__sticky">
            <div
              className="selection-tools__head"
              onPointerDown={(event) => startDrag(event, "selection")}
            >
              <p className="selection-tools__quote">{selection.text}</p>
              <button
                type="button"
                className="selection-tools__icon-button"
                onClick={() => speakDutch(selection.text)}
                title="Play pronunciation"
                aria-label="Play pronunciation of the selected text"
              >
                <Icon name="volume" size={16} />
              </button>
              <button
                type="button"
                className="selection-tools__icon-button"
                onClick={() => setSelection(null)}
                title="Close"
                aria-label="Close selection actions"
              >
                <Icon name="close" size={15} />
              </button>
            </div>

            <div
              className="selection-tools__categories"
              role="group"
              aria-label="Note actions"
            >
              <button
                type="button"
                className={`selection-tools__category is-word${category === "word" && !aiMode ? " is-active" : ""}`}
                onClick={() => {
                  setCategory("word");
                  setAiMode(null);
                }}
                aria-pressed={category === "word"}
                aria-label="Word note"
                title="Word note"
              >
                <Icon name="book" size={16} />
              </button>
              <button
                type="button"
                className={`selection-tools__ai note-ai--word${aiMode === "vocab" ? " is-active" : ""}`}
                onClick={() => {
                  setAiMode("vocab");
                  fireAi("vocab");
                }}
                aria-label="Ask AI about this word"
                title="Ask AI about this word"
              >
                <Icon name="brain" size={16} />
              </button>
              <button
                type="button"
                className={`selection-tools__category is-grammar${category === "grammar" && !aiMode ? " is-active" : ""}`}
                onClick={() => {
                  setCategory("grammar");
                  setAiMode(null);
                }}
                aria-pressed={category === "grammar"}
                aria-label="Grammar note"
                title="Grammar note"
              >
                <Icon name="grammar" size={16} />
              </button>
              <button
                type="button"
                className={`selection-tools__ai note-ai--grammar${aiMode === "grammar" ? " is-active" : ""}`}
                onClick={() => {
                  setAiMode("grammar");
                  fireAi("grammar");
                }}
                aria-label="Ask AI about this grammar"
                title="Ask AI about this grammar"
              >
                <Icon name="brain" size={16} />
              </button>
              <button
                type="button"
                className={`selection-tools__category is-pronunciation${category === "pronunciation" && !aiMode ? " is-active" : ""}`}
                onClick={() => {
                  setCategory("pronunciation");
                  setAiMode(null);
                }}
                aria-pressed={category === "pronunciation"}
                aria-label="Pronunciation note"
                title="Pronunciation note"
              >
                <Icon name="volume" size={16} />
              </button>
              {modelSelector(true)}
            </div>
            </div>

            {aiMode && (
              <NoteAiPanel
                key={`${selection.text}-${aiMode}`}
                mode={aiMode}
                query={selection.text}
                accessToken={accessToken}
                selectedModel={selectedModel}
              />
            )}

            {!aiMode && (
              <div className="selection-tools__scroll">
                <textarea
                  className="selection-tools__editor"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add a note…"
                  rows={5}
                  aria-label="Your note"
                />

                <div className="selection-tools__actions">
                  <button
                    type="button"
                    className="selection-tools__action"
                    onClick={() => {
                      commitSelectionNote();
                      setSelection(null);
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="selection-tools__action"
                    onClick={cancelSelectionNote}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}

      {openNote &&
        activeNote &&
        createPortal(
          <div
            ref={noteRef}
            className={`selection-tools note-popover note-popover--${draftCategory}${draftAiMode ? " is-ai-mode" : ""}`}
            style={{
              left: notePosition.left,
              top: notePosition.top,
              ...(noteSize && { width: noteSize.width, height: noteSize.height }),
            }}
            {...resizeProps("note")}
            role="dialog"
            aria-label="Saved note"
          >
            <div className="selection-tools__sticky">
            <div
              className="note-popover__head selection-tools__head"
              onPointerDown={(event) => startDrag(event, "note")}
            >
              <p className="selection-tools__quote">{activeNote.text}</p>
              <button
                type="button"
                className="selection-tools__icon-button"
                onClick={() => speakDutch(activeNote.text)}
                title="Play pronunciation"
                aria-label="Play pronunciation of the selected text"
              >
                <Icon name="volume" size={16} />
              </button>
              <button
                type="button"
                className="selection-tools__icon-button"
                onClick={() => setOpenNote(null)}
                title="Close"
                aria-label="Close note"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
            <div
              className="selection-tools__categories"
              role="group"
              aria-label="Note actions"
            >
              <button
                type="button"
                className={`selection-tools__category is-word${draftCategory === "word" && !draftAiMode ? " is-active" : ""}`}
                onClick={() => {
                  setDraftCategory("word");
                  setDraftAiMode(null);
                  setNoteSaved(false);
                }}
                aria-pressed={draftCategory === "word"}
                aria-label="Word note"
                title="Word note"
              >
                <Icon name="book" size={16} />
              </button>
              <button
                type="button"
                className={`selection-tools__ai note-ai--word${draftAiMode === "vocab" ? " is-active" : ""}`}
                onClick={() => askOpenNoteAi("vocab")}
                aria-label="Ask AI about this word"
                title="Ask AI about this word"
              >
                <Icon name="brain" size={16} />
              </button>
              <button
                type="button"
                className={`selection-tools__category is-grammar${draftCategory === "grammar" && !draftAiMode ? " is-active" : ""}`}
                onClick={() => {
                  setDraftCategory("grammar");
                  setDraftAiMode(null);
                  setNoteSaved(false);
                }}
                aria-pressed={draftCategory === "grammar"}
                aria-label="Grammar note"
                title="Grammar note"
              >
                <Icon name="grammar" size={16} />
              </button>
              <button
                type="button"
                className={`selection-tools__ai note-ai--grammar${draftAiMode === "grammar" ? " is-active" : ""}`}
                onClick={() => askOpenNoteAi("grammar")}
                aria-label="Ask AI about this grammar"
                title="Ask AI about this grammar"
              >
                <Icon name="brain" size={16} />
              </button>
              <button
                type="button"
                className={`selection-tools__category is-pronunciation${draftCategory === "pronunciation" && !draftAiMode ? " is-active" : ""}`}
                onClick={() => {
                  setDraftCategory("pronunciation");
                  setDraftAiMode(null);
                  setNoteSaved(false);
                }}
                aria-pressed={draftCategory === "pronunciation"}
                aria-label="Pronunciation note"
                title="Pronunciation note"
              >
                <Icon name="volume" size={16} />
              </button>
              {modelSelector(true)}
            </div>
            </div>

            {draftAiMode && (
              <NoteAiPanel
                key={`${activeNote.text}-${draftAiMode}`}
                mode={draftAiMode}
                query={activeNote.text}
                accessToken={accessToken}
                selectedModel={selectedModel}
              />
            )}

            {!draftAiMode && (
              <div className="selection-tools__scroll">
                <textarea
                  className="selection-tools__editor note-popover__editor"
                  value={noteDraft}
                  onChange={(event) => {
                    setNoteDraft(event.target.value);
                    setNoteSaved(false);
                  }}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      saveOpenNote();
                    }
                  }}
                  placeholder="Add to this note…"
                  rows={5}
                  aria-label="Edit note"
                />
                <div className="selection-tools__actions note-popover__actions">
                  {noteSaved && (
                    <span className="note-popover__saved">
                      <Icon name="check" size={14} /> Saved
                    </span>
                  )}
                  <button
                    type="button"
                    className="selection-tools__action"
                    onClick={saveOpenNote}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="selection-tools__action"
                    onClick={cancelOpenNote}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="selection-tools__action note-popover__delete-button"
                    onClick={deleteOpenNote}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
