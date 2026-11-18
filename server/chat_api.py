"""Hosted AI chat API for OneStopDutch.

Keys stay server-side (local .env.local or host environment variables).
Requests carry a Supabase access token. Grammar RAG uses Ollama embeddings
and Supabase pgvector when available; otherwise answers omit book excerpts.
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import AsyncIterator, Literal

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .providers.base import ProviderError
from .providers import registry
from .providers.ollama_embed import OllamaEmbedder


def load_env(path: str = ".env.local") -> dict[str, str]:
    values: dict[str, str] = {}
    env_file = Path(path)
    if not env_file.exists():
        return values
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


ENV = load_env()
for _key, _value in ENV.items():
    os.environ.setdefault(_key, _value)

logger = logging.getLogger("onestopdutch.chat_api")


def env_value(name: str, fallback: str = "") -> str:
    """Prefer real environment variables (hosting platforms) over .env.local."""
    return os.getenv(name) or ENV.get(name, fallback)


SUPABASE_URL = env_value("SUPABASE_URL", env_value("VITE_SUPABASE_URL")).rstrip("/")
SERVICE_KEY = env_value("SUPABASE_SERVICE_ROLE_KEY")
OLLAMA_HOST = env_value("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_EMBED_MODEL = env_value("OLLAMA_EMBED_MODEL", "nomic-embed-text")
MATCH_COUNT = 5
PROMPT_DIR = Path(__file__).parent / "prompts"
VOCAB_SYSTEM_PROMPT = (PROMPT_DIR / "vocab.md").read_text(encoding="utf-8").strip()
GRAMMAR_SYSTEM_PROMPT = (PROMPT_DIR / "grammar.md").read_text(encoding="utf-8").strip()
LEGACY_GRAMMAR_PROMPT = (
    "Je bent een Nederlandse grammatica-assistent. Antwoord alleen op basis van "
    "de verstrekte boekfragmenten. Als het antwoord er niet in staat, zeg dat "
    "eerlijk. Verwijs naar paginanummers waar mogelijk. Antwoord in het Nederlands."
)
FOLLOWUP_INSTRUCTIONS = (
    "\n\n---\nA structured explanation has already been generated and shown to the "
    "user. Never regenerate or overwrite it. Answer the follow-up question "
    "conversationally. Use the same explanation language as the initial result "
    "unless the user explicitly asks to change language. Keep any English "
    "translations in English. Do not repeat the full structured JSON unless the "
    "user explicitly asks for it."
)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CHAT_ALLOWED_ORIGINS",
        ENV.get("CHAT_ALLOWED_ORIGINS", "http://localhost:4173,http://localhost:5173"),
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="OneStopDutch AI API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    provider: str | None = None
    model: str | None = None


class ExplainRequest(BaseModel):
    mode: Literal["vocab", "grammar"]
    query: str
    provider: str | None = None
    model: str | None = None


class FollowupRequest(BaseModel):
    mode: Literal["vocab", "grammar"]
    query: str
    initial: dict
    messages: list[Message]
    provider: str | None = None
    model: str | None = None


async def require_user(request: Request) -> dict:
    if not SUPABASE_URL:
        raise HTTPException(500, "Supabase is not configured")
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Login required")
    token = header[7:].strip()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {token}"},
        )
    if response.status_code != 200:
        raise HTTPException(401, "Invalid or expired login")
    return response.json()


def parse_json_response(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))
    bare = re.search(r"\{.*\}", text, re.DOTALL)
    if bare:
        return json.loads(bare.group(0))
    raise ValueError("Model did not return valid JSON")


def resolve_selection(provider: str | None, model: str | None) -> tuple[str, object]:
    if bool(provider) != bool(model):
        raise ProviderError("Provider and model must be selected together", "invalid_model")
    ref = f"{provider}:{model}" if provider and model else registry.default_ref()
    return ref, registry.resolve(ref)


def provider_http_error(error: ProviderError, ref: str) -> HTTPException:
    provider = ref.split(":", 1)[0]
    return HTTPException(
        status_code=502,
        detail={
            "error": {
                "code": error.code,
                "message": error.message,
                "provider": provider,
                "model": ref.split(":", 1)[1] if ":" in ref else "",
            }
        },
    )


async def chat_json(adapter, ref: str, messages: list[dict]) -> str:
    try:
        return await adapter.chat_json(messages, ref.split(":", 1)[1])
    except ProviderError as error:
        raise provider_http_error(error, ref)


async def chat_stream(
    adapter, ref: str, messages: list[dict], json_mode: bool = False
) -> AsyncIterator[str]:
    try:
        async for token in adapter.chat_stream(
            messages, ref.split(":", 1)[1], json_mode=json_mode
        ):
            yield token
    except ProviderError as error:
        raise provider_http_error(error, ref)


def system_prompt(mode: str) -> str:
    return VOCAB_SYSTEM_PROMPT if mode == "vocab" else GRAMMAR_SYSTEM_PROMPT


async def embed(text: str) -> list[float]:
    try:
        return await OllamaEmbedder(OLLAMA_HOST, OLLAMA_EMBED_MODEL).embed(text)
    except ProviderError as error:
        raise provider_http_error(error, f"ollama:{OLLAMA_EMBED_MODEL}")


async def search_chunks(vector: list[float]) -> list[dict]:
    if not SERVICE_KEY:
        raise HTTPException(500, "Service role key is not configured")
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/match_grammar_chunks",
            headers={
                "apikey": SERVICE_KEY,
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"query_embedding": vector, "match_count": MATCH_COUNT},
        )
        response.raise_for_status()
        return response.json()


def build_context(chunks: list[dict]) -> str:
    return "\n\n".join(
        f"[Pagina {chunk['page']}]\n{chunk['content']}" for chunk in chunks
    )


async def grammar_context(query: str) -> tuple[str, list[dict]]:
    """Best-effort book retrieval. On a host without Ollama/Supabase vectors the
    model still answers from its system prompt, just without book excerpts."""
    try:
        vector = await embed(query)
        chunks = await search_chunks(vector)
    except Exception as error:  # provider, HTTP or connection errors
        logger.warning("Grammar book retrieval unavailable: %s", error)
        return "", []
    sources = [
        {"page": chunk["page"], "similarity": chunk["similarity"]}
        for chunk in chunks
    ]
    return build_context(chunks), sources


async def build_explain_messages(mode: str, query: str) -> tuple[list[dict], list[dict]]:
    sources: list[dict] = []
    user_content = query
    if mode == "grammar":
        context, sources = await grammar_context(query)
        if context:
            user_content = (
                "Reference book excerpts:\n\n"
                + context
                + f"\n\nUser input: {query}"
            )
    return (
        [
            {"role": "system", "content": system_prompt(mode)},
            {"role": "user", "content": user_content},
        ],
        sources,
    )


async def build_followup_messages(
    mode: str, query: str, initial: dict, history: list[Message]
) -> list[dict]:
    context_note = ""
    if mode == "grammar":
        context, _ = await grammar_context(query)
        if context:
            context_note = "\n\nRelevant reference book excerpts:\n\n" + context
    original = initial.get("word_or_phrase") or initial.get("original_sentence") or ""
    messages = [
        {"role": "system", "content": system_prompt(mode) + FOLLOWUP_INSTRUCTIONS},
        {
            "role": "user",
            "content": (
                f"Original query: {json.dumps(original, ensure_ascii=False)}\n"
                f"Initial structured result: {json.dumps(initial, ensure_ascii=False)}"
            ),
        },
    ]
    for item in history:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": query + context_note})
    return messages


@app.get("/health")
async def health() -> dict:
    try:
        default = registry.default_ref()
    except ProviderError:
        default = None
    return {
        "status": "ok",
        "default_model": default,
        "embed_model": OLLAMA_EMBED_MODEL,
        "providers": [item["id"] for item in registry.available_providers()],
    }


@app.get("/models")
async def models(http_request: Request) -> dict:
    await require_user(http_request)
    return {"default": registry.default_ref(), "providers": registry.available_providers()}


@app.post("/explain")
async def explain(request: ExplainRequest, http_request: Request) -> dict:
    await require_user(http_request)
    query = request.query.strip()
    if not query:
        raise HTTPException(400, "Empty query")
    ref, adapter = resolve_selection(request.provider, request.model)
    messages, sources = await build_explain_messages(request.mode, query)
    raw = await chat_json(adapter, ref, messages)
    try:
        result = parse_json_response(raw)
    except (ValueError, json.JSONDecodeError) as error:
        raise HTTPException(502, f"Invalid AI response: {error}")
    return {
        "mode": request.mode,
        "model": ref,
        "result": result,
        "sources": sources,
    }


@app.post("/explain/stream")
async def explain_stream(request: ExplainRequest, http_request: Request):
    await require_user(http_request)
    query = request.query.strip()
    if not query:
        raise HTTPException(400, "Empty query")
    ref, adapter = resolve_selection(request.provider, request.model)
    messages, sources = await build_explain_messages(request.mode, query)

    async def events() -> AsyncIterator[str]:
        yield "event: sources\ndata: " + json.dumps(sources) + "\n\n"
        raw = ""
        async for token in chat_stream(adapter, ref, messages, json_mode=True):
            raw += token
            yield "event: token\ndata: " + json.dumps({"text": token}) + "\n\n"
        try:
            result = parse_json_response(raw)
        except (ValueError, json.JSONDecodeError):
            result = {"explanation": raw}
        yield "event: result\ndata: " + json.dumps(result) + "\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/followup/stream")
async def followup_stream(request: FollowupRequest, http_request: Request):
    await require_user(http_request)
    query = request.query.strip()
    if not query:
        raise HTTPException(400, "Empty question")
    ref, adapter = resolve_selection(request.provider, request.model)
    messages = await build_followup_messages(
        request.mode, query, request.initial, request.messages
    )

    async def events() -> AsyncIterator[str]:
        async for token in chat_stream(adapter, ref, messages):
            yield "event: token\ndata: " + json.dumps({"text": token}) + "\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.post("/chat")
async def chat(request: ChatRequest, http_request: Request) -> dict:
    await require_user(http_request)
    if not request.messages:
        raise HTTPException(400, "No messages")
    question = request.messages[-1].content.strip()
    if not question:
        raise HTTPException(400, "Empty question")
    ref, adapter = resolve_selection(request.provider, request.model)
    context, sources = await grammar_context(question)
    user_content = f"Vraag: {question}"
    if context:
        user_content = f"Boekfragmenten:\n\n{context}\n\nVraag: {question}"
    messages = [
        {"role": "system", "content": LEGACY_GRAMMAR_PROMPT},
        {"role": "user", "content": user_content},
    ]
    answer = await chat_json(adapter, ref, messages)
    return {"answer": answer, "model": ref, "sources": sources}


@app.post("/chat/stream")
async def chat_stream_endpoint(request: ChatRequest, http_request: Request):
    await require_user(http_request)
    if not request.messages:
        raise HTTPException(400, "No messages")
    question = request.messages[-1].content.strip()
    if not question:
        raise HTTPException(400, "Empty question")
    ref, adapter = resolve_selection(request.provider, request.model)
    # No local book embeddings and no system prompt for now: the hosted model
    # API answers directly from the conversation history.
    messages = [
        {"role": item.role, "content": item.content}
        for item in request.messages
        if item.role in ("user", "assistant")
    ]

    async def events() -> AsyncIterator[str]:
        yield "event: sources\ndata: []\n\n"
        async for token in chat_stream(adapter, ref, messages):
            yield "event: token\ndata: " + json.dumps({"text": token}) + "\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
