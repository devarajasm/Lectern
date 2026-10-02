"""PDF → clean per-page text + chapter structure.

Uses pypdf (pure Python, permissive licence). OCR for scanned PDFs is out of
scope for the MVP; such files raise ``NoExtractableText``.
"""
from __future__ import annotations

import io
import re
from collections import Counter
from dataclasses import dataclass, field

from pypdf import PdfReader

PAGES_PER_FALLBACK_SECTION = 10


class NoExtractableText(ValueError):
    """The PDF contains no text layer (probably scanned images)."""


@dataclass
class Chapter:
    title: str
    start_page: int  # 0-based page index


@dataclass
class ExtractedBook:
    title: str
    pages: list[str]  # cleaned text per page, 0-based
    chapters: list[Chapter] = field(default_factory=list)


def extract_book(pdf_bytes: bytes, fallback_title: str) -> ExtractedBook:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    raw_pages = [_page_text(page) for page in reader.pages]
    split = [[_SPACES.sub(" ", ln).strip() for ln in page.splitlines()] for page in raw_pages]
    headings = _detect_headings(split)
    for page_index, (line_index, title) in headings.items():
        split[page_index][line_index] = title  # e.g. "1" -> "Chapter 1", read aloud as its own paragraph
    pages = _clean_pages(split, protected=headings)

    if sum(len(p.strip()) for p in pages) < 20:
        raise NoExtractableText("No extractable text found. Scanned PDFs need OCR, which is not supported yet.")

    title = _metadata_title(reader) or fallback_title
    chapters = (_chapters_from_outline(reader) or _chapters_from_headings(headings)
                or _fallback_chapters(len(pages), named=headings))
    return ExtractedBook(title=title, pages=pages, chapters=chapters)


# --------------------------------------------------------------------------- metadata

def _metadata_title(reader: PdfReader) -> str | None:
    try:
        title = (reader.metadata or {}).get("/Title")
    except Exception:
        return None
    if title and isinstance(title, str) and len(title.strip()) > 1:
        return title.strip()
    return None


def _chapters_from_outline(reader: PdfReader) -> list[Chapter]:
    """Top-level bookmarks become chapters."""
    try:
        outline = reader.outline
    except Exception:
        return []
    chapters: list[Chapter] = []
    for item in outline or []:
        if isinstance(item, list):  # nested children of the previous item
            continue
        try:
            page = reader.get_destination_page_number(item)
        except Exception:
            continue
        title = str(getattr(item, "title", "") or "").strip()
        if page is not None and page >= 0 and title:
            chapters.append(Chapter(title=title, start_page=page))

    chapters.sort(key=lambda c: c.start_page)
    deduped: list[Chapter] = []
    for chapter in chapters:
        if deduped and deduped[-1].start_page == chapter.start_page:
            continue
        deduped.append(chapter)
    if deduped and deduped[0].start_page > 0:
        deduped.insert(0, Chapter(title="Front matter", start_page=0))
    return deduped


def _fallback_chapters(page_count: int, named: dict[int, tuple[int, str]] | None = None) -> list[Chapter]:
    """Fixed page ranges, plus any named sections that were found (e.g. Prologue)."""
    named = named or {}
    if page_count <= PAGES_PER_FALLBACK_SECTION and not named:
        return [Chapter(title="Full text", start_page=0)]
    starts = {p: title for p, (_, title) in named.items()}
    for start in range(0, page_count, PAGES_PER_FALLBACK_SECTION):
        if not any(0 <= start - p < 3 or 0 <= p - start < 3 for p in named):
            starts[start] = ""
    ordered = sorted(starts)
    chapters = []
    for k, start in enumerate(ordered):
        end = (ordered[k + 1] if k + 1 < len(ordered) else page_count)
        chapters.append(Chapter(title=starts[start] or f"Pages {start + 1}–{end}", start_page=start))
    if chapters and chapters[0].start_page > 0:
        chapters.insert(0, Chapter(title=f"Pages 1–{chapters[0].start_page}", start_page=0))
    return chapters


# --------------------------------------------------------------------------- extraction

def _page_text(page) -> str:
    """Default extraction is fast and usually right, but PDFs that position every word
    separately (calibre, some e-book converters) come out one word per line. Layout mode
    reconstructs those lines from glyph positions."""
    text = page.extract_text() or ""
    if _is_fragmented(text):
        try:
            layout = page.extract_text(extraction_mode="layout") or ""
            if layout.strip():
                return layout
        except Exception:
            pass
    return text


