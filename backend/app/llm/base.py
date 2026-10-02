"""Provider-independent LLM interface.

Every model backend (Azure OpenAI, OpenAI, Ollama, LM Studio, Hugging Face, ...)
implements ``ModelProvider.generate(context, question)``. The rest of the app
only ever talks to this interface.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..context.builder import BookContext


class ProviderError(RuntimeError):
    """The provider failed to produce an answer (network, auth, quota, ...)."""


class ProviderUnavailable(ProviderError):
    """The provider is not configured or cannot be reached."""


@dataclass
class ProviderInfo:
    id: str
    label: str
    kind: str          # "cloud" | "local"
    model: str
    configured: bool
    detail: str = ""


class ModelProvider(ABC):
    info: ProviderInfo

    @abstractmethod
    def generate(self, context: BookContext, question: str) -> str:
        """Answer ``question`` using only the supplied book context. Returns plain spoken text."""
