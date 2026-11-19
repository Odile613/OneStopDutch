/**
 * Same-origin AI backend for OneStopDutch.
 *
 * Mirrors server/chat_api.py so the deployed site does not depend on a
 * separate, externally hosted Python service (which caused "Failed to fetch").
 * Local development still proxies /api to the Python app via vite.config.ts.
 */
import {
  GRAMMAR_SYSTEM_PROMPT,
  MODEL_CONFIG,
  VOCAB_SYSTEM_PROMPT,
} from "./_lib/generated.mjs";
import { ProviderError, availableProviders, resolve } from "./_lib/providers.mjs";

export const config = { path: "/api/*" };

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const FOLLOWUP_INSTRUCTIONS = `
A structured explanation has already been generated and shown to the user.
Never regenerate or overwrite it. Answer the follow-up question conversationally.
Use the same explanation language as the initial result unless the user
explicitly asks to change language. Keep any English translations in English.
Do not repeat the full structured JSON unless the user explicitly asks for it.`;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function sseStream(emitter) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  void (async () => {
    try {
      for await (const event of emitter()) {
        await writer.write(
          encoder.encode(`event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`),
        );
      }
    } catch (error) {
      const message =
        error instanceof ProviderError ? error.message : "AI request failed";
      await writer.write(
        encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`),
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

async function requireUser(request) {
  if (!SUPABASE_URL) throw new HttpError(500, "Supabase is not configured");
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new HttpError(401, "Login required");
  const token = header.slice(7).trim();
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (response.status !== 200) throw new HttpError(401, "Invalid or expired login");
  return response.json();
}

function defaultRef() {
  const providers = availableProviders(MODEL_CONFIG);
  const configured = MODEL_CONFIG.default || "";
  const match = configured.split(":", 2);
  if (
    configured &&
    providers.some(
      (provider) =>
        provider.id === match[0] && provider.models.some((model) => model.id === match[1]),
    )
  ) {
    return configured;
  }
  if (providers.length) {
    return `${providers[0].id}:${providers[0].models[0].id}`;
  }
  throw new ProviderError("No AI providers are configured", "no_providers");
}

function selectModel(body) {
  const provider = body?.provider;
  const model = body?.model;
  if (Boolean(provider) !== Boolean(model)) {
    throw new ProviderError("Provider and model must be selected together", "invalid_model");
  }
  const ref = provider && model ? `${provider}:${model}` : defaultRef();
  return { ref, adapter: resolve(ref, MODEL_CONFIG), modelId: ref.split(":", 2)[1] };
}

function providerHttpError(error, ref) {
  const provider = ref.split(":", 1)[0];
  return json(
    {
      detail: {
        error: {
          code: error.code,
          message: error.message,
          provider,
          model: ref.split(":", 2)[1] || "",
        },
      },
    },
    502,
  );
}

function systemPrompt(mode) {
  return mode === "vocab" ? VOCAB_SYSTEM_PROMPT : GRAMMAR_SYSTEM_PROMPT;
}

function parseJsonResponse(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // try fenced or bare JSON
  }
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const candidate = fenced ? fenced[1] : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (candidate) return JSON.parse(candidate);
  throw new Error("Model did not return valid JSON");
}

function explainMessages(mode, query) {
  return [{ role: "system", content: systemPrompt(mode) }, { role: "user", content: query }];
}

const LABELS = {
  breakdown: "Breakdown",
  structure: "Structure",
  order: "Word order",
  takeaway: "Takeaway",
  example: "Example",
  examples: "Examples",
  formation: "Formation",
  conjugation: "Conjugation",
  notes: "Notes",
  dutch: "Dutch",
  english: "English",
  partOfSpeech: "Part of speech",
  part_of_speech: "Part of speech",
  meaning: "Meaning",
  explanation: "Explanation",
};

function firstString(source, keys) {
  for (const key of keys) {
    if (typeof source?.[key] === "string" && source[key].trim()) return source[key].trim();
  }
  return "";
}

function cleanTitle(value) {
  return value.replace(/\*\*/g, "").trim();
}

function renderExplanation(result, consumed) {
  const lines = [];
  for (const [key, value] of Object.entries(result)) {
    if (consumed.has(key) || value == null || value === "") continue;
    const label = LABELS[key] || key;
    if (Array.isArray(value)) {
      lines.push(`**${label}**`, "");
      for (const item of value) {
        if (typeof item === "string") {
          lines.push(item.startsWith("- ") || item.startsWith("• ") ? item : `- ${item}`);
        } else if (item && typeof item === "object") {
          const parts = [
            item.word || item.term || item.dutch,
            item.meaning || item.translation || item.english,
            item.explanation || item.note || item.function,
          ].filter(Boolean);
          if (parts.length) lines.push(`- ${parts.join(" — ")}`);
        }
      }
      lines.push("");
    } else if (typeof value === "object") {
      lines.push(`**${label}**`, "");
      for (const [subKey, subValue] of Object.entries(value)) {
        lines.push(`*${LABELS[subKey] || subKey}:* ${subValue}`);
      }
      lines.push("");
    } else {
      lines.push(`**${label}**`, String(value), "");
    }
  }
  return lines.join("\n").trim();
}

const EXAMPLE_KEYS = [
  "example", "examples", "example_dutch", "example_english",
  "exampleDutch", "exampleEnglish",
];

/** Collect the model's example fields into plain Dutch/English lines. */
function exampleLines(result) {
  const example = result.example;
  let dutch = firstString(result, ["example_dutch", "exampleDutch"]);
  let english = firstString(result, ["example_english", "exampleEnglish"]);
  if (example && typeof example === "object") {
    dutch = dutch || firstString(example, ["dutch", "nl"]);
    english = english || firstString(example, ["english", "en"]);
  }
  const lines = [dutch, english].filter(Boolean);
  if (lines.length) return lines;
  if (typeof example === "string" && example.trim()) return [example.trim()];
  if (Array.isArray(result.examples)) {
    return result.examples.filter((item) => typeof item === "string");
  }
  return [];
}

/** Map a model's ad-hoc JSON keys onto the fields the note panel renders. */
function normalizeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const out = { ...result };
  const title = firstString(result, [
    "word_or_phrase", "word", "original_sentence", "original", "sentence",
  ]);
  const translation = firstString(result, [
    "english_translation", "translation", "english",
  ]);
  const vocabCategory = firstString(result, [
    "vocabulary_category", "partOfSpeech", "part_of_speech", "pos", "category",
  ]);
  const grammarCategory = firstString(result, [
    "grammar_category", "grammar_point", "topic",
  ]);
  if (title) {
    out.word_or_phrase = cleanTitle(title);
    out.original_sentence = cleanTitle(title);
  }
  if (translation) out.english_translation = translation;
  if (vocabCategory) out.vocabulary_category = vocabCategory;
  if (grammarCategory) out.grammar_category = grammarCategory;
  if (!firstString(result, ["explanation"])) {
    const consumed = new Set([
      "word_or_phrase", "word", "original_sentence", "original", "sentence",
      "english_translation", "translation", "english", "vocabulary_category",
      "grammar_category", "partOfSpeech", "part_of_speech", "pos", "category",
      "grammar_point", "topic", "explanation", ...EXAMPLE_KEYS,
    ]);
    let body = renderExplanation(result, consumed);
    const example = exampleLines(result);
    if (example.length) {
      body = `**Example**\n${example.join("\n")}${body ? `\n\n${body}` : ""}`;
    }
    out.explanation = body.trim();
  }
  return out;
}

function followupMessages(mode, query, initial, history) {
  const original = initial?.word_or_phrase || initial?.original_sentence || "";
  const messages = [
    {
      role: "system",
      content: `${systemPrompt(mode)}\n\n---\n${FOLLOWUP_INSTRUCTIONS}`,
    },
    {
      role: "user",
      content:
        `Original query: ${JSON.stringify(original)}\n` +
        `Initial structured result: ${JSON.stringify(initial)}`,
    },
  ];
  for (const item of history || []) {
    if (item.role === "user" || item.role === "assistant") {
      messages.push({ role: item.role, content: item.content });
    }
  }
  messages.push({ role: "user", content: query });
  return messages;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

async function handleHealth() {
  let defaultModel = null;
  try {
    defaultModel = defaultRef();
  } catch {
    // no providers configured
  }
  return json({
    status: "ok",
    supabase_configured: Boolean(SUPABASE_URL && SERVICE_KEY),
    default_model: defaultModel,
    providers: availableProviders(MODEL_CONFIG).map((provider) => provider.id),
  });
}

export default async function chat(request) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api/, "") || "/";
    const method = request.method;

    if (path === "/health" && method === "GET") return handleHealth();

    if (path === "/models" && method === "GET") {
      await requireUser(request);
      return json({
        default: defaultRef(),
        providers: availableProviders(MODEL_CONFIG),
      });
    }

    if (["/explain", "/explain/stream", "/followup/stream", "/chat/stream"].includes(path)) {
      if (method !== "POST") return json({ detail: "Method not allowed" }, 405);
      await requireUser(request);
      const body = await readBody(request);
      const query = (body.query || "").trim();
      if (path.startsWith("/explain") && !query) {
        throw new HttpError(400, "Empty query");
      }
      if (path === "/followup/stream" && !query) {
        throw new HttpError(400, "Empty question");
      }

      let selection;
      try {
        selection = selectModel(body);
      } catch (error) {
        if (error instanceof ProviderError) return providerHttpError(error, "none:none");
        throw error;
      }
      const { adapter, modelId, ref } = selection;
      let providerMessages;
      let jsonMode = false;
      if (path === "/explain" || path === "/explain/stream") {
        providerMessages = explainMessages(body.mode, query);
        jsonMode = true;
      } else if (path === "/followup/stream") {
        providerMessages = followupMessages(body.mode, query, body.initial, body.messages);
      } else {
        providerMessages = (body.messages || [])
          .filter((item) => item.role === "user" || item.role === "assistant")
          .map((item) => ({ role: item.role, content: item.content }));
      }
      const generate = () => adapter.chatStream(providerMessages, modelId, jsonMode);

      if (path === "/explain") {
        let raw = "";
        for await (const token of generate()) raw += token;
        let result;
        try {
          result = normalizeResult(parseJsonResponse(raw));
        } catch (error) {
          return json({ detail: `Invalid AI response: ${error.message}` }, 502);
        }
        return json({ mode: body.mode, model: ref, result, sources: [] });
      }

      if (path === "/explain/stream") {
        return sseStream(async function* () {
          yield { name: "sources", data: [] };
          let raw = "";
          for await (const token of generate()) {
            raw += token;
            yield { name: "token", data: { text: token } };
          }
          let result;
          try {
            result = normalizeResult(parseJsonResponse(raw));
          } catch {
            result = { explanation: raw };
          }
          yield { name: "result", data: result };
          yield { name: "done", data: {} };
        });
      }

      if (path === "/followup/stream") {
        return sseStream(async function* () {
          for await (const token of generate()) {
            yield { name: "token", data: { text: token } };
          }
          yield { name: "done", data: {} };
        });
      }

      return sseStream(async function* () {
        yield { name: "sources", data: [] };
        for await (const token of generate()) {
          yield { name: "token", data: { text: token } };
        }
        yield { name: "done", data: {} };
      });
    }

    return json({ detail: "Not found" }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ detail: error.message }, error.status);
    if (error instanceof ProviderError) return providerHttpError(error, "none:none");
    console.error("AI function error:", error);
    return json({ detail: "Internal server error" }, 500);
  }
}
