"""Server-side speech providers and the globally active one.

"none" means only the in-browser Web Speech engine is offered to the UI."""
from __future__ import annotations

import logging

from openai import AzureOpenAI, OpenAI

from ..config import Settings
from ..net import http_client
from ..storage.settings import SettingsRepository
from .base import SpeechInfo, SpeechProvider
from .openai_speech import OpenAISpeech

log = logging.getLogger(__name__)

SPEECH_IDS = ("azure", "openai", "none")
SETTING_KEY = "speech_provider"


class SpeechRegistry:
    def __init__(self, settings: Settings, store: SettingsRepository):
        self.settings = settings
        self.store = store
        s = settings
        self._providers: dict[str, SpeechProvider] = {
            "azure": OpenAISpeech(
                SpeechInfo("azure", "Azure OpenAI", s.azure_configured,
                           s.azure_openai_stt_deployment, s.azure_openai_tts_deployment,
                           "" if s.azure_configured else "Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY."),
                OpenAI(api_key=s.azure_openai_api_key, base_url=s.azure_v1_base_url, http_client=http_client()) if s.azure_configured else None,
                s.tts_voice,
                stt_client=AzureOpenAI(
                    azure_endpoint=s.azure_openai_endpoint,
                    api_key=s.azure_openai_api_key,
                    api_version=s.azure_openai_audio_api_version,
                    http_client=http_client(),
                ) if s.azure_configured else None,
            ),
            "openai": OpenAISpeech(
                SpeechInfo("openai", "OpenAI", s.openai_configured, s.openai_stt_model, s.openai_tts_model,
                           "" if s.openai_configured else "Set OPENAI_API_KEY."),
                OpenAI(api_key=s.openai_api_key, http_client=http_client()) if s.openai_configured else None,
                s.tts_voice,
            ),
        }

    def list(self) -> list[SpeechInfo]:
        return [p.info for p in self._providers.values()] + [
            SpeechInfo("none", "Browser only", True, detail="Use the in-browser Web Speech engine.")
        ]

    def active_id(self) -> str:
        sid = self.store.get(SETTING_KEY) or self.settings.speech_provider
        return sid if sid in SPEECH_IDS else "none"

    def set_active(self, sid: str) -> None:
        if sid not in SPEECH_IDS:
            raise ValueError(f"Unknown speech provider '{sid}'. Choose one of: {', '.join(SPEECH_IDS)}")
        self.store.set(SETTING_KEY, sid)
        log.info("active speech provider -> %s", sid)

    def active(self) -> SpeechProvider | None:
        """The active, configured server-side speech provider, or None (browser engine only)."""
        provider = self._providers.get(self.active_id())
        return provider if provider and provider.info.configured else None
