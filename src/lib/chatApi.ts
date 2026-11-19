/**
 * Base URL for the AI backend.
 *
 * In production the backend runs as a same-origin Netlify Function, so the
 * default is a relative `/api` path. In local development Vite proxies `/api`
 * to the Python backend on http://localhost:8000 (see vite.config.ts).
 * `VITE_CHAT_API_URL` can still override this for a standalone backend.
 */
export const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || "/api";

/** Turn a failed fetch (network/CORS) or an error response into a useful message. */
export async function readChatError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body?.error?.message) return body.error.message;
    if (body?.detail?.error?.message) return body.detail.error.message;
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.message === "string") return body.message;
  } catch {
    // ignore malformed error bodies
  }
  return `AI request failed (${response.status})`;
}

/** A fetch that never reached the backend gives a TypeError in the browser. */
export function describeChatFetchError(cause: unknown): string {
  if (cause instanceof TypeError) {
    return "Cannot reach the AI service. Check the site connection and try again.";
  }
  return cause instanceof Error ? cause.message : "AI request failed";
}

/** Extract a server-sent-event frame into its name and JSON payload. */
export function parseSseFrame(frame: string): { name: string; payload: any } | null {
  const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
  const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) return null;
  return {
    name: eventLine.slice(6).trim(),
    payload: JSON.parse(dataLine.slice(5).trim()),
  };
}
