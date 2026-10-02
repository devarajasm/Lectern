"""Wires the components together once per process (simple DI container)."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from .config import Settings, get_settings
from .context.builder import ContextBuilder
from .conversation.handler import ConversationHandler
from .llm.registry import ProviderRegistry
from .reading.manager import ReadingStateManager
from .speech.registry import SpeechRegistry
from .storage.books import BookRepository
from .storage.conversation import ConversationRepository
from .storage.db import Database
from .storage.settings import SettingsRepository


@dataclass
class Container:
    settings: Settings
    db: Database
    books: BookRepository
    conversation: ConversationRepository
    reading: ReadingStateManager
    llm: ProviderRegistry
    speech: SpeechRegistry
    handler: ConversationHandler


def build_container(settings: Settings) -> Container:
    db = Database(settings.db_path)
    books = BookRepository(db)
    conversation = ConversationRepository(db)
    reading = ReadingStateManager(db, books)
    store = SettingsRepository(db)
    context_builder = ContextBuilder(books, conversation, settings.context_char_budget, settings.history_turns)
    return Container(
        settings=settings,
        db=db,
        books=books,
        conversation=conversation,
        reading=reading,
        llm=ProviderRegistry(settings, store),
        speech=SpeechRegistry(settings, store),
        handler=ConversationHandler(reading, context_builder, conversation),
    )


@lru_cache
def _default_container() -> Container:
    return build_container(get_settings())


def get_container() -> Container:
    """FastAPI dependency. Tests override this with their own container."""
    return _default_container()
