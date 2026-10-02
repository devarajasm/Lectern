"""Conversation / interruption handler: routes what the listener said.

Simple commands (continue, stop, repeat, start) are matched with rules so they
are instant and free; everything else is treated as a question about the book.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from enum import Enum

from ..context.builder import ContextBuilder
from ..llm.base import ModelProvider
from ..reading.manager import ReadingStateManager
from ..reading.state import ReadingState, ReadingStatus
from ..storage.conversation import ConversationRepository

log = logging.getLogger(__name__)


class Intent(str, Enum):
    RESUME = "RESUME"
    STOP = "STOP"
    START = "START"
    RESTART = "RESTART"
    REPEAT = "REPEAT"
    QUESTION = "QUESTION"
    EMPTY = "EMPTY"


_RESUME = {
    "continue", "go on", "resume", "keep reading", "keep going", "carry on", "read on", "go ahead",
    "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "please continue", "continue reading",
    "yes please", "go", "next", "proceed", "got it", "thanks", "thank you", "makes sense", "alright",
    "all right", "cool", "great",
}
_STOP = {"stop", "pause", "no", "not now", "that's enough", "thats enough", "enough", "nope"}
# The listener only signalled the interruption; keep listening for the actual question.
_HOLD = {"wait", "hold on", "hang on", "one moment", "one second", "wait a second", "wait a minute"}
_START = {"start", "start reading", "read", "read the book", "begin", "start the book", "read to me", "play"}
_RESTART = {"start from the beginning", "start over", "from the beginning", "restart", "read from the beginning"}
_REPEAT = {"repeat", "repeat that", "say that again", "read that again", "again", "go back", "what did you say",
           "come again", "pardon"}

_FILLER = re.compile(r"\b(please|can you|could you|would you|just|now|then|um|uh|hey|so|okay so|ok so)\b")


def _normalise(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s']", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def classify(text: str) -> Intent:
    norm = _normalise(text)
    if not norm:
        return Intent.EMPTY
    stripped = re.sub(r"\s+", " ", _FILLER.sub(" ", norm)).strip()
    for candidate in {norm, stripped}:
        if candidate in _HOLD:
            return Intent.EMPTY
        if candidate in _RESTART:
            return Intent.RESTART
        if candidate in _REPEAT:
            return Intent.REPEAT
        if candidate in _RESUME:
            return Intent.RESUME
        if candidate in _STOP:
            return Intent.STOP
        if candidate in _START:
            return Intent.START
    words = norm.split()
    # Short utterances that lead with a command word ("yes continue", "ok go on please").
    if len(words) <= 4 and not norm.endswith("?"):
        if any(p in norm for p in ("from the beginning", "start over")):
            return Intent.RESTART
        if any(p in norm for p in ("continue", "go on", "keep reading", "keep going", "carry on", "resume")):
            return Intent.RESUME
        if words[0] in {"stop", "pause"}:
            return Intent.STOP
        if norm.startswith(("start reading", "read the book")):
            return Intent.START
    return Intent.QUESTION


@dataclass
class ConverseResult:
    intent: Intent
    state: ReadingState
    answer: str | None = None


class ConversationHandler:
    def __init__(self, manager: ReadingStateManager, context_builder: ContextBuilder,
                 conversation: ConversationRepository):
        self.manager = manager
        self.context_builder = context_builder
        self.conversation = conversation

    def handle(self, book_id: str, text: str, provider: ModelProvider) -> ConverseResult:
        intent = classify(text)
        log.info("book=%s intent=%s chars=%d", book_id, intent.value, len(text))

        if intent == Intent.EMPTY:
            return ConverseResult(intent, self.manager.get(book_id))
        if intent == Intent.RESUME:
            return ConverseResult(intent, self.manager.resume_point(book_id))
        if intent == Intent.STOP:
            return ConverseResult(intent, self.manager.set_status(book_id, ReadingStatus.PAUSED))
        if intent == Intent.START:
            state = self.manager.get(book_id)
            if state.status == ReadingStatus.FINISHED:
                return ConverseResult(intent, self.manager.restart(book_id))
            return ConverseResult(intent, self.manager.resume_point(book_id))
        if intent == Intent.RESTART:
            return ConverseResult(intent, self.manager.restart(book_id))
        if intent == Intent.REPEAT:
            state = self.manager.get(book_id)
            if state.sentence_index > 0:
                state = self.manager.update_position(book_id, state.chunk_index, sentence_index=state.sentence_index - 1)
            elif state.chunk_index > 0:
                prev = self.manager.books.get_chunk(book_id, state.chunk_index - 1)
                state = self.manager.update_position(book_id, state.chunk_index - 1,
                                                     sentence_index=len(prev.sentences) - 1 if prev else 0)
            return ConverseResult(intent, self.manager.resume_point(book_id))

        # QUESTION
        state = self.manager.set_status(book_id, ReadingStatus.ANSWERING)
        context = self.context_builder.build(state, text)
        answer = provider.generate(context, text)  # may raise ProviderError
        self.conversation.add(book_id, "user", text, state.chunk_index)
        self.conversation.add(book_id, "assistant", answer, state.chunk_index)
        return ConverseResult(intent, state, answer)
