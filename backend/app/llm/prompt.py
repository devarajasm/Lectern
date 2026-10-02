"""Prompt construction shared by all providers."""
from __future__ import annotations

from ..context.builder import BookContext

SYSTEM_PROMPT = """You are a warm, knowledgeable reading companion inside a voice audiobook app.
The listener interrupted the narration to ask something. Answer it out loud.

Rules:
- Your answer will be spoken by text-to-speech: plain conversational sentences only.
  No markdown, bullet points, headings, emojis or URLs.
- Be concise: usually 2 to 5 sentences. Go longer only if the listener asks for detail.
- Ground your answer in the provided book passages. The marker [[LISTENER INTERRUPTED HERE]]
  shows exactly where narration stopped; "that" or "this" usually refers to the text just before it.
- Do not reveal plot points from the "Next passage (not yet read)" unless the listener asks you to.
- If the passages do not contain the answer, say so briefly and offer general knowledge, clearly labelled as such.
- Do not ask whether to continue reading; the app does that."""


def render_user_prompt(ctx: BookContext, question: str) -> str:
    parts = [f'Book: "{ctx.book_title}"']
    if ctx.chapter_title:
        parts.append(f"Section: {ctx.chapter_title}")
    parts.append(f"Current page: {ctx.page}\n")

    for passage in ctx.related:
        parts.append(f"--- {passage.label} (pages {passage.page_start}-{passage.page_end}) ---\n{passage.text}\n")
    for passage in ctx.nearby:
        if passage.label.startswith("Previous"):
            parts.append(f"--- {passage.label} (pages {passage.page_start}-{passage.page_end}) ---\n{passage.text}\n")
    parts.append(f"--- {ctx.current.label} (pages {ctx.current.page_start}-{ctx.current.page_end}) ---\n{ctx.current.text}\n")
    for passage in ctx.nearby:
        if passage.label.startswith("Next"):
            parts.append(f"--- {passage.label} (pages {passage.page_start}-{passage.page_end}) ---\n{passage.text}\n")

    if ctx.history:
        parts.append("--- Earlier in this conversation ---")
        for turn in ctx.history:
            who = "Listener" if turn.role == "user" else "You"
            parts.append(f"{who}: {turn.text}")
        parts.append("")

    parts.append(f"Listener's question: {question}")
    return "\n".join(parts)


def build_messages(ctx: BookContext, question: str) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": render_user_prompt(ctx, question)},
    ]
