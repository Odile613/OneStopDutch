import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CHAT_API_URL,
  describeChatFetchError,
  parseSseFrame,
  readChatError,
} from "../lib/chatApi";
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
      } catch (cause) {
        // Chat still works with the server default; tell the user why the
        // model picker is empty instead of failing silently.
        if (active) {
          setError(
            `Could not load AI models (${cause instanceof Error ? cause.message : "unknown error"}). Using the server default.`,
          );
        }
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
      const response = await fetch(`${CHAT_API_URL}/chat/stream`, {
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

      if (!response.ok) throw new Error(await readChatError(response));
      if (!response.body) throw new Error("Chat request returned no content");

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

          if (frame.name === "sources") {
            setSources(frame.payload);
          } else if (frame.name === "token") {
            setMessages((current) =>
              current.map((message, index) =>
                index === assistantIndex
                  ? { ...message, content: message.content + frame.payload.text }
                  : message,
              ),
            );
          } else if (frame.name === "error") {
            throw new Error(frame.payload.message || "Chat failed");
          }
        }
      }
    } catch (cause) {
      setError(describeChatFetchError(cause));
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
            />
          ) : (
            <span className="note-model-hint">Sign in to choose an AI model</span>
          )}
        </div>
      </div>

      <div className="grammar-chat__body">
        {clearButton}
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
