"""Builds the bounded context for one question. The full book never goes to the LLM:
only the current passage (with the interruption point marked), its neighbours,
a few lexically relevant passages, and recent conversation turns."""
from __future__ import annotations

from dataclasses import dataclass, field

from ..reading.state import ReadingState
from ..storage.books import BookRepository
from ..storage.conversation import ConversationRepository, Turn

INTERRUPT_MARKER = " [[LISTENER INTERRUPTED HERE]] "


@dataclass
class Passage:
    label: str
    page_start: int
    page_end: int
    text: str


@dataclass
class BookContext:
    book_title: str
    chapter_title: str
    page: int
    current: Passage
    nearby: list[Passage] = field(default_factory=list)
    related: list[Passage] = field(default_factory=list)
    history: list[Turn] = field(default_factory=list)

    def total_chars(self) -> int:
        return (
            len(self.current.text)
            + sum(len(p.text) for p in self.nearby + self.related)
            + sum(len(t.text) for t in self.history)
        )


class ContextBuilder:
    def __init__(self, books: BookRepository, conversation: ConversationRepository,
                 char_budget: int = 12_000, history_turns: int = 6):
        self.books = books
        self.conversation = conversation
        self.char_budget = char_budget
        self.history_turns = history_turns

    def build(self, state: ReadingState, question: str) -> BookContext:
        book = self.books.get_book(state.book_id)
        if book is None:
            raise LookupError(state.book_id)
        chapters = self.books.get_chapters(state.book_id)
        chapter_title = next((c.title for c in chapters if c.index == state.chapter_index), "")

        chunk = self.books.get_chunk(state.book_id, state.chunk_index)
        assert chunk is not None
        offset = min(state.char_offset, len(chunk.text))
        current = Passage(
            label="Current passage (being read aloud)",
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            text=chunk.text[:offset] + INTERRUPT_MARKER + chunk.text[offset:],
        )

        nearby: list[Passage] = []
        prev = self.books.get_chunk(state.book_id, state.chunk_index - 1) if state.chunk_index > 0 else None
        nxt = self.books.get_chunk(state.book_id, state.chunk_index + 1)
        if prev:
            nearby.append(Passage("Previous passage", prev.page_start, prev.page_end, prev.text))
        if nxt:
            nearby.append(Passage("Next passage (not yet read)", nxt.page_start, nxt.page_end, nxt.text))

        exclude = {state.chunk_index, state.chunk_index - 1, state.chunk_index + 1}
        related = [
            Passage("Related passage from elsewhere in the book", c.page_start, c.page_end, c.text)
            for c in self.books.search(state.book_id, question, limit=3, exclude=exclude)
        ]

        history = self.conversation.recent(state.book_id, self.history_turns)

        ctx = BookContext(book.title, chapter_title, state.page, current, nearby, related, history)
        self._fit_budget(ctx)
        return ctx

    def _fit_budget(self, ctx: BookContext) -> None:
        """Drop the least important material first until the context fits."""
        while ctx.total_chars() > self.char_budget and ctx.related:
            ctx.related.pop()
        while ctx.total_chars() > self.char_budget and ctx.history:
            ctx.history.pop(0)
        while ctx.total_chars() > self.char_budget and ctx.nearby:
            ctx.nearby.pop()
        if ctx.total_chars() > self.char_budget:
            ctx.current.text = ctx.current.text[: self.char_budget]
