from app.pdf.chunker import chunk_book, split_sentences
from app.pdf.extractor import Chapter, ExtractedBook, extract_book

from .conftest import make_pdf


def test_split_sentences_handles_abbreviations():
    text = 'Dr. Smith met J. R. Tolkien. "Hello!" she said. Was it real? Yes.'
    assert split_sentences(text) == ["Dr. Smith met J. R. Tolkien.", '"Hello!" she said.', "Was it real?", "Yes."]


def test_long_sentence_is_split():
    long = ", ".join(["a clause that keeps going"] * 40) + "."
    parts = split_sentences(long)
    assert len(parts) > 1 and all(len(p) <= 400 for p in parts)


def test_chunks_respect_chapters_and_offsets():
    book = ExtractedBook(
        title="T",
        pages=["One. Two. Three.", "Four. Five.", "Six."],
        chapters=[Chapter("A", 0), Chapter("B", 2)],
    )
    chunks = chunk_book(book)
    assert [c.chapter_index for c in chunks] == [0, 1]
    for chunk in chunks:
        for s in chunk.sentences:
            assert chunk.text[s.start:s.end].strip() == chunk.text[s.start:s.end]
    assert chunks[0].page_start == 1 and chunks[0].page_end == 2
    assert chunks[0].text[chunks[0].sentences[3].start:chunks[0].sentences[3].end] == "Four."


def test_extract_reads_outline_as_chapters():
    book = extract_book(make_pdf(), "fallback")
    assert book.title == "The Keeper of Widow's Reef"
    assert [c.title for c in book.chapters] == ["The Lighthouse", "The Reef"]
    assert "lighthouse" in book.pages[0].lower()
