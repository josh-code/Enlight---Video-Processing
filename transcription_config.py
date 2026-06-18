"""Per-language transcription toggle loaded from transcription_config.json."""
import json
from pathlib import Path

TRANSCRIPTION_CONFIG_FILE = "transcription_config.json"


class TranscriptionConfig:
    def __init__(self, default: bool, languages: dict):
        self.default = bool(default)
        self.languages = {
            str(k).strip().lower(): bool(v)
            for k, v in (languages or {}).items()
        }

    def should_transcribe(self, lang_code: str) -> bool:
        if not lang_code:
            return self.default
        return self.languages.get(lang_code.strip().lower(), self.default)

    def summary(self) -> str:
        default_txt = "on" if self.default else "off"
        if not self.languages:
            return f"Transcribe: (none set), default {default_txt}"
        parts = [f"{k}={'on' if v else 'off'}" for k, v in sorted(self.languages.items())]
        return "Transcribe: " + ", ".join(parts) + f" (default {default_txt})"


def load_transcription_config(path: str = TRANSCRIPTION_CONFIG_FILE) -> "TranscriptionConfig":
    p = Path(path)
    if not p.is_file():
        return TranscriptionConfig(default=False, languages={})
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, ValueError):
        return TranscriptionConfig(default=False, languages={})
    if not isinstance(data, dict):
        return TranscriptionConfig(default=False, languages={})
    return TranscriptionConfig(
        default=data.get("default", False),
        languages=data.get("languages") or {},
    )
