# Contributing to Lectern

Thanks for your interest! Bug reports, ideas and pull requests are all welcome.

## Ground rules

- **Privacy first.** Never log book text, questions, transcripts or answers. Logs may contain IDs, counts, status codes and timings only. Don't commit PDFs, API keys or `data/`.
- **Keep the core loop working:** read → interrupt → ask → answer → resume. Add a test when you touch it.
- **Provider independence.** Application code talks to `ModelProvider`, `SpeechProvider` (backend) and `TTSEngine`/`STTEngine` (frontend), never to a vendor SDK directly.
- Be kind; see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

```bash
cp .env.example .env
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000        # terminal 1
cd frontend && npm install && npm run dev         # terminal 2 → http://localhost:5173
```

The test suite needs no API keys: providers are faked or mocked.

```bash
cd backend && python -m pytest
cd frontend && npm run build      # type-check + production build
```

## Pull requests

1. Fork, then branch from `main` (`fix/…`, `feat/…`).
2. Keep changes focused, and match the surrounding code style.
3. Add or update tests. Run both commands above.
4. Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
5. Open the PR and describe what changed and how you tested it.

By contributing, you agree that your contributions are licensed under the project's [AGPL-3.0](LICENSE) license.

## Adding an LLM provider

1. Implement `ModelProvider.generate(context, question)` in `backend/app/llm/`. For any OpenAI-compatible API, reuse `OpenAIStyleProvider`.
2. Register it in `ProviderRegistry._build` and `PROVIDER_IDS` (`backend/app/llm/registry.py`).
3. Add its settings to `config.py` and `.env.example`, plus a test using a mocked transport (see `tests/test_providers.py`).

## Reporting PDF extraction problems

PDFs vary wildly. When text comes out wrong, open an issue describing the PDF: what produced it (e.g. calibre, Word, a scanner) and what the text looks like. **Please don't attach copyrighted books.** A small PDF you made yourself that reproduces the problem is ideal.

## Releasing (maintainers)

```bash
scripts/release.sh 0.2.0          # bumps VERSION + package.json, dates the CHANGELOG, runs tests, commits and tags
git push origin main --follow-tags
```

The **Release** workflow checks the versions, runs the tests, builds the UI and publishes a GitHub release. The release includes source bundles with the prebuilt UI, so they run with Python only. `0.x` and `-rc` versions are marked as pre-releases.
