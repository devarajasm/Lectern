"""Split extracted pages into readable, sentence-aligned chunks.

A chunk is the unit we display and persist position against; a sentence is
the unit we speak. Every sentence keeps its character span inside its chunk
and the page it starts on, so the reading position can be exact.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .extractor import ExtractedBook

TARGET_CHUNK_CHARS = 800
MAX_SENTENCE_CHARS = 400

_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e",
    "fig", "no", "vol", "ch", "p", "pp", "cf", "approx", "inc", "ltd", "co",
}
# Sentence end: . ! ? … optionally followed by closing quotes/brackets, then whitespace.
_SENTENCE_END = re.compile(r"(?<=[.!?…])[\"'”’)\]]*\s+")


@dataclass
class Sentence:
    start: int  # char offset within the chunk text
    end: int
    page: int   # 1-based page number


@dataclass
class Chunk:
    index: int
    chapter_index: int
    text: str
    sentences: list[Sentence] = field(default_factory=list)

    @property
    def page_start(self) -> int:
        return self.sentences[0].page

    @property
    def page_end(self) -> int:
        return self.sentences[-1].page


def split_sentences(paragraph: str) -> list[str]:
    pieces: list[str] = []
    last = 0
    for match in _SENTENCE_END.finditer(paragraph):
        candidate = paragraph[last:match.start()].strip()
        if not candidate:
            continue
        last_word = candidate.rstrip(".!?…\"'”’)]").split()[-1:] or [""]
        if last_word[0].lower().rstrip(".") in _ABBREVIATIONS or re.fullmatch(r"[A-Z]", last_word[0]):
            continue  # "Dr. Smith", "J. R. R. Tolkien" — keep going
        if paragraph[match.end():match.end() + 1].islower():
            continue  # '"Hello!" she said.' — the sentence goes on
        pieces.append(paragraph[last:match.end()].strip())
        last = match.end()
    tail = paragraph[last:].strip()
    if tail:
        pieces.append(tail)
    return [p for piece in pieces for p in _split_long(piece)]


def _split_long(sentence: str) -> list[str]:
    """Break run-on sentences at commas/semicolons so TTS requests stay small."""
    if len(sentence) <= MAX_SENTENCE_CHARS:
        return [sentence]
    parts: list[str] = []
    current = ""
    for token in re.split(r"(?<=[,;:])\s+", sentence):
        if current and len(current) + len(token) + 1 > MAX_SENTENCE_CHARS:
            parts.append(current)
            current = token
        else:
            current = f"{current} {token}".strip()
    if current:
        parts.append(current)
    # Still too long (no punctuation): hard-split on whitespace.
    final: list[str] = []
    for part in parts:
        while len(part) > MAX_SENTENCE_CHARS:
            cut = part.rfind(" ", 0, MAX_SENTENCE_CHARS)
            cut = cut if cut > 0 else MAX_SENTENCE_CHARS
            final.append(part[:cut].strip())
            part = part[cut:].strip()
        if part:
            final.append(part)
    return final


def chunk_book(book: ExtractedBook) -> list[Chunk]:
    chunks: list[Chunk] = []
    chapter_starts = [c.start_page for c in book.chapters] + [len(book.pages)]

    for chapter_index in range(len(book.chapters)):
        first, last = chapter_starts[chapter_index], chapter_starts[chapter_index + 1]
        builder = _ChunkBuilder(chapter_index, chunks)
        for paragraph, page in _paragraphs(book.pages[first:last], first):
            for i, sentence in enumerate(split_sentences(paragraph)):
                builder.add(sentence, page=page, new_paragraph=(i == 0))
        builder.flush()
    return chunks


_ENDS_SENTENCE = re.compile(r"[.!?…:][\"'”’)\]]*$")


def _paragraphs(pages: list[str], first_page_index: int):
    """Yield (paragraph, 1-based page). A paragraph cut by a page break is re-joined, so its
    sentences are not split in two (it is attributed to the page it starts on)."""
    pending: tuple[str, int] | None = None
    for offset, page_text in enumerate(pages):
        page = first_page_index + offset + 1
        for j, paragraph in enumerate(p for p in page_text.split("\n\n") if p.strip()):
            if pending and j == 0 and not _ENDS_SENTENCE.search(pending[0]):
                joined = pending[0][:-1] + paragraph if pending[0].endswith("-") and paragraph[:1].islower() \
                    else f"{pending[0]} {paragraph}"
                pending = (joined, pending[1])
                continue
            if pending:
                yield pending
            pending = (paragraph, page)
    if pending:
        yield pending


class _ChunkBuilder:
    def __init__(self, chapter_index: int, out: list[Chunk]):
        self.chapter_index = chapter_index
        self.out = out
        self.text = ""
        self.sentences: list[Sentence] = []

    def add(self, sentence: str, page: int, new_paragraph: bool) -> None:
        if self.text and len(self.text) + len(sentence) > TARGET_CHUNK_CHARS:
            self.flush()
        if self.text:
            self.text += "\n\n" if new_paragraph else " "
        start = len(self.text)
        self.text += sentence
        self.sentences.append(Sentence(start=start, end=len(self.text), page=page))

    def flush(self) -> None:
        if not self.sentences:
            return
        self.out.append(Chunk(
            index=len(self.out),
            chapter_index=self.chapter_index,
            text=self.text,
            sentences=self.sentences,
        ))
        self.text = ""
        self.sentences = []
