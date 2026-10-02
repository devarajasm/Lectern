"""Book / chapter / chunk persistence and lexical search."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from .db import Database

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "did", "do", "does",
    "for", "from", "had", "has", "have", "he", "her", "him", "his", "how", "i", "in",
    "is", "it", "its", "me", "mean", "means", "my", "of", "on", "or", "she", "so", "that",
    "the", "their", "them", "there", "they", "this", "to", "was", "wait", "what", "when",
    "where", "which", "who", "why", "will", "with", "you", "your", "tell", "about",
    "explain", "again", "just", "said", "say", "were", "would", "could", "should",
}


@dataclass
class ChapterRecord:
    index: int
    title: str
    start_chunk: int
    start_page: int


@dataclass
class ChunkRecord:
    book_id: str
    index: int
    chapter_index: int
    page_start: int
    page_end: int
    text: str
    sentences: list[tuple[int, int, int]]  # (start, end, page)

    def sentence_at(self, char_offset: int) -> int:
        """Index of the sentence containing (or immediately following) char_offset."""
        for i, (start, end, _page) in enumerate(self.sentences):
            if char_offset < end:
                return i
        return max(len(self.sentences) - 1, 0)


@dataclass
class BookRecord:
    id: str
    title: str
    filename: str
    page_count: int
    chunk_count: int
    created_at: str


class BookRepository:
    def __init__(self, db: Database):
        self.db = db

    # ------------------------------------------------------------------ writes

    def save_book(
        self,
        book: BookRecord,
        chapters: list[ChapterRecord],
        chunks: list[ChunkRecord],
    ) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO books (id, title, filename, page_count, chunk_count) VALUES (?, ?, ?, ?, ?)",
                (book.id, book.title, book.filename, book.page_count, book.chunk_count),
            )
            self._insert_content(conn, book.id, chapters, chunks)

    def replace_content(self, book_id: str, page_count: int, chapters: list[ChapterRecord], chunks: list[ChunkRecord]) -> None:
        """Swap a book's chapters/chunks for freshly processed ones (same book id)."""
        with self.db.connect() as conn:
            conn.execute("DELETE FROM chunks_fts WHERE book_id = ?", (book_id,))
            conn.execute("DELETE FROM chunks WHERE book_id = ?", (book_id,))
            conn.execute("DELETE FROM chapters WHERE book_id = ?", (book_id,))
            conn.execute("UPDATE books SET page_count = ?, chunk_count = ? WHERE id = ?", (page_count, len(chunks), book_id))
            self._insert_content(conn, book_id, chapters, chunks)

    @staticmethod
    def _insert_content(conn, book_id: str, chapters: list[ChapterRecord], chunks: list[ChunkRecord]) -> None:
        conn.executemany(
            "INSERT INTO chapters (book_id, idx, title, start_chunk, start_page) VALUES (?, ?, ?, ?, ?)",
            [(book_id, c.index, c.title, c.start_chunk, c.start_page) for c in chapters],
        )
        conn.executemany(
            "INSERT INTO chunks (book_id, idx, chapter_idx, page_start, page_end, text, sentences)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (book_id, c.index, c.chapter_index, c.page_start, c.page_end, c.text, json.dumps(c.sentences))
                for c in chunks
            ],
        )
        conn.executemany(
            "INSERT INTO chunks_fts (text, book_id, idx) VALUES (?, ?, ?)",
            [(c.text, book_id, c.index) for c in chunks],
        )

    def rename_book(self, book_id: str, title: str) -> bool:
        with self.db.connect() as conn:
            cur = conn.execute("UPDATE books SET title = ? WHERE id = ?", (title, book_id))
            return cur.rowcount > 0

    def delete_book(self, book_id: str) -> bool:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM chunks_fts WHERE book_id = ?", (book_id,))
            cur = conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
            return cur.rowcount > 0

    # ------------------------------------------------------------------ reads

    def list_books(self) -> list[BookRecord]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM books ORDER BY created_at DESC").fetchall()
        return [BookRecord(**dict(r)) for r in rows]

    def get_book(self, book_id: str) -> BookRecord | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
        return BookRecord(**dict(row)) if row else None

    def get_chapters(self, book_id: str) -> list[ChapterRecord]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT idx, title, start_chunk, start_page FROM chapters WHERE book_id = ? ORDER BY idx",
                (book_id,),
            ).fetchall()
        return [ChapterRecord(index=r["idx"], title=r["title"], start_chunk=r["start_chunk"], start_page=r["start_page"]) for r in rows]

    def get_chunk(self, book_id: str, index: int) -> ChunkRecord | None:
        chunks = self.get_chunks(book_id, index, 1)
        return chunks[0] if chunks else None

    def get_chunks(self, book_id: str, start: int, limit: int) -> list[ChunkRecord]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM chunks WHERE book_id = ? AND idx >= ? ORDER BY idx LIMIT ?",
                (book_id, max(start, 0), limit),
            ).fetchall()
        return [self._row_to_chunk(r) for r in rows]

    def search(self, book_id: str, query: str, limit: int = 3, exclude: set[int] | None = None) -> list[ChunkRecord]:
        """Lexical (BM25) search over the book's chunks via SQLite FTS5."""
        terms = [t for t in re.findall(r"[\w']+", query.lower()) if t not in _STOPWORDS and len(t) > 2]
        if not terms:
            return []
        fts_query = " OR ".join(f'"{t.replace(chr(34), "")}"' for t in terms)
        exclude = exclude or set()
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT idx FROM chunks_fts WHERE chunks_fts MATCH ? AND book_id = ? ORDER BY bm25(chunks_fts) LIMIT ?",
                (fts_query, book_id, limit + len(exclude)),
            ).fetchall()
        indices = [int(r["idx"]) for r in rows if int(r["idx"]) not in exclude][:limit]
        return [c for i in indices if (c := self.get_chunk(book_id, i))]

    @staticmethod
    def _row_to_chunk(row) -> ChunkRecord:
        return ChunkRecord(
            book_id=row["book_id"],
            index=row["idx"],
            chapter_index=row["chapter_idx"],
            page_start=row["page_start"],
            page_end=row["page_end"],
            text=row["text"],
            sentences=[tuple(s) for s in json.loads(row["sentences"])],
        )
