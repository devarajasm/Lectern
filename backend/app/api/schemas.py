"""Request / response models for the HTTP API."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChapterOut(BaseModel):
    index: int
    title: str
    start_chunk: int
    start_page: int


class BookOut(BaseModel):
    id: str
    title: str
    filename: str
    page_count: int
    chunk_count: int
    created_at: str
    progress: float = 0.0
    status: str = "IDLE"


class BookDetailOut(BookOut):
    chapters: list[ChapterOut]


class BookUpdateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ChunkOut(BaseModel):
    index: int
    chapter_index: int
    page_start: int
    page_end: int
    text: str
    sentences: list[tuple[int, int, int]]


class StateOut(BaseModel):
    book_id: str
    chapter_index: int
    chunk_index: int
    sentence_index: int
    char_offset: int
    page: int
    status: str
    updated_at: str


class PositionIn(BaseModel):
    chunk_index: int = Field(ge=0)
    char_offset: int | None = Field(default=None, ge=0)
    sentence_index: int | None = Field(default=None, ge=0)
    status: str | None = None


class InterruptIn(BaseModel):
    chunk_index: int = Field(ge=0)
    char_offset: int = Field(ge=0)


class StatusIn(BaseModel):
    status: str


class ConverseIn(BaseModel):
    text: str = Field(max_length=4000)


class ConverseOut(BaseModel):
    intent: str
    answer: str | None
    state: StateOut


class TurnOut(BaseModel):
    role: str
    text: str
    chunk_index: int | None
    created_at: str


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    voice: str | None = None
    speed: float = 1.0
    style: Literal["narration", "conversation"] = "narration"
    persona: str | None = None


class ProvidersIn(BaseModel):
    llm_provider: str | None = None
    speech_provider: str | None = None
