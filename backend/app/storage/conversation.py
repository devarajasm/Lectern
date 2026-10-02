"""Conversation history per book (stored locally, never logged)."""
from __future__ import annotations

from dataclasses import dataclass

from .db import Database


@dataclass
class Turn:
    role: str  # "user" | "assistant"
    text: str
    chunk_index: int | None = None
    created_at: str = ""


class ConversationRepository:
    def __init__(self, db: Database):
        self.db = db

    def add(self, book_id: str, role: str, text: str, chunk_index: int | None) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO conversation (book_id, role, text, chunk_idx) VALUES (?, ?, ?, ?)",
                (book_id, role, text, chunk_index),
            )

    def recent(self, book_id: str, limit: int) -> list[Turn]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT role, text, chunk_idx, created_at FROM conversation WHERE book_id = ? ORDER BY id DESC LIMIT ?",
                (book_id, limit),
            ).fetchall()
        return [Turn(r["role"], r["text"], r["chunk_idx"], r["created_at"]) for r in reversed(rows)]

    def clear(self, book_id: str) -> None:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM conversation WHERE book_id = ?", (book_id,))
