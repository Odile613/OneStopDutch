import { foldText, type SavedNote } from "./notes";

export type NoteSortMode = "date" | "category" | "alpha";

const CATEGORY_RANK: Record<SavedNote["category"], number> = {
  word: 0,
  pronunciation: 1,
  grammar: 2,
};

export function sortNotes(
  notes: SavedNote[],
  mode: NoteSortMode,
  newestFirst: boolean,
): SavedNote[] {
  const copy = [...notes];
  const byDate = (a: SavedNote, b: SavedNote) =>
    newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;

  copy.sort((a, b) => {
    if (mode === "alpha") {
      return foldText(a.text).localeCompare(foldText(b.text)) || byDate(a, b);
    }
    if (mode === "category") {
      return CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || byDate(a, b);
    }
    return byDate(a, b);
  });
  return copy;
}
