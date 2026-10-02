from app.context.builder import INTERRUPT_MARKER, ContextBuilder
from app.conversation.handler import Intent, classify


def test_classify():
    assert classify("Yes, continue please") == Intent.RESUME
    assert classify("go on") == Intent.RESUME
    assert classify("Wait") == Intent.EMPTY
    assert classify("stop") == Intent.STOP
    assert classify("start reading the book") == Intent.START
    assert classify("start from the beginning") == Intent.RESTART
    assert classify("say that again") == Intent.REPEAT
    assert classify("Wait, what does that mean?") == Intent.QUESTION
    assert classify("why did the keeper continue to stay?") == Intent.QUESTION


def test_context_is_bounded_and_marked(container, book_id):
    state = container.reading.interrupt(book_id, 0, 20)
    ctx = container.handler.context_builder.build(state, "Who is Dr. Elwin?")
    assert INTERRUPT_MARKER in ctx.current.text
    assert ctx.total_chars() <= container.settings.context_char_budget

    tiny = ContextBuilder(container.books, container.conversation, char_budget=200)
    small = tiny.build(state, "reef schooner")
    assert small.total_chars() <= 200 + len(INTERRUPT_MARKER)


def test_full_loop_read_interrupt_answer_resume(client, container, book_id):
    # READ
    r = client.put(f"/api/books/{book_id}/state", json={"chunk_index": 0, "sentence_index": 0, "status": "READING"})
    assert r.json()["status"] == "READING"
    # INTERRUPT mid-sentence
    chunk = client.get(f"/api/books/{book_id}/chunks", params={"start": 0, "limit": 1}).json()[0]
    offset = chunk["sentences"][1][0] + 3
    r = client.post(f"/api/books/{book_id}/state/interrupt", json={"chunk_index": 0, "char_offset": offset})
    assert r.json()["status"] == "LISTENING"
    # QUESTION -> ANSWER
    r = client.post(f"/api/books/{book_id}/converse", json={"text": "Wait, what does that mean?"})
    body = r.json()
    assert body["intent"] == "QUESTION" and body["answer"].startswith("Answer about")
    assert body["state"]["status"] == "ANSWERING"
    assert INTERRUPT_MARKER in container.fake.calls[0][0].current.text
    # RESUME at the interrupted sentence
    r = client.post(f"/api/books/{book_id}/converse", json={"text": "continue"})
    body = r.json()
    assert body["intent"] == "RESUME"
    assert body["state"]["status"] == "RESUMING"
    assert body["state"]["sentence_index"] == 1
    assert body["state"]["char_offset"] == chunk["sentences"][1][0]
    # Conversation persisted
    turns = client.get(f"/api/books/{book_id}/conversation").json()
    assert [t["role"] for t in turns] == ["user", "assistant"]


def test_upload_rejects_non_pdf(client):
    r = client.post("/api/books", files={"file": ("x.pdf", b"hello", "application/pdf")})
    assert r.status_code == 400


def test_providers_endpoint(client):
    data = client.get("/api/providers").json()
    ids = {p["id"] for p in data["llm"]["providers"]}
    assert {"azure", "openai", "ollama", "openai_compatible", "huggingface"} <= ids
    assert data["speech"]["server_speech_available"] is False
    r = client.put("/api/providers", json={"llm_provider": "ollama"})
    assert r.json()["llm"]["active"] == "ollama"
    assert client.put("/api/providers", json={"llm_provider": "nope"}).status_code == 400


def test_rename_book(client, book_id):
    r = client.patch(f"/api/books/{book_id}", json={"title": "  The   Keeper  "})
    assert r.status_code == 200 and r.json()["title"] == "The Keeper"
    assert client.get(f"/api/books/{book_id}").json()["title"] == "The Keeper"
    assert client.patch(f"/api/books/{book_id}", json={"title": "   "}).status_code == 422
    assert client.patch(f"/api/books/{book_id}", json={"title": ""}).status_code == 422
    assert client.patch("/api/books/nope", json={"title": "X"}).status_code == 404
