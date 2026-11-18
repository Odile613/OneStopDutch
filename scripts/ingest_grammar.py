#!/usr/bin/env python3
"""Chunk the OCR'd grammar book, embed with Gemini, and load Supabase pgvector.

Server-side only: uses the Supabase service-role key and Gemini API key.
"""

import argparse
import asyncio
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server.providers.base import ProviderError
from server.providers.ollama_embed import OllamaEmbedder


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


def chunk_text(text: str, size: int, overlap: int) -> list[str]:
    text = " ".join(text.split())
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            target = end - overlap
            space = text.rfind(" ", max(start + 1, target), end)
            if space > start:
                end = space
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
        while start < len(text) and text[start].isspace():
            start += 1
    return chunks


def supabase_request(url: str, key: str, method: str, payload=None) -> str:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read().decode("utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pages",
        default="source-materials/grammar-chat/grammarbook-pages.jsonl",
    )
    parser.add_argument("--source", default="grammarbook.pdf")
    parser.add_argument("--chunk-size", type=int, default=1000)
    parser.add_argument("--overlap", type=int, default=150)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--skip-delete", action="store_true")
    parser.add_argument("--start-chunk", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    env = load_env()
    ollama_host = env.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
    ollama_model = env.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    supabase_url = env.get("SUPABASE_URL", env.get("VITE_SUPABASE_URL", "")).rstrip("/")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        raise SystemExit("Missing Supabase server configuration in .env.local")

    entries = []
    for line in Path(args.pages).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        if entry.get("text", "").strip():
            entries.append(entry)
    if args.max_pages:
        entries = entries[: args.max_pages]

    chunks = []
    for entry in entries:
        for index, text in enumerate(
            chunk_text(entry["text"], args.chunk_size, args.overlap)
        ):
            chunks.append(
                {
                    "source": args.source,
                    "page": int(entry["page"]),
                    "chunk_index": index,
                    "content": text,
                }
            )
    if args.start_chunk:
        chunks = chunks[args.start_chunk :]
    print(f"Prepared {len(chunks)} chunks from {len(entries)} pages", flush=True)
    if args.dry_run:
        return

    adapter = OllamaEmbedder(ollama_host, ollama_model)
    if not args.skip_delete:
        delete_url = (
            supabase_url
            + "/rest/v1/grammar_chunks?source=eq."
            + urllib.parse.quote(args.source)
        )
        supabase_request(delete_url, service_key, "DELETE")
        print(f"Cleared existing chunks for {args.source}", flush=True)

    insert_url = supabase_url + "/rest/v1/grammar_chunks"
    for start in range(0, len(chunks), args.batch_size):
        batch = chunks[start : start + args.batch_size]
        try:
            embeddings = asyncio.run(
                adapter.embed_many([chunk["content"] for chunk in batch])
            )
        except ProviderError as error:
            if error.code == "quota_exceeded":
                print(
                    "\nGemini embedding quota is exhausted for today.\n"
                    "The database already contains the chunks uploaded before this point.\n"
                    "Wait for the quota reset, or use a new Google project/API key,\n"
                    "then rerun this script with --skip-delete --start-chunk <next chunk>.\n",
                    flush=True,
                )
                return
            raise
        if len(embeddings) != len(batch):
            raise SystemExit("Embedding count did not match batch size")
        rows = []
        for chunk, embedding in zip(batch, embeddings):
            if len(embedding) != 768:
                raise SystemExit(f"Unexpected embedding size: {len(embedding)}")
            rows.append({**chunk, "embedding": embedding})
        supabase_request(insert_url, service_key, "POST", rows)
        print(
            f"Uploaded {min(start + args.batch_size, len(chunks))}/{len(chunks)}",
            flush=True,
        )
    print("Grammar ingestion complete", flush=True)


if __name__ == "__main__":
    import urllib.parse

    main()
