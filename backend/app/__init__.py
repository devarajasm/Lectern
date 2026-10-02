"""Lectern — voice-first AI book reader (backend)."""
from pathlib import Path

_VERSION_FILE = Path(__file__).resolve().parents[2] / "VERSION"
__version__ = _VERSION_FILE.read_text().strip() if _VERSION_FILE.exists() else "0.0.0"
