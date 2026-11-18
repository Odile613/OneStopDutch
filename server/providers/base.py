from dataclasses import dataclass
from typing import AsyncIterator


class ProviderError(Exception):
    """A user-facing provider/API failure."""

    def __init__(self, message: str, code: str = "provider_error"):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass(frozen=True)
class ModelDescriptor:
    id: str
    label: str
    enabled: bool = True


@dataclass(frozen=True)
class ProviderDescriptor:
    id: str
    label: str
    api_key_env: str
    enabled: bool
    models: tuple[ModelDescriptor, ...]


class ProviderAdapter:
    provider_id: str

    async def chat_json(self, messages: list[dict], model: str) -> str:
        raise NotImplementedError

    async def chat_stream(
        self, messages: list[dict], model: str, json_mode: bool = False
    ) -> AsyncIterator[str]:
        raise NotImplementedError
        yield ""
