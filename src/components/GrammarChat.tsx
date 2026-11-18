import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { useLocalStorage } from "../lib/useLocalStorage";
import {
  fetchAiModels,
  fetchAiPreferences,
  saveAiPreferences,
  splitModelRef,
  type AiModelsResponse,
} from "../lib/aiModels";
import AiModelSelector from "./AiModelSelector";
import { Icon } from "./Icon";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Source {
  page: number;
  similarity: number;
}

const API_URL = import.meta.env.VITE_CHAT_API_URL || "http://localhost:8000";

export default function GrammarChat() {
  const { user, accessToken } = useAuth();
  // Kept in storage so the conversation survives leaving and revisiting the page.
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>(
    "onestopdutch-grammar-chat",
    [],
  );
  const [sources, setSources] = useLocalStorage<Source[]>(
    "onestopdutch-grammar-chat-sources",
    [],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [aiModels, setAiModels] = useState<AiModelsResponse | null>(null);
  const [defaultModel, setDefaultModel] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

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
        // Model loading is best-effort; chat falls back to the server default.
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

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // Keep the newest message in view as the conversation grows or streams in.
  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages]);

  function clearChat() {
    setMessages([]);
    setSources([]);
    setError(null);
    setCopiedIndex(null);
  }

  async function copyMessage(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      // Clipboard access can be unavailable (e.g. insecure contexts).
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    if (!user || !accessToken) {
      setError("Sign in to ask the grammar book.");
      return;
    }

    const { provider, model } = splitModelRef(selectedModel);
    setError(null);
    setSources([]);
    setBusy(true);
    setInput("");
    setMessages((current) => [
      ...current,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);

    const assistantIndex = messages.length + 1;

    try {
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: question }],
          provider,
          model,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed (${response.status})`);
      }

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
          const eventLine = part.split("\n").find((line) => line.startsWith("event:"));
          const dataLine = part.split("\n").find((line) => line.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const eventName = eventLine.slice(6).trim();
          const payload = JSON.parse(dataLine.slice(5).trim());

          if (eventName === "sources") {
            setSources(payload);
          } else if (eventName === "token") {
            setMessages((current) =>
              current.map((message, index) =>
                index === assistantIndex
                  ? { ...message, content: message.content + payload.text }
                  : message,
              ),
            );
          }
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  const clearButton = (
    <button
      type="button"
      className="grammar-chat__clear"
      onClick={clearChat}
      disabled={busy || messages.length === 0}
      aria-label="Clear chat"
      title="Clear chat"
    >
      <Icon name="trash" size={15} />
    </button>
  );

  return (
    <section className="grammar-chat notes-list--panel" aria-label="Ask the grammar book">
      <div className="notes-panel__head">
        <h2>Ask the grammar book</h2>
        <div className="grammar-chat__model">
          {accessToken ? (
            <AiModelSelector
              models={aiModels}
              value={selectedModel}
              defaultModel={defaultModel}
              onChange={(ref) => void changeModel(ref)}
              onSetDefault={() => void setDefault()}
              disabled={busy}
              trailing={clearButton}
            />
          ) : (
            <>
              <span className="note-model-hint">Sign in to choose an AI model</span>
              {clearButton}
            </>
          )}
        </div>
      </div>

      <div className="grammar-chat__body">
        <div className="grammar-chat__messages" ref={messagesRef}>
          {messages.map((message, index) => (
            <div
              key={index}
              className={`grammar-chat__message grammar-chat__message--${message.role}`}
            >
              <span className="grammar-chat__message-text">
                {message.content || (busy && index === messages.length - 1 ? "…" : "")}
              </span>
              {message.role === "assistant" && message.content && (
                <div className="grammar-chat__message-actions">
                  <button
                    type="button"
                    className="grammar-chat__copy"
                    onClick={() => void copyMessage(index, message.content)}
                    aria-label={copiedIndex === index ? "Copied" : "Copy response"}
                    title={copiedIndex === index ? "Copied" : "Copy response"}
                  >
                    <Icon name={copiedIndex === index ? "check" : "copy"} size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {sources.length > 0 && (
          <div className="grammar-chat__sources">
            {sources.map((source) => (
              <span key={source.page}>p. {source.page}</span>
            ))}
          </div>
        )}

        {error && <p className="grammar-chat__error">{error}</p>}

        <form className="grammar-chat__form" onSubmit={send}>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              user
                ? "Ask a question about Dutch. Answers come mainly from books…"
                : "Sign in to ask…"
            }
            aria-label="Your grammar question"
            disabled={!user || busy}
          />
          <button
            type="submit"
            className="note-ai__send"
            aria-label="Send question"
            title="Send question"
            disabled={!user || busy || !input.trim()}
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      </div>
    </section>
  );
}
