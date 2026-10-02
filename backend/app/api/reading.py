from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..deps import Container, get_container
from ..reading.manager import BookNotFound
from ..reading.state import ReadingStatus
from .schemas import InterruptIn, PositionIn, StateOut, StatusIn

router = APIRouter(prefix="/api/books/{book_id}/state", tags=["reading"])


def _status(value: str | None) -> ReadingStatus | None:
    if value is None:
        return None
    try:
        return ReadingStatus(value)
    except ValueError as exc:
        raise HTTPException(400, f"Unknown status '{value}'.") from exc


def _out(state) -> StateOut:
    return StateOut(**state.to_dict())


@router.get("", response_model=StateOut)
def get_state(book_id: str, c: Container = Depends(get_container)):
    try:
        return _out(c.reading.get(book_id))
    except BookNotFound:
        raise HTTPException(404, "Book not found.")


@router.put("", response_model=StateOut)
def update_position(book_id: str, body: PositionIn, c: Container = Depends(get_container)):
    try:
        return _out(c.reading.update_position(
            book_id, body.chunk_index, char_offset=body.char_offset,
            sentence_index=body.sentence_index, status=_status(body.status)))
    except BookNotFound:
        raise HTTPException(404, "Book not found.")


@router.post("/status", response_model=StateOut)
def set_status(book_id: str, body: StatusIn, c: Container = Depends(get_container)):
    try:
        return _out(c.reading.set_status(book_id, _status(body.status)))
    except BookNotFound:
        raise HTTPException(404, "Book not found.")


@router.post("/interrupt", response_model=StateOut)
def interrupt(book_id: str, body: InterruptIn, c: Container = Depends(get_container)):
    try:
        return _out(c.reading.interrupt(book_id, body.chunk_index, body.char_offset))
    except BookNotFound:
        raise HTTPException(404, "Book not found.")


@router.post("/resume", response_model=StateOut)
def resume(book_id: str, c: Container = Depends(get_container)):
    try:
        return _out(c.reading.resume_point(book_id))
    except BookNotFound:
        raise HTTPException(404, "Book not found.")


@router.post("/restart", response_model=StateOut)
def restart(book_id: str, c: Container = Depends(get_container)):
    try:
        return _out(c.reading.restart(book_id))
    except BookNotFound:
        raise HTTPException(404, "Book not found.")
