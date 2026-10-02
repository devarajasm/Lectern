"""In-process local model via Hugging Face transformers (optional dependency).

Install with: pip install -r backend/requirements-local.txt
The model is downloaded on first use and cached by Hugging Face locally.
"""
from __future__ import annotations

import importlib.util
import logging
import threading
import time

from ..context.builder import BookContext
from .base import ModelProvider, ProviderError, ProviderInfo, ProviderUnavailable
from .prompt import build_messages

log = logging.getLogger(__name__)


def transformers_installed() -> bool:
    return importlib.util.find_spec("transformers") is not None and importlib.util.find_spec("torch") is not None


class HuggingFaceProvider(ModelProvider):
    def __init__(self, model: str, device: str = "auto", max_new_tokens: int = 300):
        installed = transformers_installed()
        self.info = ProviderInfo(
            id="huggingface",
            label="Hugging Face (local)",
            kind="local",
            model=model,
            configured=installed,
            detail="" if installed else "Install backend/requirements-local.txt to enable.",
        )
        self.device = device
        self.max_new_tokens = max_new_tokens
        self._pipeline = None
        self._lock = threading.Lock()

    def _load(self):
        with self._lock:
            if self._pipeline is None:
                from transformers import pipeline  # imported lazily: heavy

                log.info("loading local model %s", self.info.model)
                self._pipeline = pipeline("text-generation", model=self.info.model, device_map=self.device)
        return self._pipeline

    def generate(self, context: BookContext, question: str) -> str:
        if not self.info.configured:
            raise ProviderUnavailable(self.info.detail)
        started = time.perf_counter()
        try:
            pipe = self._load()
            out = pipe(build_messages(context, question), max_new_tokens=self.max_new_tokens, do_sample=False)
            text = out[0]["generated_text"][-1]["content"]
        except Exception as exc:
            raise ProviderError(f"Local model failed: {type(exc).__name__}.") from exc
        log.info("llm provider=huggingface latency_ms=%d", (time.perf_counter() - started) * 1000)
        return str(text).strip()
