"""Exercise OpenAIStyleProvider against a mocked OpenAI-compatible HTTP server."""
import json

import httpx
import pytest
from openai import OpenAI

from app.context.builder import BookContext, Passage
from app.llm.base import ProviderInfo, ProviderUnavailable
from app.llm.openai_style import OpenAIStyleProvider

CTX = BookContext("Book", "Ch 1", 3, Passage("Current passage", 3, 3, "Text [[LISTENER INTERRUPTED HERE]] more"))


def _client(handler, seen):
    def wrapped(request: httpx.Request):
        seen.append((request.url.path, json.loads(request.content)))
        return handler(request)
    return OpenAI(api_key="k", base_url="https://res.openai.azure.com/openai/v1/",
                  http_client=httpx.Client(transport=httpx.MockTransport(wrapped)))


def test_responses_api_style():
    seen = []
    body = {"id": "r1", "object": "response", "created_at": 0, "model": "gpt-5-mini", "status": "completed",
            "output": [{"type": "message", "id": "m1", "role": "assistant", "status": "completed",
                        "content": [{"type": "output_text", "text": "It means the lamp.", "annotations": []}]}],
            "parallel_tool_calls": False, "tool_choice": "auto", "tools": []}
    client = _client(lambda r: httpx.Response(200, json=body), seen)
    provider = OpenAIStyleProvider(ProviderInfo("azure", "Azure OpenAI", "cloud", "gpt-5-mini", True), client, "responses")
    assert provider.generate(CTX, "what?") == "It means the lamp."
    path, payload = seen[0]
    assert path.endswith("/openai/v1/responses")
    assert payload["store"] is False and payload["reasoning"] == {"effort": "low"}
    assert "INTERRUPTED HERE" in payload["input"]


def test_chat_style_for_local_servers():
    seen = []
    body = {"id": "c1", "object": "chat.completion", "created": 0, "model": "llama",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "Local answer."}}]}
    client = _client(lambda r: httpx.Response(200, json=body), seen)
    provider = OpenAIStyleProvider(ProviderInfo("ollama", "Ollama", "local", "llama3.1:8b", True), client, "chat")
    assert provider.generate(CTX, "what?") == "Local answer."
    assert seen[0][0].endswith("/chat/completions")
    assert [m["role"] for m in seen[0][1]["messages"]] == ["system", "user"]


def test_unconfigured_and_auth_errors_are_unavailable():
    with pytest.raises(ProviderUnavailable):
        OpenAIStyleProvider(ProviderInfo("azure", "Azure", "cloud", "m", False), None).generate(CTX, "q")
    client = _client(lambda r: httpx.Response(401, json={"error": {"message": "bad key"}}), [])
    client = client.with_options(max_retries=0)
    with pytest.raises(ProviderUnavailable):
        OpenAIStyleProvider(ProviderInfo("azure", "Azure", "cloud", "m", True), client, "chat").generate(CTX, "q")


def _speech(handler, calls):
    from app.speech.base import SpeechInfo
    from app.speech.openai_speech import OpenAISpeech

    def wrapped(request: httpx.Request):
        calls.append(request.url.path)
        return handler(request)
    client = OpenAI(api_key="k", base_url="https://res.openai.azure.com/openai/v1/", max_retries=0,
                    http_client=httpx.Client(transport=httpx.MockTransport(wrapped)))
    return OpenAISpeech(SpeechInfo("azure", "Azure OpenAI", True, "missing-stt", "tts"), client, "marin")


def test_missing_stt_deployment_is_detected_before_use_and_cached():
    calls = []
    speech = _speech(lambda r: httpx.Response(404, json={"error": {"code": "DeploymentNotFound", "message": "x"}}), calls)
    status = speech.stt_status()
    assert status.ok is False and "missing-stt" in status.reason
    speech.stt_status()
    assert len(calls) == 1  # probed once, then cached
    assert speech.tts_status().ok is True  # TTS unaffected


def test_transient_stt_error_does_not_disable_capability():
    calls = []
    speech = _speech(lambda r: httpx.Response(500, json={"error": {"message": "boom"}}), calls)
    assert speech.stt_status().ok is True  # 5xx is not a configuration problem


def test_working_stt_probe():
    calls = []
    speech = _speech(lambda r: httpx.Response(200, json={"text": ""}), calls)
    assert speech.stt_status().ok is True
    assert calls[0].endswith("/audio/transcriptions")
