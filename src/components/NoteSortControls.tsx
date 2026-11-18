import { Icon } from "./Icon";
import type { NoteSortMode } from "../lib/noteSort";

export default function NoteSortControls({
  mode,
  newestFirst,
  onModeChange,
  onNewestFirstChange,
  showCategory = true,
}: {
  mode: NoteSortMode;
  newestFirst: boolean;
  onModeChange: (mode: NoteSortMode) => void;
  onNewestFirstChange: (value: boolean) => void;
  showCategory?: boolean;
}) {
  return (
    <div className="note-sort-controls" role="group" aria-label="Sort notes">
      <button
        type="button"
        className="notes-drawer__tool"
        onClick={() => onNewestFirstChange(!newestFirst)}
        title="Order by date"
        aria-label={newestFirst ? "Newest to oldest" : "Oldest to newest"}
      >
        <Icon name="sortTime" size={16} />
      </button>
      {showCategory && (
        <button
          type="button"
          className={mode === "category" ? "notes-drawer__tool is-active" : "notes-drawer__tool"}
          onClick={() => onModeChange(mode === "category" ? "date" : "category")}
          title="Order by category"
          aria-label={mode === "category" ? "Sort by date" : "Sort by category"}
        >
          <Icon name="sortCategory" size={16} />
        </button>
      )}
      <button
        type="button"
        className={mode === "alpha" ? "notes-drawer__tool is-active" : "notes-drawer__tool"}
        onClick={() => onModeChange(mode === "alpha" ? "date" : "alpha")}
        title="Sort alphabetically"
        aria-label={mode === "alpha" ? "Sort by date" : "Sort alphabetically"}
      >
        <Icon name="sortAlpha" size={16} />
      </button>
    </div>
  );
}
