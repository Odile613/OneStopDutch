import asyncio
import json
from typing import AsyncIterator

import httpx

from .base import ProviderAdapter, ProviderError

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiAdapter(ProviderAdapter):
    provider_id = "gemini"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {"x-goog-api-key": self.api_key, "Content-Type": "application/json"}

    @staticmethod
    def _contents(messages: list[dict]) -> list[dict]:
        contents = []
        for message in messages:
            if message["role"] == "system":
                continue
            role = "model" if message["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": message["content"]}]})
        return contents

    @staticmethod
    def _system(messages: list[dict]) -> str:
        return "\n\n".join(
            message["content"] for message in messages if message["role"] == "system"
        )

    @staticmethod
    def _text(data: dict) -> str:
        candidates = data.get("candidates") or []
        if not candidates:
            return ""
        parts = candidates[0].get("content", {}).get("parts") or []
        return "".join(part.get("text", "") for part in parts)

    async def chat_json(self, messages: list[dict], model: str) -> str:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(
                f"{BASE_URL}/models/{model}:generateContent",
                headers=self._headers(),
                json={
                    "system_instruction": {"parts": [{"text": self._system(messages)}]},
                    "contents": self._contents(messages),
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "temperature": 0.3,
                    },
                },
            )
        if response.status_code >= 400:
            raise ProviderError(self._error_message(response), self._error_code(response))
        return self._text(response.json())

    async def chat_stream(
        self, messages: list[dict], model: str, json_mode: bool = False
    ) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{BASE_URL}/models/{model}:streamGenerateContent?alt=sse",
                headers=self._headers(),
                json={
                    "system_instruction": {"parts": [{"text": self._system(messages)}]},
                    "contents": self._contents(messages),
                    "generationConfig": {
                        "temperature": 0.3,
                        **({"responseMimeType": "application/json"} if json_mode else {}),
                    },
                },
            ) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    error_response = httpx.Response(
                        response.status_code, content=body, request=response.request
                    )
                    raise ProviderError(
                        self._error_message(error_response),
                        self._error_code(error_response),
                    )
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    payload = line[5:].strip() if line.startswith("data:") else line
                    if not payload:
                        continue
                    data = json.loads(payload)
                    token = self._text(data)
                    if token:
                        yield token

    async def embed_many(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        payload = {
            "requests": [
                {
                    "model": "models/gemini-embedding-001",
                    "content": {"parts": [{"text": text}]},
                    "outputDimensionality": 768,
                }
                for text in texts
            ]
        }
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"{BASE_URL}/models/gemini-embedding-001:batchEmbedContents",
                headers=self._headers(),
                json=payload,
            )
        if response.status_code >= 400:
            raise ProviderError(self._error_message(response), self._error_code(response))
        data = response.json()
        return [item["values"] for item in data["embeddings"]]

    async def embed(self, text: str) -> list[float]:
        vectors = await self.embed_many([text])
        return vectors[0]

    @staticmethod
    def _error_code(response: httpx.Response) -> str:
        if response.status_code == 401:
            return "invalid_key"
        if response.status_code == 429:
            return "quota_exceeded"
        if response.status_code >= 500:
            return "provider_unavailable"
        return "provider_error"

    @staticmethod
    def _error_message(response: httpx.Response) -> str:
        try:
            body = response.json()
            message = body.get("error", {}).get("message") or response.text
        except Exception:
            message = response.text
        return str(message)[:400]
