"""SQLite database: the single source of truth for books, chunks, reading
state and conversation history. Lives under DATA_DIR, fully local."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    filename    TEXT NOT NULL,
    page_count  INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chapters (
    book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    title       TEXT NOT NULL,
    start_chunk INTEGER NOT NULL,
    start_page  INTEGER NOT NULL,
    PRIMARY KEY (book_id, idx)
);

CREATE TABLE IF NOT EXISTS chunks (
    book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    idx         INTEGER NOT NULL,
    chapter_idx INTEGER NOT NULL,
    page_start  INTEGER NOT NULL,
    page_end    INTEGER NOT NULL,
    text        TEXT NOT NULL,
    sentences   TEXT NOT NULL,          -- JSON: [[start, end, page], ...]
    PRIMARY KEY (book_id, idx)
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text,
    book_id UNINDEXED,
    idx UNINDEXED,
    tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS reading_state (
    book_id       TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    chapter_idx   INTEGER NOT NULL DEFAULT 0,
    chunk_idx     INTEGER NOT NULL DEFAULT 0,
    sentence_idx  INTEGER NOT NULL DEFAULT 0,
    char_offset   INTEGER NOT NULL DEFAULT 0,
    page          INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'IDLE',
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    text        TEXT NOT NULL,
    chunk_idx   INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS conversation_book ON conversation(book_id, id);

-- Global app settings (e.g. active LLM / speech provider), key -> value
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path: Path):
        self.path = path
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
