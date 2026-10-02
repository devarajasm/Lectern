from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.config import Settings
from app.deps import build_container, get_container
from app.llm.base import ModelProvider, ProviderInfo
from app.main import app

CHAPTERS = {
    "The Lighthouse": [
        "Mara climbed the spiral stairs of the old lighthouse. The lamp had been dark for twenty years. "
        "Dr. Elwin said the keeper vanished one winter night. Nobody in the village spoke of it.",
        "At the top she found a brass telescope pointed at the reef. Its lens was cracked but clean. "
        "Someone had been here recently, she thought.",
    ],
    "The Reef": [
        "The reef was a crescent of black rock that swallowed ships. Fishermen called it the Widow's Teeth. "
        "Mara rowed out at dawn with a lantern and a map.",
        "Beneath the water she saw the outline of a sunken schooner. Its name, Aurora, was still legible on the bow.",
    ],
}


def make_pdf(chapters: dict[str, list[str]] = CHAPTERS) -> bytes:
    buf = io.BytesIO()
    pdf = canvas.Canvas(buf, pagesize=letter)
    pdf.setTitle("The Keeper of Widow's Reef")
    for ch_title, pages in chapters.items():
        for page_no, text in enumerate(pages):
            if page_no == 0:
                pdf.bookmarkPage(ch_title)
                pdf.addOutlineEntry(ch_title, ch_title, level=0)
            obj = pdf.beginText(72, 720)
            obj.setFont("Helvetica", 11)
            line = ""
            for word in text.split():
                if len(line) + len(word) > 80:
                    obj.textLine(line)
                    line = word
                else:
                    line = f"{line} {word}".strip()
            obj.textLine(line)
            pdf.drawText(obj)
            pdf.showPage()
    pdf.save()
    return buf.getvalue()


class FakeProvider(ModelProvider):
    def __init__(self):
        self.info = ProviderInfo("fake", "Fake", "local", "fake-1", True)
        self.calls = []

    def generate(self, context, question):
        self.calls.append((context, question))
        return f"Answer about {context.book_title}."


@pytest.fixture
def container(tmp_path):
    settings = Settings(_env_file=None, data_dir=tmp_path, llm_provider="fake", speech_provider="none")
    c = build_container(settings)
    c.fake = FakeProvider()
    c.llm.register(c.fake)
    c.llm.set_active("fake")
    return c


@pytest.fixture
def client(container):
    app.dependency_overrides[get_container] = lambda: container
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def sample_pdf() -> bytes:
    return make_pdf()


@pytest.fixture
def book_id(client, sample_pdf) -> str:
    res = client.post("/api/books", files={"file": ("keeper.pdf", sample_pdf, "application/pdf")})
    assert res.status_code == 201, res.text
    return res.json()["id"]
