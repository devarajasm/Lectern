"""Regression tests for messy PDF text (calibre-style word-per-line output, drop caps, headings)."""
from app.pdf.chunker import chunk_book
from app.pdf.extractor import (
    Chapter, ExtractedBook, _detect_headings, _is_fragmented, _join_drop_caps, _reflow, normalise_typography,
)


def test_word_per_line_text_is_detected_as_fragmented():
    fragmented = "\n \n".join("‘So you saw the temples and the ghats? ’ Gopal asked.".split())
    assert _is_fragmented(fragmented)
    assert not _is_fragmented("A normal line of prose text here.\n" * 10)


def test_reflow_joins_wrapped_lines_and_keeps_real_paragraphs():
    lines = [
        "I walked out with the young director of GangaTech College, Gopal Mishra. His black Mercedes",
        "whisked us away from the crowded Vidyapath Road.",
        "",
        "‘So you saw the temples and the ghats?’ Gopal asked. ‘That’s all Varanasi has, anyway!",
        "",  # blank lines between every line must not create paragraphs mid-sentence
        "‘Yeah, I went to the Vishwanath Temple and Dashashwamedh Ghat at five in the morning. I love",
        "",
        "this city,’ I said.",
    ]
    assert _reflow(lines) == [
        "I walked out with the young director of GangaTech College, Gopal Mishra. His black Mercedes whisked us away from the crowded Vidyapath Road.",
        "‘So you saw the temples and the ghats?’ Gopal asked. ‘That’s all Varanasi has, anyway!",
        "‘Yeah, I went to the Vishwanath Temple and Dashashwamedh Ghat at five in the morning. I love this city,’ I said.",
    ]


def test_typography_spacing_artifacts():
    assert normalise_typography("‘ So you saw the ghats? ’ Gopal asked. ‘ That ’ s all , anyway!") == \
        "‘So you saw the ghats?’ Gopal asked. ‘That’s all, anyway!"


def test_drop_cap_is_rejoined():
    assert _join_drop_caps(["L", "azy parents, bread-butter again."]) == ["Lazy parents, bread-butter again."]


def test_sentence_across_page_break_is_one_sentence():
    book = ExtractedBook("T", ["He opened the door and", "walked in. Then he sat."], [Chapter("A", 0)])
    chunk = chunk_book(book)[0]
    sentences = [chunk.text[s.start:s.end] for s in chunk.sentences]
    assert sentences == ["He opened the door and walked in.", "Then he sat."]


def test_heading_detection_requires_consecutive_numbers():
    prose = [["Plain prose page."]] * 3
    pages = [["Prologue", "text."], ["1", "L", "azy"], *prose, ["2", "Text."], *prose, ["3", "Text."], *prose]
    found = _detect_headings(pages)
    assert found[0] == (0, "Prologue") and found[1][1] == "Chapter 1" and found[9][1] == "Chapter 3"
    # When most pages carry a bare number, those are page numbers, not chapters.
    assert _detect_headings([[str(n), "Some text."] for n in range(1, 11)]) == {}
    sparse = [["1", "x"], *prose, ["13", "x"], *prose, ["32", "x"], *prose]
    assert _detect_headings(sparse) == {}
