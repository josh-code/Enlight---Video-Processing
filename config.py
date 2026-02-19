"""
Configuration for S3 upload (backend URL, auth, endpoints).
Load from environment; .env supported via python-dotenv.
"""
import os
from pathlib import Path
from typing import List, Tuple

# Load .env from this file's directory so it works regardless of cwd
_CONFIG_DIR = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(_CONFIG_DIR / ".env")
except ImportError:
    pass

# Fallback when supported-languages endpoint is unavailable (no network / server down)
DEFAULT_SUPPORTED_LANGUAGES: List[dict] = [
    {"code": "en", "name": "English (English)"},
    {"code": "es", "name": "Español (Spanish)"},
    {"code": "fr", "name": "Français (French)"},
    {"code": "de", "name": "Deutsch (German)"},
    {"code": "hi", "name": "हिन्दी (Hindi)"},
    {"code": "nl", "name": "Nederlands (Dutch)"},
    {"code": "pt", "name": "Português (Portuguese)"},
    {"code": "uk", "name": "Українська (Ukrainian)"},
    {"code": "vi", "name": "Tiếng Việt (Vietnamese)"},
    {"code": "pl", "name": "Polski (Polish)"},
]


def fetch_supported_languages() -> Tuple[List[dict], str]:
    """
    Fetch supported languages from backend SUPPORTED_LANGUAGES_ENDPOINT.
    Returns (languages, default_language_code) where languages is [{"code": "en", "name": "English (English)"}, ...].
    Falls back to DEFAULT_SUPPORTED_LANGUAGES and "en" if request fails or BACKEND_URL is empty.
    """
    try:
        import requests
    except ImportError:
        return (DEFAULT_SUPPORTED_LANGUAGES.copy(), "en")
    url = Config.get_full_url(Config.SUPPORTED_LANGUAGES_ENDPOINT)
    if not url:
        return (DEFAULT_SUPPORTED_LANGUAGES.copy(), "en")
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        if not data.get("success") or "data" not in data:
            return (DEFAULT_SUPPORTED_LANGUAGES.copy(), "en")
        payload = data["data"]
        languages = list(payload.get("languages") or [])
        if not languages:
            return (DEFAULT_SUPPORTED_LANGUAGES.copy(), "en")
        default = (payload.get("defaultLanguage") or "en").lower()
        # Ensure each item has code and name
        out = []
        for item in languages:
            code = (item.get("code") or "").strip().lower()
            name = (item.get("name") or code or "Unknown").strip()
            if code:
                out.append({"code": code, "name": name})
        if not out:
            return (DEFAULT_SUPPORTED_LANGUAGES.copy(), "en")
        return (out, default if any(x["code"] == default for x in out) else "en")
    except Exception:
        return (DEFAULT_SUPPORTED_LANGUAGES.copy(), "en")


class Config:
    BACKEND_URL = os.getenv("BACKEND_URL", "")
    AUTH_TOKEN = os.getenv("AUTH_TOKEN", "")
    DEFAULT_LANGUAGE = os.getenv("DEFAULT_LANGUAGE", "en")
    PRESIGN_EXACT_ENDPOINT = os.getenv(
        "PRESIGN_EXACT_ENDPOINT",
        "/api/v1/admin/content/aws/uploadUrlExact",
    )
    PRESIGN_BATCH_ENDPOINT = os.getenv(
        "PRESIGN_BATCH_ENDPOINT",
        "/api/v1/admin/content/aws/uploadUrlExactBatch",
    )
    PRESIGN_BATCH_SIZE = int(os.getenv("PRESIGN_BATCH_SIZE", "200"))
    UPLOAD_CONCURRENCY = int(os.getenv("UPLOAD_CONCURRENCY", "16"))  # parallel S3 PUT workers
    FILE_CREATE_ENDPOINT = os.getenv(
        "FILE_CREATE_ENDPOINT",
        "/api/v1/admin/content/files",
    )
    AUTH_VALIDATE_ENDPOINT = os.getenv(
        "AUTH_VALIDATE_ENDPOINT",
        "/api/v1/admin/auth/verify-admin",
    )
    SUPPORTED_LANGUAGES_ENDPOINT = os.getenv(
        "SUPPORTED_LANGUAGES_ENDPOINT",
        "/api/v1/common/languages",
    )

    # Whisper transcription model: tiny, base, small, medium, large, large-v2, large-v3
    # Larger models give better accuracy and correct script for Hindi/Indic (e.g. large-v3); small is default balance (~2GB VRAM).
    WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small").strip().lower() or "small"

    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls.BACKEND_URL and cls.AUTH_TOKEN)

    @classmethod
    def get_full_url(cls, endpoint: str) -> str:
        base = (cls.BACKEND_URL or "").rstrip("/")
        if not base:
            return ""
        path = (endpoint or "").lstrip("/")
        return f"{base}/{path}" if path else base
