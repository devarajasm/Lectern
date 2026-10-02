"""Speech endpoints and global provider settings."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from .. import __version__
from ..deps import Container, get_container
from ..speech.base import SpeechError
from .schemas import ProvidersIn, TTSIn

router = APIRouter(prefix="/api", tags=["system"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024


def _providers_payload(c: Container) -> dict:
    active_speech = c.speech.active()
    stt = active_speech.stt_status() if active_speech else None
    tts = active_speech.tts_status() if active_speech else None
    return {
        "llm": {
            "active": c.llm.active_id(),
            "providers": [p.__dict__ for p in c.llm.list()],
        },
        "speech": {
            "active": c.speech.active_id(),
            "server_speech_available": active_speech is not None,
            # Per capability, so e.g. cloud voice can stay on while listening uses the browser.
            "tts_available": bool(tts and tts.ok is not False),
            "stt_available": bool(stt and stt.ok is not False),
            "tts_detail": tts.reason if tts else "",
            "stt_detail": stt.reason if stt else "",
            "providers": [p.__dict__ for p in c.speech.list()],
        },
    }


@router.get("/providers")
def get_providers(c: Container = Depends(get_container)):
    return _providers_payload(c)


@router.put("/providers")
def set_providers(body: ProvidersIn, c: Container = Depends(get_container)):
    try:
        if body.llm_provider:
            c.llm.set_active(body.llm_provider)
        if body.speech_provider:
            c.speech.set_active(body.speech_provider)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return _providers_payload(c)


@router.post("/stt")
async def speech_to_text(audio: UploadFile = File(...), c: Container = Depends(get_container)):
    provider = c.speech.active()
    if provider is None:
        raise HTTPException(503, "Server speech is not available. Use the browser voice engine.")
    if (status := provider.stt_status()).ok is False:
        raise HTTPException(503, f"Cloud speech recognition unavailable: {status.reason}.")
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Empty audio.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio too long.")
    try:
        text = provider.transcribe(data, audio.filename or "speech.webm", audio.content_type or "audio/webm")
    except SpeechError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"text": text}


@router.post("/tts")
def text_to_speech(body: TTSIn, c: Container = Depends(get_container)):
    provider = c.speech.active()
    if provider is None:
        raise HTTPException(503, "Server speech is not available. Use the browser voice engine.")
    try:
        audio = provider.synthesize(body.text, body.voice, body.speed, body.style, body.persona)
    except SpeechError as exc:
        raise HTTPException(502, str(exc)) from exc
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@router.get("/about")
def about(c: Container = Depends(get_container)):
    return {"name": "Lectern", "version": __version__, "license": "AGPL-3.0-only", "source_url": c.settings.source_url}


@router.get("/health")
def health():
    return {"ok": True}
