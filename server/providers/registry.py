import json
import os
from pathlib import Path

from .base import ModelDescriptor, ProviderDescriptor, ProviderError
from .gemini import GeminiAdapter
from .openai_compatible import OpenAICompatibleAdapter

CONFIG_PATH = Path(__file__).parents[1] / "models.json"
CONFIG = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

OPENAI_COMPATIBLE_BASE_URLS = {
    "groq": "https://api.groq.com/openai/v1",
    "mistral": "https://api.mistral.ai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "xai": "https://api.x.ai/v1",
}


def _env_value(name: str) -> str:
    return os.getenv(name, "") or ""


def _has_key(descriptor: ProviderDescriptor) -> bool:
    return bool(_env_value(descriptor.api_key_env))


def all_descriptors() -> list[ProviderDescriptor]:
    result = []
    for provider_id, raw in CONFIG["providers"].items():
        models = tuple(
            ModelDescriptor(
                id=model["id"],
                label=model["label"],
                enabled=model.get("enabled", True),
            )
            for model in raw.get("models", [])
        )
        result.append(
            ProviderDescriptor(
                id=provider_id,
                label=raw["label"],
                api_key_env=raw["apiKeyEnv"],
                enabled=raw.get("enabled", True),
                models=models,
            )
        )
    return result


def available_providers() -> list[dict]:
    result = []
    for provider in all_descriptors():
        if not provider.enabled or not _has_key(provider):
            continue
        models = [
            {"id": model.id, "label": model.label}
            for model in provider.models
            if model.enabled
        ]
        if not models:
            continue
        result.append(
            {
                "id": provider.id,
                "label": provider.label,
                "models": models,
            }
        )
    return result


def default_ref() -> str:
    configured = available_providers()
    default = CONFIG.get("default", "")
    if default and any(
        f"{provider['id']}:" in default and default.split(":", 1)[1] in
        {model["id"] for model in provider["models"]}
        for provider in configured
    ):
        return default
    if configured:
        first = configured[0]
        return f"{first['id']}:{first['models'][0]['id']}"
    raise ProviderError("No AI providers are configured", "no_providers")


def split_ref(ref: str) -> tuple[str, str]:
    if ":" not in ref:
        raise ProviderError("Invalid model reference", "invalid_model")
    return ref.split(":", 1)


def resolve(ref: str):
    provider_id, model_id = split_ref(ref)
    descriptor = next(
        (item for item in all_descriptors() if item.id == provider_id), None
    )
    if not descriptor or not descriptor.enabled or not _has_key(descriptor):
        raise ProviderError(
            f"{provider_id} is not configured or is disabled", "model_unavailable"
        )
    if not any(model.id == model_id and model.enabled for model in descriptor.models):
        raise ProviderError(
            f"Model {model_id} is not available", "model_unavailable"
        )

    api_key = _env_value(descriptor.api_key_env)
    if provider_id == "gemini":
        return GeminiAdapter(api_key)
    if provider_id in OPENAI_COMPATIBLE_BASE_URLS:
        return OpenAICompatibleAdapter(
            provider_id, OPENAI_COMPATIBLE_BASE_URLS[provider_id], api_key
        )
    raise ProviderError(f"Unsupported provider {provider_id}", "model_unavailable")
