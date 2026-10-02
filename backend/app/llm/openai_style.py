"""One implementation for every OpenAI-API-shaped backend:
Azure OpenAI (v1 API), OpenAI, Ollama, LM Studio, vLLM, llama.cpp server, ..."""
from __future__ import annotations

import logging
import time

import openai
from openai import OpenAI

from ..context.builder import BookContext
from ..net import describe_connection_error
from .base import ModelProvider, ProviderError, ProviderInfo, ProviderUnavailable
from .prompt import SYSTEM_PROMPT, build_messages, render_user_prompt

log = logging.getLogger(__name__)

_REASONING_PREFIXES = ("gpt-5", "o1", "o3", "o4")


class OpenAIStyleProvider(ModelProvider):
    def __init__(self, info: ProviderInfo, client: OpenAI | None, api_style: str = "responses"):
        """api_style: "responses" (OpenAI Responses API — recommended for new projects)
        or "chat" (Chat Completions — what most local servers implement)."""
        self.info = info
        self.client = client
        self.api_style = api_style

    def generate(self, context: BookContext, question: str) -> str:
        if not self.info.configured or self.client is None:
            raise ProviderUnavailable(f"{self.info.label} is not configured. {self.info.detail}".strip())
        started = time.perf_counter()
        try:
            text = self._responses(context, question) if self.api_style == "responses" else self._chat(context, question)
        except openai.APIConnectionError as exc:
            reason = describe_connection_error(exc)
            log.warning("llm provider=%s connection failed: %s", self.info.id, reason)
            raise ProviderUnavailable(f"Could not reach {self.info.label}: {reason}.") from exc
        except openai.AuthenticationError as exc:
            raise ProviderUnavailable(f"{self.info.label} rejected the credentials.") from exc
        except openai.APIStatusError as exc:
            raise ProviderError(f"{self.info.label} returned HTTP {exc.status_code}.") from exc
        except openai.OpenAIError as exc:
            raise ProviderError(f"{self.info.label} failed: {type(exc).__name__}.") from exc
        log.info("llm provider=%s model=%s latency_ms=%d answer_chars=%d",
                 self.info.id, self.info.model, (time.perf_counter() - started) * 1000, len(text))
        return text.strip()

    def _is_reasoning_model(self) -> bool:
        return self.info.model.lower().startswith(_REASONING_PREFIXES)

    def _responses(self, context: BookContext, question: str) -> str:
        kwargs = {}
        if self._is_reasoning_model():
            kwargs["reasoning"] = {"effort": "low"}  # keep voice answers snappy
        response = self.client.responses.create(
            model=self.info.model,
            instructions=SYSTEM_PROMPT,
            input=render_user_prompt(context, question),
            store=False,  # privacy: don't keep book text / questions on the provider side
            **kwargs,
        )
        return response.output_text or ""

    def _chat(self, context: BookContext, question: str) -> str:
        response = self.client.chat.completions.create(
            model=self.info.model,
            messages=build_messages(context, question),
        )
        return response.choices[0].message.content or ""
