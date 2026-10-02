# Changelog

All notable changes to Lectern are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-02

First public release: the core voice reading loop, **read → interrupt → ask → answer → resume**.

### Added
- **PDF ingestion:** text extraction with running header/footer and page-number removal, paragraph reflow, and repair of calibre-style word-per-line output, drop caps and quote spacing. Chapters come from PDF bookmarks or are detected in the text, with page sections as a fallback.
- **Sentence-aligned chunking:** per-sentence character offsets and page numbers, and sentences split by a page break are re-joined.
- **Persistent reading state** in local SQLite: book, chapter, page, chunk, sentence, exact character offset and status. It survives restarts and model changes.
- **Interruption** by Space, by tapping the agent orb, or hands-free (speak to interrupt). Reading resumes at the start of the interrupted sentence.
- **Grounded Q&A:** answers use only the current passage (with the interruption point marked), neighbouring passages, full-text search hits and recent conversation. The whole book is never sent to the model.
- **Multiple LLM providers** behind one `ModelProvider` interface: Azure OpenAI (v1 API), OpenAI (Responses API), Ollama, any OpenAI-compatible server (LM Studio, vLLM, llama.cpp) and Hugging Face transformers. One global active provider, switchable at runtime.
- **Two voice engines:**
  - Cloud: Azure OpenAI / OpenAI `gpt-4o-mini-transcribe` and `gpt-4o-mini-tts`, with the natural `marin`/`cedar` voices, paragraph-level narration and selectable narration styles.
  - Browser: the Web Speech API.
  - The app falls back automatically to the browser engine when cloud speech is unavailable.
- **Speech checks:** cloud speech-to-text is tested before first use, so a missing deployment never swallows your first question. Voice and listening fall back to the browser independently, and Settings shows the status of each. Azure transcription uses the deployment-based endpoint (`AZURE_OPENAI_AUDIO_API_VERSION`).
- **Web UI:** library with drag-and-drop upload, reader with live sentence and word highlighting, animated agent state, conversation panel, typed questions, settings drawer, light/dark themes and keyboard shortcuts.
- **Reading themes:** Paper, Sepia, Slate, Night, Midnight and Forest, plus Auto (follows the system).
- **Ambient backgrounds:** Aurora (soft light that changes colour with the agent's state), Glow, a Paper texture, or Plain. Aurora respects the system's reduced-motion setting.
- **Accent colours:** Ember, Rose, Violet, Ocean, Teal and Gold.
- **Typography:** six bundled reading fonts (Literata, Source Serif, Garamond, Merriweather, Inter, and Atkinson Hyperlegible for readability), with adjustable size, line spacing and column width.
- **Highlighting:** current-sentence styles (Marker, Underline, Glow) and a focus mode that fades everything except the sentence being read.
- **"Aa" panel** in the reader header for changing appearance while you read. The same controls are under Settings → Appearance, with a reset button.
- **Privacy by design:** all data is stored locally, logs never contain book text or conversations, and provider calls use `store=false`.
- **Network setup:** the backend uses the OS certificate store for HTTPS (works behind corporate TLS proxies).
- **Maintenance:** stored books can be reprocessed in place (`python -m app.ingest`).
