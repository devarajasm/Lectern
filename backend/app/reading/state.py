"""Reading state model. Persisted outside the LLM so it survives restarts and model changes."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum


class ReadingStatus(str, Enum):
    IDLE = "IDLE"            # nothing started yet
    READING = "READING"      # reading the book aloud
    LISTENING = "LISTENING"  # user interrupted; capturing speech
    ANSWERING = "ANSWERING"  # understanding the question and responding
    RESUMING = "RESUMING"    # returning to the interruption point
    PAUSED = "PAUSED"        # stopped by the user; waiting
    FINISHED = "FINISHED"    # reached the end of the book


@dataclass
class ReadingState:
    book_id: str
    chapter_index: int = 0
    chunk_index: int = 0
    sentence_index: int = 0
    char_offset: int = 0       # exact character position within the chunk
    page: int = 1
    status: ReadingStatus = ReadingStatus.IDLE
    updated_at: str = ""

    def to_dict(self) -> dict:
        data = asdict(self)
        data["status"] = self.status.value
        return data
