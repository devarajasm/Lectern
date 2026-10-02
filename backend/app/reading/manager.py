"""Reading-state manager: the only component that reads/writes the reading position."""
from __future__ import annotations

import logging

from ..storage.books import BookRepository
from ..storage.db import Database
from .state import ReadingState, ReadingStatus

log = logging.getLogger(__name__)


class BookNotFound(LookupError):
    pass


class ReadingStateManager:
    def __init__(self, db: Database, books: BookRepository):
        self.db = db
        self.books = books

    def get(self, book_id: str) -> ReadingState:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM reading_state WHERE book_id = ?", (book_id,)).fetchone()
        if row is None:
            if self.books.get_book(book_id) is None:
                raise BookNotFound(book_id)
            state = ReadingState(book_id=book_id)
            self._save(state)
            return self.get(book_id)
        return ReadingState(
            book_id=row["book_id"],
            chapter_index=row["chapter_idx"],
            chunk_index=row["chunk_idx"],
            sentence_index=row["sentence_idx"],
            char_offset=row["char_offset"],
            page=row["page"],
            status=ReadingStatus(row["status"]),
            updated_at=row["updated_at"],
        )

    def update_position(
        self,
        book_id: str,
        chunk_index: int,
        char_offset: int | None = None,
        sentence_index: int | None = None,
        status: ReadingStatus | None = None,
    ) -> ReadingState:
        """Move the reading position. Either char_offset or sentence_index locates the spot in the chunk;
        the other is derived. Chapter and page are always derived from the chunk."""
        book = self.books.get_book(book_id)
        if book is None:
            raise BookNotFound(book_id)
        state = self.get(book_id)

        chunk_index = min(max(chunk_index, 0), book.chunk_count - 1)
        chunk = self.books.get_chunk(book_id, chunk_index)
        assert chunk is not None

        if char_offset is not None:
            char_offset = min(max(char_offset, 0), len(chunk.text))
            sentence_index = chunk.sentence_at(char_offset)
        else:
            sentence_index = min(max(sentence_index or 0, 0), len(chunk.sentences) - 1)
            char_offset = chunk.sentences[sentence_index][0]

        state.chunk_index = chunk_index
        state.sentence_index = sentence_index
        state.char_offset = char_offset
        state.chapter_index = chunk.chapter_index
        state.page = chunk.sentences[sentence_index][2]
        if status is not None:
            state.status = status
        self._save(state)
        return self.get(book_id)

    def set_status(self, book_id: str, status: ReadingStatus) -> ReadingState:
        state = self.get(book_id)
        if state.status != status:
            log.info("book=%s status %s -> %s", book_id, state.status.value, status.value)
        state.status = status
        self._save(state)
        return self.get(book_id)

    def interrupt(self, book_id: str, chunk_index: int, char_offset: int) -> ReadingState:
        """Record the exact interruption point and switch to LISTENING."""
        return self.update_position(book_id, chunk_index, char_offset=char_offset, status=ReadingStatus.LISTENING)

    def resume_point(self, book_id: str) -> ReadingState:
        """Where reading continues: the start of the sentence that contains the interruption point
        (restarting mid-sentence sounds broken). Sets status to RESUMING."""
        state = self.get(book_id)
        return self.update_position(
            book_id, state.chunk_index, sentence_index=state.sentence_index, status=ReadingStatus.RESUMING
        )

    def restart(self, book_id: str) -> ReadingState:
        return self.update_position(book_id, 0, sentence_index=0, status=ReadingStatus.READING)

    def _save(self, state: ReadingState) -> None:
        with self.db.connect() as conn:
            conn.execute(
                """INSERT INTO reading_state
                       (book_id, chapter_idx, chunk_idx, sentence_idx, char_offset, page, status, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(book_id) DO UPDATE SET
                       chapter_idx = excluded.chapter_idx, chunk_idx = excluded.chunk_idx,
                       sentence_idx = excluded.sentence_idx, char_offset = excluded.char_offset,
                       page = excluded.page, status = excluded.status, updated_at = excluded.updated_at""",
                (state.book_id, state.chapter_index, state.chunk_index, state.sentence_index,
                 state.char_offset, state.page, state.status.value),
            )
