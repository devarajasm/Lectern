from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from ..deps import Container, get_container
from ..ingest import EmptyBook, ingest_pdf, reprocess_book
from ..pdf.extractor import NoExtractableText
from .schemas import BookDetailOut, BookOut, ChapterOut, ChunkOut

router = APIRouter(prefix="/api/books", tags=["books"])

MAX_UPLOAD_BYTES = 100 * 1024 * 1024


def _book_out(c: Container, book) -> dict:
    state = c.reading.get(book.id)
    progress = state.chunk_index / max(book.chunk_count - 1, 1) if book.chunk_count > 1 else 0.0
    if state.status.value == "FINISHED":
        progress = 1.0
    return {**book.__dict__, "progress": round(progress, 4), "status": state.status.value}


@router.post("", response_model=BookOut, status_code=201)
async def upload_book(file: UploadFile = File(...), c: Container = Depends(get_container)):
    if not (file.filename or "").lower().endswith(".pdf") and file.content_type != "application/pdf":
        raise HTTPException(400, "Please upload a PDF file.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "PDF is larger than 100 MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "This file does not look like a valid PDF.")
    try:
        book = ingest_pdf(data, file.filename or "book.pdf", c.books, c.settings)
    except (NoExtractableText, EmptyBook) as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(422, f"Could not read this PDF ({type(exc).__name__}).") from exc
    return _book_out(c, book)


@router.get("", response_model=list[BookOut])
def list_books(c: Container = Depends(get_container)):
    return [_book_out(c, b) for b in c.books.list_books()]


@router.get("/{book_id}", response_model=BookDetailOut)
def get_book(book_id: str, c: Container = Depends(get_container)):
    book = c.books.get_book(book_id)
    if book is None:
        raise HTTPException(404, "Book not found.")
    return {**_book_out(c, book), "chapters": [ChapterOut(**ch.__dict__) for ch in c.books.get_chapters(book_id)]}


@router.get("/{book_id}/chunks", response_model=list[ChunkOut])
def get_chunks(book_id: str, start: int = Query(0, ge=0), limit: int = Query(5, ge=1, le=50),
               c: Container = Depends(get_container)):
    if c.books.get_book(book_id) is None:
        raise HTTPException(404, "Book not found.")
    return [
        ChunkOut(index=ch.index, chapter_index=ch.chapter_index, page_start=ch.page_start,
                 page_end=ch.page_end, text=ch.text, sentences=ch.sentences)
        for ch in c.books.get_chunks(book_id, start, limit)
    ]


@router.post("/{book_id}/reprocess", response_model=BookOut)
def reprocess(book_id: str, c: Container = Depends(get_container)):
    """Re-extract the stored PDF with the current pipeline (keeps position by page)."""
    if c.books.get_book(book_id) is None:
        raise HTTPException(404, "Book not found.")
    try:
        book = reprocess_book(book_id, c.books, c.reading, c.settings)
    except (NoExtractableText, EmptyBook) as exc:
        raise HTTPException(422, str(exc)) from exc
    return _book_out(c, book)


@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: str, c: Container = Depends(get_container)):
    if not c.books.delete_book(book_id):
        raise HTTPException(404, "Book not found.")
    (c.settings.books_dir / f"{book_id}.pdf").unlink(missing_ok=True)
