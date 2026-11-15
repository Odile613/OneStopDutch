const STORAGE_KEY = "onestopdutch-progress-v1";

export type ExerciseStatus = "correct" | "revealed";
type Progress = Record<string, ExerciseStatus>;

function read(): Progress {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as Progress) : {};
  } catch {
    return {};
  }
}

export function markExercise(id: string, status: ExerciseStatus): void {
  const progress = read();
  progress[id] = status;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage can be unavailable in private mode; progress is a bonus only.
  }
}

export function progressFor(ids: string[]): [number, number] {
  const progress = read();
  const done = ids.filter((id) => progress[id] !== undefined).length;
  return [done, ids.length];
}
