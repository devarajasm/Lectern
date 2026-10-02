"""Speech-to-text and text-to-speech over the OpenAI audio API (works for both
OpenAI and Azure OpenAI v1 endpoints — models are deployment names on Azure)."""
from __future__ import annotations

import io
import logging
import threading
import time
import wave

import openai
from openai import OpenAI

from ..net import describe_connection_error
from .base import Capability, SpeechError, SpeechInfo, SpeechProvider

log = logging.getLogger(__name__)

# Acting direction for steerable TTS models (gpt-4o-mini-tts). This is what makes
# the voice sound like a person rather than a screen reader.
_HUMAN = (
    "Sound like a real person, not a synthesiser or a radio announcer: natural breathing, "
    "relaxed articulation, organic rhythm, small natural variations in pitch and pace. "
    "Never sound flat, sing-song or overly polished."
)

NARRATION_STYLES: dict[str, str] = {
    "storyteller": (
        "Voice: warm, intimate and genuinely human, like a gifted audiobook narrator reading to one friend. "
        "Tone: engaged and sincere. Pacing: unhurried and natural; slow down slightly for meaningful moments, "
        "brief pauses at commas, fuller pauses between sentences and paragraphs. "
        "Emotion: let the meaning colour the voice: warmth, curiosity, tension or sadness as the text calls for. "
        "Dialogue: a light, believable touch of character, never overacted. " + _HUMAN
    ),
    "calm": (
        "Voice: soft, soothing and gentle, like reading a favourite book aloud late in the evening. "
        "Tone: peaceful and reassuring. Pacing: slow and even with generous, restful pauses. "
        "Emotion: quiet warmth; keep intensity low even in dramatic passages. " + _HUMAN
    ),
    "expressive": (
        "Voice: rich, vivid and theatrical, like an award-winning performer narrating a gripping novel. "
        "Tone: captivating and dynamic. Pacing: varied; quicken in action, linger in suspense, use dramatic pauses. "
        "Emotion: fully expressive; distinct, believable voices for different characters in dialogue. " + _HUMAN
    ),
}

CONVERSATION_STYLE = (
    "Voice: friendly, natural and conversational, like a thoughtful friend chatting about a book you are both reading. "
    "Tone: relaxed and warm, with a hint of a smile. Pacing: natural speaking speed, with the small pauses people "
    "make while thinking. This is talking, not reading aloud. " + _HUMAN
)


def instructions_for(style: str, persona: str | None) -> str:
    if style == "conversation":
        return CONVERSATION_STYLE
    return NARRATION_STYLES.get(persona or "storyteller", NARRATION_STYLES["storyteller"])


# HTTP statuses that mean "misconfigured", not "temporarily failing".
_CONFIG_ERRORS = {401, 403, 404}
# Re-check a capability that failed with a config error after this long
# (e.g. the user has since created the missing deployment).
RECHECK_AFTER_S = 300


def _silent_wav(seconds: float = 0.5, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(seconds * rate))
    return buf.getvalue()


class OpenAISpeech(SpeechProvider):
    def __init__(self, info: SpeechInfo, client: OpenAI | None, default_voice: str,
                 stt_client: OpenAI | None = None):
        """stt_client: optional separate client for transcription (Azure's deployment-based endpoint)."""
        self.info = info
        self.client = client
        self.stt_client = stt_client or client
        self.default_voice = default_voice
        self._stt = Capability()
        self._tts = Capability()
        self._probe_lock = threading.Lock()

    # ------------------------------------------------------------------ health

    def stt_status(self) -> Capability:
        """Probe speech-to-text once (with half a second of silence) so the UI can choose the
        browser engine *before* the user speaks, instead of losing their first question."""
        if not self.info.configured:
            return Capability(False, f"{self.info.label} is not configured")
        with self._probe_lock:
            stale = self._stt.ok is False and time.time() - self._stt.checked_at > RECHECK_AFTER_S
            if self._stt.ok is None or stale:
                try:
                    self.transcribe(_silent_wav(), "probe.wav", "audio/wav")
                except SpeechError:
                    pass  # _error() recorded config failures; transient ones stay "unknown"
                if self._stt.ok is None:
                    self._stt = Capability(True, "", time.time())
        return self._stt

    def tts_status(self) -> Capability:
        if not self.info.configured:
            return Capability(False, f"{self.info.label} is not configured")
        if self._tts.ok is False and time.time() - self._tts.checked_at > RECHECK_AFTER_S:
            self._tts = Capability()  # give it another try
        return self._tts if self._tts.ok is False else Capability(True)

    def _error(self, action: str, exc: openai.OpenAIError, capability: str, model: str) -> SpeechError:
        status = exc.status_code if isinstance(exc, openai.APIStatusError) else None
        if isinstance(exc, openai.APIConnectionError):
            reason = describe_connection_error(exc)
        elif status == 404:
            reason = f"deployment/model '{model}' not found"
        elif status in (401, 403):
            reason = "credentials rejected"
        elif status is not None:
            reason = f"HTTP {status}"
        else:
            reason = type(exc).__name__
        if status in _CONFIG_ERRORS:
            setattr(self, capability, Capability(False, reason, time.time()))
        log.warning("%s provider=%s failed: %s", action, self.info.id, reason)
        return SpeechError(f"{self.info.label} {action} failed: {reason}.")

    def _require_client(self) -> OpenAI:
        if not self.info.configured or self.client is None:
            raise SpeechError(f"{self.info.label} speech is not configured.")
        return self.client

    def transcribe(self, audio: bytes, filename: str, content_type: str) -> str:
        self._require_client()
        client = self.stt_client
        started = time.perf_counter()
        try:
            result = client.audio.transcriptions.create(
                model=self.info.stt_model,
                file=(filename, audio, content_type),
            )
        except openai.OpenAIError as exc:
            raise self._error("transcription", exc, "_stt", self.info.stt_model) from exc
        self._stt = Capability(True, "", time.time())
        log.info("stt provider=%s bytes=%d latency_ms=%d", self.info.id, len(audio), (time.perf_counter() - started) * 1000)
        return (result.text or "").strip()

    def synthesize(self, text: str, voice: str | None = None, speed: float = 1.0,
                   style: str = "narration", persona: str | None = None) -> bytes:
        client = self._require_client()
        started = time.perf_counter()
        kwargs = {}
        if "gpt-4o" in self.info.tts_model:
            kwargs["instructions"] = instructions_for(style, persona)  # steerable voices only
        try:
            response = client.audio.speech.create(
                model=self.info.tts_model,
                voice=voice or self.default_voice,
                input=text,
                response_format="mp3",
                speed=min(max(speed, 0.25), 4.0),
                **kwargs,
            )
            audio = response.read()
        except openai.OpenAIError as exc:
            raise self._error("speech synthesis", exc, "_tts", self.info.tts_model) from exc
        self._tts = Capability(True, "", time.time())
        log.info("tts provider=%s chars=%d latency_ms=%d", self.info.id, len(text), (time.perf_counter() - started) * 1000)
        return audio
