"""Local Ollama embeddings only. Chat generation stays on hosted APIs."""

import httpx

from .base import ProviderError


class OllamaEmbedder:
    provider_id = "ollama"

    def __init__(self, host: str, model: str):
        self.host = host.rstrip("/")
        self.model = model

    async def embed_many(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"{self.host}/api/embed",
                json={"model": self.model, "input": texts},
            )
        if response.status_code >= 400:
            raise ProviderError(response.text[:400], "embed_failed")
        data = response.json()
        embeddings = data.get("embeddings")
        if not embeddings or len(embeddings) != len(texts):
            raise ProviderError("Ollama returned no embeddings", "embed_failed")
        return embeddings

    async def embed(self, text: str) -> list[float]:
        return (await self.embed_many([text]))[0]
