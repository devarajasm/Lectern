from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import Container, get_container
from ..llm.base import ProviderError, ProviderUnavailable
from ..reading.manager import BookNotFound
from ..reading.state import ReadingStatus
from .schemas import ConverseIn, ConverseOut, StateOut, TurnOut

router = APIRouter(prefix="/api/books/{book_id}", tags=["conversation"])


@router.post("/converse", response_model=ConverseOut)
def converse(book_id: str, body: ConverseIn, c: Container = Depends(get_container)):
    try:
        result = c.handler.handle(book_id, body.text, c.llm.active())
    except BookNotFound:
        raise HTTPException(404, "Book not found.")
    except ProviderUnavailable as exc:
        c.reading.set_status(book_id, ReadingStatus.PAUSED)
        raise HTTPException(503, str(exc)) from exc
    except ProviderError as exc:
        c.reading.set_status(book_id, ReadingStatus.PAUSED)
        raise HTTPException(502, str(exc)) from exc
    return ConverseOut(intent=result.intent.value, answer=result.answer, state=StateOut(**result.state.to_dict()))


@router.get("/conversation", response_model=list[TurnOut])
def conversation(book_id: str, limit: int = Query(50, ge=1, le=200), c: Container = Depends(get_container)):
    if c.books.get_book(book_id) is None:
        raise HTTPException(404, "Book not found.")
    return [TurnOut(role=t.role, text=t.text, chunk_index=t.chunk_index, created_at=t.created_at)
            for t in c.conversation.recent(book_id, limit)]


@router.delete("/conversation", status_code=204)
def clear_conversation(book_id: str, c: Container = Depends(get_container)):
    c.conversation.clear(book_id)
