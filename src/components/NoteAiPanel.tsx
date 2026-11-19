import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { splitModelRef } from "../lib/aiModels";
import {
  CHAT_API_URL,
  describeChatFetchError,
  parseSseFrame,
  readChatError,
} from "../lib/chatApi";
import { AI_EXPLAIN_EVENT } from "../lib/notes";
import { Icon } from "./Icon";

type AiMode = "vocab" | "grammar";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Source {
  page: number;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  function flushBullets() {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {bullets.map((item, index) => (
          <li key={index}>{inline(item)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      bullets.push(trimmed.slice(2));
      continue;
    }
    flushBullets();
    if (!trimmed) continue;
    if (trimmed.startsWith("## ")) {
      blocks.push(<h4 key={`h-${blocks.length}`}>{inline(trimmed.slice(3))}</h4>);
    } else {
      blocks.push(<p key={`p-${blocks.length}`}>{inline(trimmed)}</p>);
    }
  }
  flushBullets();
  return <div className="note-ai__markdown">{blocks}</div>;
}

/** Pull the explanation field out of a partially streamed JSON response. */
function extractExplanation(raw: string): string {
  const marker = '"explanation"';
  const at = raw.indexOf(marker);
  if (at < 0) return "";
  const colon = raw.indexOf(":", at + marker.length);
  if (colon < 0) return "";
  let index = colon + 1;
  while (index < raw.length && /\s/.test(raw[index])) index += 1;
  if (raw[index] !== '"') return "";
  index += 1;
  let out = "";
  while (index < raw.length) {
    const char = raw[index];
    if (char === "\\") {
      const next = raw[index + 1];
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else if (next) out += next;
      index += 2;
      continue;
    }
    if (char === '"') break;
    out += char;
    index += 1;
  }
  return out;
}

export default function NoteAiPanel({
  mode,
  query,
  accessToken,
  selectedModel,
}: {
  mode: AiMode;
  query: string;
  accessToken: string | null;
  selectedModel: string;
}) {
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const pendingAsk = useRef(false);

  function headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };
  }

  function modelFields() {
    const { provider, model } = splitModelRef(selectedModel);
    return { provider, model };
  }

  async function search() {
    // An empty selectedModel is fine: the backend falls back to its default.
    if (!accessToken || !query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSources([]);
    setMessages([]);
    setStreamText("");
    try {
      const response = await fetch(`${CHAT_API_URL}/explain/stream`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ mode, query, ...modelFields() }),
      });
      if (!response.ok) throw new Error(await readChatError(response));
      if (!response.body) throw new Error("AI request failed");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const frame = parseSseFrame(part);
          if (!frame) continue;
          if (frame.name === "sources") setSources(frame.payload);
          else if (frame.name === "token") {
            raw += frame.payload.text ?? "";
            setStreamText(extractExplanation(raw));
          } else if (frame.name === "result") setResult(frame.payload);
          else if (frame.name === "error") {
            throw new Error(frame.payload.message || "AI request failed");
          }
        }
      }
    } catch (cause) {
      setError(describeChatFetchError(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const requested = (event as CustomEvent<{ mode?: AiMode }>).detail?.mode;
      if (requested && requested !== mode) return;
      if (!accessToken) return;
      // Switching note type remounts this panel, so models may still be
      // loading when the ask event arrives. Run it once they are ready.
      if (!selectedModel) {
        pendingAsk.current = true;
        return;
      }
      void search();
    };
    window.addEventListener(AI_EXPLAIN_EVENT, handler);
    return () => window.removeEventListener(AI_EXPLAIN_EVENT, handler);
  });

  useEffect(() => {
    if (!pendingAsk.current || !selectedModel) return;
    pendingAsk.current = false;
    void search();
  }, [selectedModel]);

  async function sendFollowup(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || !result || chatting || !accessToken) return;
    setInput("");
    setError(null);
    setChatting(true);
    setMessages((current) => [
      ...current,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    const assistantIndex = messages.length + 1;

    try {
      const response = await fetch(`${CHAT_API_URL}/followup/stream`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          mode,
          query: question,
          initial: result,
          messages,
          ...modelFields(),
        }),
      });
      if (!response.ok) throw new Error(await readChatError(response));
      if (!response.body) throw new Error("AI request returned no content");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const frame = parseSseFrame(part);
          if (!frame) continue;
          if (frame.name === "token") {
            setMessages((current) =>
              current.map((message, index) =>
                index === assistantIndex
                  ? { ...message, content: message.content + frame.payload.text }
                  : message,
              ),
            );
          } else if (frame.name === "error") {
            throw new Error(frame.payload.message || "Follow-up failed");
          }
        }
      }
    } catch (cause) {
      setError(describeChatFetchError(cause));
    } finally {
      setChatting(false);
    }
  }

  const title = result?.word_or_phrase || result?.original_sentence || "";
  const translation = result?.english_translation || result?.translation || "";
  const category = result?.vocabulary_category || result?.grammar_category || "";

  return (
    <div className="note-ai">
      <div className="note-ai__body">
      {loading && <p className="note-ai__status">Generating explanation…</p>}
      {error && <p className="note-ai__error">{error}</p>}

      {streamText && !result && (
        <div className="note-ai__result">
          <Markdown text={streamText} />
        </div>
      )}

      {result && (
        <div className="note-ai__result">
          <p className="note-ai__title">{title}</p>
          {translation && <p className="note-ai__translation">{translation}</p>}
          {category && <p className="note-ai__category">[{category}]</p>}
          {result.explanation && <Markdown text={result.explanation} />}
          {sources.length > 0 && (
            <p className="note-ai__sources">
              {sources.map((source) => `p. ${source.page}`).join(" · ")}
            </p>
          )}

          <div className="note-ai__chat">
            {messages.map((message, index) => (
              <p
                key={index}
                className={`note-ai__message note-ai__message--${message.role}`}
              >
                {message.content || (chatting ? "…" : "")}
              </p>
            ))}
          </div>
        </div>
      )}

      </div>

      {result && (
        <form className="note-ai__form" onSubmit={sendFollowup}>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask a follow-up…"
            aria-label="Follow-up question"
            disabled={!accessToken || chatting}
          />
          <button
            type="submit"
            className="note-ai__send"
            aria-label="Send follow-up"
            title="Send follow-up"
            disabled={!input.trim() || chatting}
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      )}
    </div>
  );
}
