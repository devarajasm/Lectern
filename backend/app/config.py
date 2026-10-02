"""Application settings, loaded from environment / the repo-level .env file."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    # Global defaults (runtime overrides are stored in the DB, see storage/settings.py)
    llm_provider: str = "azure"
    speech_provider: str = "azure"

    # Azure OpenAI (v1 API; model values are deployment names)
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_llm_deployment: str = "gpt-5-mini"
    azure_openai_stt_deployment: str = "gpt-4o-mini-transcribe"
    azure_openai_tts_deployment: str = "gpt-4o-mini-tts"
    azure_openai_api_style: str = "responses"
    # Speech-to-text uses the classic deployment-based endpoint
    # (/openai/deployments/{name}/audio/transcriptions?api-version=...), because Azure's v1
    # endpoint does not route transcription for every deployment.
    azure_openai_audio_api_version: str = "2025-03-01-preview"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-5-mini"
    openai_stt_model: str = "gpt-4o-mini-transcribe"
    openai_tts_model: str = "gpt-4o-mini-tts"

    tts_voice: str = "marin"

    # Local: Ollama / OpenAI-compatible servers
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.1:8b"
    openai_compatible_base_url: str = "http://localhost:1234/v1"
    openai_compatible_api_key: str = "not-needed"
    openai_compatible_model: str = "local-model"

    # Local: Hugging Face transformers
    hf_model: str = "Qwen/Qwen2.5-1.5B-Instruct"
    hf_device: str = "auto"

    data_dir: Path = Path("./data")

    # Public source repository (shown in the app; AGPL-3.0 §13 asks network users be offered the source)
    source_url: str = "https://github.com/devarajasm/Lectern"

    # Optional extra CA certificates (PEM) on top of the OS trust store.
    extra_ca_bundle: str = ""

    # Context budget for a single question (characters, not tokens).
    context_char_budget: int = 12_000
    history_turns: int = 6

    @property
    def resolved_data_dir(self) -> Path:
        path = self.data_dir if self.data_dir.is_absolute() else REPO_ROOT / self.data_dir
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def db_path(self) -> Path:
        return self.resolved_data_dir / "app.db"

    @property
    def books_dir(self) -> Path:
        path = self.resolved_data_dir / "books"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def azure_v1_base_url(self) -> str:
        return self.azure_openai_endpoint.rstrip("/") + "/openai/v1/"

    @property
    def azure_configured(self) -> bool:
        return bool(self.azure_openai_api_key.strip() and self.azure_openai_endpoint.strip()
                    and "YOUR-RESOURCE" not in self.azure_openai_endpoint)

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