def _is_fragmented(text: str) -> bool:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if len(lines) < 8:
        return False
    words = sum(len(ln.split()) for ln in lines)
    return words / len(lines) < 2.5


# --------------------------------------------------------------------------- chapter headings

_NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
                 "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
                 "twenty", "twenty-one", "twenty-two", "twenty-three", "twenty-four", "twenty-five", "twenty-six",
                 "twenty-seven", "twenty-eight", "twenty-nine", "thirty"]
_NAMED_SECTION = re.compile(r"^(prologue|epilogue|preface|foreword|introduction|afterword|acknowledg(e)?ments)$", re.I)
_CHAPTER_WORD = re.compile(r"^chapter\s+([\w-]+)\b[.:]?\s*(.{0,60})$", re.I)
_ROMAN = re.compile(r"^(?=[ivxlc]+$)c{0,3}(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$", re.I)


def _heading_number(line: str) -> int | None:
    t = line.strip().rstrip(".").lower()
    if t.isdigit() and len(t) <= 3:
        return int(t)
    if t in _NUMBER_WORDS:
        return _NUMBER_WORDS.index(t) + 1
    if _ROMAN.match(t) and t != "i":  # a lone "I" is far more often the pronoun
        values = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}
        total = 0
        for a, b in zip(t, t[1:] + " "):
            v = values[a]
            total += -v if b != " " and values.get(b, 0) > v else v
        return total or None
    return None


def _detect_headings(pages: list[list[str]]) -> dict[int, tuple[int, str]]:
    """Find chapter headings near the top of pages when the PDF has no bookmarks.
    Returns {page_index: (line_index, title)}.

    Bare numbers are ambiguous (page numbers vs chapter numbers): they only count as
    chapters if most pages do NOT carry a bare number, and the numbers increase."""
    numbered_pages = sum(
        1 for lines in pages
        if (ne := [ln for ln in lines if ln]) and (_PAGE_NUMBER.match(ne[0]) or _PAGE_NUMBER.match(ne[-1]))
    )
    bare_numbers_are_page_numbers = numbered_pages > 0.3 * max(len(pages), 1)

    found: dict[int, tuple[int, str]] = {}
    numeric: list[tuple[int, int]] = []  # (page_index, number)
    for p, lines in enumerate(pages):
        top = [(i, ln) for i, ln in enumerate(lines) if ln][:3]
        for i, ln in top:
            if _NAMED_SECTION.match(ln):
                found[p] = (i, ln.strip().title())
                break
            if m := _CHAPTER_WORD.match(ln):
                found[p] = (i, ln.strip().rstrip("."))
                numeric.append((p, _heading_number(m.group(1)) or 0))
                break
            n = _heading_number(ln)
            if n is not None and not (bare_numbers_are_page_numbers and ln.strip().isdigit()):
                found[p] = (i, f"Chapter {ln.strip().rstrip('.')}")
                numeric.append((p, n))
                break

    # Numbered headings must be (mostly) consecutive: 1, 2, 3... Sparse hits like 1, 13, 32
    # mean most headings are images, and partial chapters would mislabel the book.
    if numeric:
        consecutive = sum(1 for (_, a), (_, b) in zip(numeric, numeric[1:]) if b == a + 1)
        if len(numeric) < 3 or consecutive < 0.7 * (len(numeric) - 1):
            for p, _ in numeric:
                found.pop(p, None)
    return found


def _chapters_from_headings(headings: dict[int, tuple[int, str]]) -> list[Chapter]:
    if len(headings) < 3:
        return []
    chapters = [Chapter(title=title, start_page=p) for p, (_, title) in sorted(headings.items())]
    if chapters[0].start_page > 0:
        chapters.insert(0, Chapter(title="Front matter", start_page=0))
    return chapters


# --------------------------------------------------------------------------- cleanup

_PAGE_NUMBER = re.compile(r"^\s*(page\s*)?\d{1,4}\s*(of\s*\d{1,4})?\s*$", re.IGNORECASE)
_SPACES = re.compile(r"[ \t\u00a0]+")
_ENDS_SENTENCE = re.compile(r"[.!?…:][\"'”’)\]]*$")
_STARTS_NEW = re.compile(r"^[\"'‘“(\[A-Z0-9—–-]")


