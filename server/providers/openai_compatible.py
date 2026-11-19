import json
from typing import AsyncIterator

import httpx

from .base import ProviderAdapter, ProviderError


class OpenAICompatibleAdapter(ProviderAdapter):
    """Adapter for Groq, Mistral, OpenRouter and xAI (OpenAI-style API)."""

    def __init__(self, provider_id: str, base_url: str, api_key: str):
        self.provider_id = provider_id
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _json_messages(messages: list[dict]) -> list[dict]:
        # OpenAI-compatible APIs such as Groq require the word "json" in the
        # messages when response_format=json_object is requested.
        return [
            *messages,
            {"role": "system", "content": "Respond with a single valid JSON object."},
        ]

    async def chat_json(self, messages: list[dict], model: str) -> str:
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json={
                    "model": model,
                    "messages": self._json_messages(messages),
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"},
                },
            )
        if response.status_code >= 400:
            raise ProviderError(
                self._error_message(response), self._error_code(response.status_code)
            )
        return response.json()["choices"][0]["message"]["content"]

    async def chat_stream(
        self, messages: list[dict], model: str, json_mode: bool = False
    ) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json={
                    "model": model,
                    "messages": self._json_messages(messages) if json_mode else messages,
                    "temperature": 0.3,
                    "stream": True,
                    **({"response_format": {"type": "json_object"}} if json_mode else {}),
                },
            ) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    error_response = httpx.Response(
                        response.status_code, content=body, request=response.request
                    )
                    raise ProviderError(
                        self._error_message(error_response),
                        self._error_code(response.status_code),
                    )
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    data = json.loads(payload)
                    choices = data.get("choices") or []
                    if not choices:
                        continue
                    token = choices[0].get("delta", {}).get("content", "")
                    if token:
                        yield token

    @staticmethod
    def _error_code(status: int) -> str:
        if status == 401:
            return "invalid_key"
        if status == 429:
            return "quota_exceeded"
        if status >= 500:
            return "provider_unavailable"
        return "provider_error"

    @staticmethod
    def _error_message(response: httpx.Response) -> str:
        try:
            body = response.json()
            message = (
                body.get("error", {}).get("message")
                or body.get("message")
                or response.text
            )
        except Exception:
            message = response.text
        return f"{message}"[:400]
