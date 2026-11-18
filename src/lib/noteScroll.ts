import { EXPAND_ALL_TRACKS_EVENT, type SavedNote } from "./notes";

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

function highlightRegistry(): {
  registry: HighlightRegistry | null;
  HighlightCtor: (new (...ranges: Range[]) => unknown) | null;
} {
  const css = CSS as unknown as { highlights?: HighlightRegistry };
  const win = window as unknown as {
    Highlight?: new (...ranges: Range[]) => unknown;
  };
  return { registry: css.highlights ?? null, HighlightCtor: win.Highlight ?? null };
}

function findTextRange(root: HTMLElement | null, text: string): Range | null {
  if (!root || !text.trim()) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest("script, style")) return NodeFilter.FILTER_REJECT;
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

  const needle = text.trim();
  let index = combined.indexOf(needle);
  if (index < 0) index = combined.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return null;

  function pointAt(offset: number) {
    for (const entry of entries) {
      if (offset <= entry.start + entry.node.data.length) {
        return { node: entry.node, offset: offset - entry.start };
      }
    }
    return null;
  }

  const start = pointAt(index);
  const end = pointAt(index + needle.length);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

export function goToNote(note: SavedNote): boolean {
  const [courseId, section, chapter] = note.context.split("/");
  const hash = `#/${courseId}/${section || "textbook"}/${chapter || 1}`;
  const highlightName =
    note.category === "grammar"
      ? "osd-locate-grammar"
      : note.category === "word"
        ? "osd-locate-word"
        : "osd-locate-pronunciation";

  let attempts = 0;
  const tryLocate = (): boolean => {
    const range = findTextRange(document.querySelector(".content"), note.text);
    if (range) {
      const element = range.startContainer.parentElement;
      element?.scrollIntoView({ behavior: "smooth", block: "center" });

      const { registry, HighlightCtor } = highlightRegistry();
      if (registry && HighlightCtor) {
        [
          "osd-locate-word",
          "osd-locate-grammar",
          "osd-locate-pronunciation",
        ].forEach((name) => registry.delete(name));
        registry.set(highlightName, new HighlightCtor(range));
        window.setTimeout(() => registry.delete(highlightName), 2200);
      }
      return true;
    }
    if (attempts++ < 40) {
      window.setTimeout(tryLocate, 60);
    }
    return false;
  };

  if (section === "textbook" || section === "workbook") {
    window.dispatchEvent(new CustomEvent(EXPAND_ALL_TRACKS_EVENT));
  }

  if (window.location.hash !== hash) {
    window.location.hash = hash;
    window.setTimeout(tryLocate, 350);
  } else {
    tryLocate();
  }
  return true;
}
