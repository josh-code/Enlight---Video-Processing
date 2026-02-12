"""
Configuration for S3 upload (backend URL, auth, endpoints).
Load from environment; .env supported via python-dotenv.
"""
import os
from pathlib import Path

# Load .env from this file's directory so it works regardless of cwd
_CONFIG_DIR = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv
    load_dotenv(_CONFIG_DIR / ".env")
except ImportError:
    pass


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
    FILE_CREATE_ENDPOINT = os.getenv(
        "FILE_CREATE_ENDPOINT",
        "/api/v1/admin/content/files",
    )
    AUTH_VALIDATE_ENDPOINT = os.getenv(
        "AUTH_VALIDATE_ENDPOINT",
        "/api/v1/admin/auth/verify-admin",
    )
    SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "ar", "hi"]

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
