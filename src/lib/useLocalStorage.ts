import { useEffect, useState } from "react";

/** JSON-backed localStorage state with a safe fallback. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore unavailable storage.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
