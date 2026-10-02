"""Server-side speech interfaces. The browser Web Speech engine lives in the frontend
and needs no backend; these are for cloud speech (Azure OpenAI / OpenAI)."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


class SpeechError(RuntimeError):
    pass


@dataclass
class SpeechInfo:
    id: str
    label: str
    configured: bool
    stt_model: str = ""
    tts_model: str = ""
    detail: str = ""


@dataclass
class Capability:
    """Whether a speech capability works. ok=None means not checked yet."""
    ok: bool | None = None
    reason: str = ""
    checked_at: float = 0.0


class SpeechToText(ABC):
    @abstractmethod
    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str: ...


class TextToSpeech(ABC):
    @abstractmethod
    def synthesize(self, text: str, voice: str | None = None, speed: float = 1.0,
                   style: str = "narration", persona: str | None = None) -> bytes:
        """Return MP3 audio for ``text``. style: "narration" (reading the book) or "conversation"
        (answers); persona picks a narration style such as "storyteller", "calm" or "expressive"."""


class SpeechProvider(SpeechToText, TextToSpeech, ABC):
    info: SpeechInfo

    def stt_status(self) -> Capability:
        """Status of speech-to-text; implementations may probe on first call."""
        return Capability(ok=True)

    def tts_status(self) -> Capability:
        return Capability(ok=True)
