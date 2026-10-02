from app.deps import build_container
from app.reading.state import ReadingStatus


def test_position_survives_restart(client, container, book_id):
    chunk = container.books.get_chunk(book_id, 0)
    mid_second_sentence = chunk.sentences[1][0] + 5
    state = container.reading.interrupt(book_id, 0, mid_second_sentence)
    assert state.status == ReadingStatus.LISTENING
    assert state.sentence_index == 1
    assert state.char_offset == mid_second_sentence

    # Simulate a process restart: brand-new container over the same data dir.
    fresh = build_container(container.settings)
    restored = fresh.reading.get(book_id)
    assert (restored.chunk_index, restored.char_offset, restored.status) == (0, mid_second_sentence, ReadingStatus.LISTENING)

    resumed = fresh.reading.resume_point(book_id)
    assert resumed.status == ReadingStatus.RESUMING
    assert resumed.sentence_index == 1
    assert resumed.char_offset == chunk.sentences[1][0]  # back to the start of the interrupted sentence


def test_position_is_clamped_and_derives_chapter(container, book_id):
    book = container.books.get_book(book_id)
    state = container.reading.update_position(book_id, 999, sentence_index=999)
    assert state.chunk_index == book.chunk_count - 1
    assert state.chapter_index == 1
    assert state.page >= 3
