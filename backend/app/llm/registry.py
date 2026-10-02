"""Builds every known LLM provider and tracks which one is globally active.

Adding a provider = implement ModelProvider and register a factory in ``_build``.
"""
from __future__ import annotations

import logging

from openai import OpenAI

from ..config import Settings
from ..net import http_client
from ..storage.settings import SettingsRepository
from .base import ModelProvider, ProviderInfo
from .huggingface_provider import HuggingFaceProvider
from .openai_style import OpenAIStyleProvider

log = logging.getLogger(__name__)

PROVIDER_IDS = ("azure", "openai", "ollama", "openai_compatible", "huggingface")
SETTING_KEY = "llm_provider"


class ProviderRegistry:
    def __init__(self, settings: Settings, store: SettingsRepository):
        self.settings = settings
        self.store = store
        self._providers: dict[str, ModelProvider] = {pid: self._build(pid) for pid in PROVIDER_IDS}

    def _build(self, pid: str) -> ModelProvider:
        s = self.settings
        if pid == "azure":
            ok = s.azure_configured
            return OpenAIStyleProvider(
                ProviderInfo("azure", "Azure OpenAI", "cloud", s.azure_openai_llm_deployment, ok,
                             "" if ok else "Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY."),
                OpenAI(api_key=s.azure_openai_api_key, base_url=s.azure_v1_base_url, http_client=http_client()) if ok else None,
                api_style=s.azure_openai_api_style,
            )
        if pid == "openai":
            ok = s.openai_configured
            return OpenAIStyleProvider(
                ProviderInfo("openai", "OpenAI", "cloud", s.openai_model, ok, "" if ok else "Set OPENAI_API_KEY."),
                OpenAI(api_key=s.openai_api_key, http_client=http_client()) if ok else None,
                api_style="responses",
            )
        if pid == "ollama":
            return OpenAIStyleProvider(
                ProviderInfo("ollama", "Ollama (local)", "local", s.ollama_model, True,
                             f"Expects Ollama at {s.ollama_base_url}."),
                OpenAI(api_key="ollama", base_url=s.ollama_base_url, http_client=http_client(timeout=120)),
                api_style="chat",
            )
        if pid == "openai_compatible":
            return OpenAIStyleProvider(
                ProviderInfo("openai_compatible", "Local OpenAI-compatible server", "local",
                             s.openai_compatible_model, True,
                             f"LM Studio / vLLM / llama.cpp at {s.openai_compatible_base_url}."),
                OpenAI(api_key=s.openai_compatible_api_key or "none", base_url=s.openai_compatible_base_url, http_client=http_client(timeout=120)),
                api_style="chat",
            )
        if pid == "huggingface":
            return HuggingFaceProvider(s.hf_model, s.hf_device)
        raise ValueError(f"Unknown provider {pid}")

    def list(self) -> list[ProviderInfo]:
        return [p.info for p in self._providers.values()]

    def active_id(self) -> str:
        pid = self.store.get(SETTING_KEY) or self.settings.llm_provider
        return pid if pid in self._providers else "azure"

    def set_active(self, pid: str) -> None:
        if pid not in self._providers:
            raise ValueError(f"Unknown LLM provider '{pid}'. Choose one of: {', '.join(PROVIDER_IDS)}")
        self.store.set(SETTING_KEY, pid)
        log.info("active llm provider -> %s", pid)

    def active(self) -> ModelProvider:
        return self._providers[self.active_id()]

    def register(self, provider: ModelProvider) -> None:
        """Register/replace a provider at runtime (also used by tests)."""
        self._providers[provider.info.id] = provider
