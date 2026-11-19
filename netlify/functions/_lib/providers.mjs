/** Hosted model adapters used by the Netlify AI Function. */

export class ProviderError extends Error {
  constructor(message, code = "provider_error") {
    super(message);
    this.code = code;
  }
}

const OPENAI_COMPATIBLE_BASE_URLS = {
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  xai: "https://api.x.ai/v1",
};

function errorMessage(response, body) {
  const message = body?.error?.message || body?.message || body || response.statusText;
  return String(message).slice(0, 400);
}

function errorCode(status) {
  if (status === 401) return "invalid_key";
  if (status === 429) return "quota_exceeded";
  if (status >= 500) return "provider_unavailable";
  return "provider_error";
}

/** Yield complete lines from an HTTP stream, including lines split across chunks. */
async function* lines(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) yield part.trim();
  }
  if (buffer.trim()) yield buffer.trim();
}

async function* sseData(response) {
  for await (const line of lines(response)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      yield JSON.parse(payload);
    } catch {
      // Ignore malformed provider frames rather than breaking the whole stream.
    }
  }
}

function systemText(messages) {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
}

function contents(messages) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

class GeminiAdapter {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async *chatStream(messages, model, jsonMode = false) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText(messages) }] },
          contents: contents(messages),
          generationConfig: {
            temperature: 0.3,
            ...(jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => response.text());
      throw new ProviderError(errorMessage(response, body), errorCode(response.status));
    }
    for await (const data of sseData(response)) {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((part) => part.text || "").join("");
      if (text) yield text;
    }
  }
}

class OpenAICompatibleAdapter {
  constructor(providerId, baseUrl, apiKey) {
    this.providerId = providerId;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async *chatStream(messages, model, jsonMode = false) {
    // Groq (and other OpenAI-compatible APIs) require the word "json" in the
    // messages when response_format=json_object is used.
    const requestMessages = jsonMode
      ? [...messages, { role: "system", content: "Respond with a single valid JSON object." }]
      : messages;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: requestMessages,
        temperature: 0.3,
        stream: true,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => response.text());
      throw new ProviderError(errorMessage(response, body), errorCode(response.status));
    }
    for await (const data of sseData(response)) {
      const text = data?.choices?.[0]?.delta?.content || "";
      if (text) yield text;
    }
  }
}

export function availableProviders(config) {
  const result = [];
  for (const [id, raw] of Object.entries(config.providers || {})) {
    const key = process.env[raw.apiKeyEnv];
    if (!raw.enabled || !key) continue;
    const models = (raw.models || [])
      .filter((model) => model.enabled !== false)
      .map((model) => ({ id: model.id, label: model.label }));
    if (models.length) result.push({ id, label: raw.label, models });
  }
  return result;
}

export function resolve(ref, config) {
  const index = ref.indexOf(":");
  if (index < 0) throw new ProviderError("Invalid model reference", "invalid_model");
  const providerId = ref.slice(0, index);
  const modelId = ref.slice(index + 1);
  const raw = config.providers?.[providerId];
  const key = raw && process.env[raw.apiKeyEnv];
  if (!raw || !raw.enabled || !key) {
    throw new ProviderError(`${providerId} is not configured or is disabled`, "model_unavailable");
  }
  if (!(raw.models || []).some((model) => model.id === modelId && model.enabled !== false)) {
    throw new ProviderError(`Model ${modelId} is not available`, "model_unavailable");
  }
  if (providerId === "gemini") return new GeminiAdapter(key);
  if (OPENAI_COMPATIBLE_BASE_URLS[providerId]) {
    return new OpenAICompatibleAdapter(
      providerId,
      OPENAI_COMPATIBLE_BASE_URLS[providerId],
      key,
    );
  }
  throw new ProviderError(`Unsupported provider ${providerId}`, "model_unavailable");
}
