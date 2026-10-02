"""PDF upload → extraction → chunking → storage (and re-processing of stored books)."""
from __future__ import annotations

import logging
import uuid

from .config import Settings
from .pdf.chunker import chunk_book
from .pdf.extractor import extract_book
from .reading.manager import ReadingStateManager
from .storage.books import BookRecord, BookRepository, ChapterRecord, ChunkRecord

log = logging.getLogger(__name__)


class EmptyBook(ValueError):
    pass


def _process(pdf_bytes: bytes, fallback_title: str, book_id: str):
    extracted = extract_book(pdf_bytes, fallback_title)
    chunks = chunk_book(extracted)
    if not chunks:
        raise EmptyBook("No readable sentences were found in this PDF.")

    # Keep only chapters that actually received text, and re-index them densely.
    used = sorted({c.chapter_index for c in chunks})
    remap = {old: new for new, old in enumerate(used)}
    chapters = []
    for old in used:
        first_chunk = next(c for c in chunks if c.chapter_index == old)
        chapters.append(ChapterRecord(
            index=remap[old],
            title=extracted.chapters[old].title,
            start_chunk=first_chunk.index,
            start_page=first_chunk.page_start,
        ))
    records = [
        ChunkRecord(
            book_id=book_id,
            index=c.index,
            chapter_index=remap[c.chapter_index],
            page_start=c.page_start,
            page_end=c.page_end,
            text=c.text,
            sentences=[(s.start, s.end, s.page) for s in c.sentences],
        )
        for c in chunks
    ]
    return extracted, chapters, records


def ingest_pdf(pdf_bytes: bytes, filename: str, repo: BookRepository, settings: Settings) -> BookRecord:
    fallback_title = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip() or "Untitled"
    book_id = uuid.uuid4().hex[:12]
    extracted, chapters, chunks = _process(pdf_bytes, fallback_title, book_id)
    record = BookRecord(
        id=book_id,
        title=extracted.title,
        filename=filename,
        page_count=len(extracted.pages),
        chunk_count=len(chunks),
        created_at="",
    )
    repo.save_book(record, chapters, chunks)
    (settings.books_dir / f"{book_id}.pdf").write_bytes(pdf_bytes)
    log.info("ingested book=%s pages=%d chunks=%d chapters=%d", book_id, record.page_count, len(chunks), len(chapters))
    return repo.get_book(book_id) or record


def reprocess_book(book_id: str, repo: BookRepository, reading: ReadingStateManager, settings: Settings) -> BookRecord:
    """Re-extract a stored book with the current pipeline. The reading position is kept
    at the same page (start of the first passage on that page); conversation is kept."""
    book = repo.get_book(book_id)
    if book is None:
        raise LookupError(book_id)
    pdf_bytes = (settings.books_dir / f"{book_id}.pdf").read_bytes()
    old_state = reading.get(book_id)

    extracted, chapters, chunks = _process(pdf_bytes, book.title, book_id)
    repo.replace_content(book_id, len(extracted.pages), chapters, chunks)

    target_chunk, target_sentence = 0, 0
    for chunk in chunks:
        hit = next((i for i, (_s, _e, page) in enumerate(chunk.sentences) if page >= old_state.page), None)
        if hit is not None:
            target_chunk, target_sentence = chunk.index, hit
            break
    reading.update_position(book_id, target_chunk, sentence_index=target_sentence,
                            status=old_state.status if old_state.status.value in ("IDLE", "FINISHED") else None)
    log.info("reprocessed book=%s chunks=%d chapters=%d", book_id, len(chunks), len(chapters))
    return repo.get_book(book_id) or book


if __name__ == "__main__":
    # python -m app.ingest  → re-process every stored book with the current extractor
    from .config import get_settings
    from .deps import build_container
    from .logging_setup import configure_logging

    configure_logging()
    c = build_container(get_settings())
    for b in c.books.list_books():
        reprocess_book(b.id, c.books, c.reading, c.settings)
