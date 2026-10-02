"""Logging configuration.

Privacy rule for the whole codebase: log identifiers, counts, status codes and
timings only. Never log book text, user questions, transcripts or answers.
"""
import logging


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # The OpenAI / httpx clients can log request bodies at DEBUG; keep them quiet.
    for noisy in ("openai", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