def _clean_pages(split: list[list[str]], protected: dict[int, tuple[int, str]]) -> list[str]:
    repeated = _repeated_edge_lines(split)
    return [
        _clean_page(lines, repeated, protected.get(i, (None, ""))[0])
        for i, lines in enumerate(split)
    ]


def _repeated_edge_lines(pages: list[list[str]]) -> set[str]:
    """Lines that appear as the first/last line on many pages are running headers/footers."""
    if len(pages) < 4:
        return set()
    counts: Counter[str] = Counter()
    for lines in pages:
        non_empty = [ln for ln in lines if ln]
        edges = set(non_empty[:2] + non_empty[-2:])
        counts.update(_normalise_edge(ln) for ln in edges)
    threshold = max(3, len(pages) // 2)
    return {line for line, n in counts.items() if n >= threshold and line}


def _normalise_edge(line: str) -> str:
    return re.sub(r"\d+", "#", line.lower()).strip()


def _clean_page(lines: list[str], repeated: set[str], heading_line: int | None = None) -> str:
    kept: list[str] = []
    for i, ln in enumerate(lines):
        if i == heading_line:
            kept += ["", ln, ""]  # chapter heading: always its own paragraph
        elif not ln or (not _PAGE_NUMBER.match(ln) and _normalise_edge(ln) not in repeated):
            kept.append(ln)
    paragraphs = _reflow(_join_drop_caps(kept))
    return "\n\n".join(normalise_typography(p) for p in paragraphs if p)


def _join_drop_caps(lines: list[str]) -> list[str]:
    """A decorative initial extracted as its own line ("L" / "azy parents...") is re-attached."""
    out: list[str] = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        nxt = next((j for j in range(i + 1, min(i + 3, len(lines))) if lines[j]), None)
        if len(ln) == 1 and ln.isupper() and nxt is not None and lines[nxt][:1].islower():
            out.append(ln + lines[nxt])
            i = nxt + 1
            continue
        out.append(ln)
        i += 1
    return out


def _reflow(lines: list[str]) -> list[str]:
    """Join wrapped lines into paragraphs.

    Blank lines alone are not trusted (some extractors emit them between every line or
    even every word). A new paragraph starts only when the previous line ends a sentence
    and either a blank line follows or the previous line is noticeably short (the ragged
    last line of a paragraph); or after a short heading-like line.
    """
    lengths = sorted(len(ln) for ln in lines if ln)
    if not lengths:
        return []
    full = lengths[int(len(lengths) * 0.8)]  # typical full line width

    paragraphs: list[str] = []
    current = ""
    prev_line = ""
    blank_since_prev = False
    for line in lines:
        if not line:
            blank_since_prev = True
            continue
        if not current:
            current, prev_line, blank_since_prev = line, line, False
            continue
        ends = bool(_ENDS_SENTENCE.search(prev_line))
        short = len(prev_line) < 0.7 * full
        starts_new = bool(_STARTS_NEW.match(line))
        heading = short and len(prev_line) < 0.5 * full and not ends and prev_line[:1].isupper() and len(prev_line.split()) <= 8 \
            and current == prev_line
        if starts_new and ((ends and (blank_since_prev or short)) or heading):
            paragraphs.append(current)
            current = line
        elif current.endswith("-") and line[:1].islower():
            current = current[:-1] + line  # re-join hyphenated word
        else:
            current = f"{current} {line}"
        prev_line, blank_since_prev = line, False
    if current:
        paragraphs.append(current)
    return paragraphs


_CONTRACTION = re.compile(r"(?<=\w)\s*([’'])\s+(?=(?:s|t|d|m|ll|re|ve)\b)", re.IGNORECASE)
_OPEN_QUOTE = re.compile(r"([‘“])\s+(?=\w)")
_CLOSE_QUOTE = re.compile(r"(?<=[\w.,!?…])\s+([’”])(?=\s|$|[.,;:!?)\]])")
_SPACE_BEFORE_PUNCT = re.compile(r"(?<=\w)\s+([,.;:!?])(?=\s|$)")


def normalise_typography(text: str) -> str:
    """Fix spacing artefacts from PDF extraction: "That ’ s" → "That’s", "‘ So" → "‘So"."""
    text = _CONTRACTION.sub(r"\1", text)
    text = _OPEN_QUOTE.sub(r"\1", text)
    text = _CLOSE_QUOTE.sub(r"\1", text)
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)
    return _SPACES.sub(" ", text).strip()
