"""
S3 upload manager for the HLS encoder.
Uploads files to backend-defined presigned URLs (exact key), creates File records.
"""
import json
import os
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional

try:
    import requests
except ImportError:
    requests = None

from config import Config

CONTENT_TYPES = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
    ".srt": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".json": "application/json",
    ".vtt": "text/vtt",
}
DEFAULT_CONTENT_TYPE = "application/octet-stream"

UPLOAD_STATE_FILE = ".upload_state.json"
RETRY_DELAYS = [1, 3, 10]
MAX_RETRIES = 3


def _get_content_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return CONTENT_TYPES.get(ext, DEFAULT_CONTENT_TYPE)


class S3UploadManager:
    def __init__(self, backend_url: str = "", auth_token: str = ""):
        self.backend_url = (backend_url or Config.BACKEND_URL or "").rstrip("/")
        self.auth_token = auth_token or Config.AUTH_TOKEN or ""
        self._session = None
        self._upload_state = {}

    def _headers(self) -> dict:
        return {
            "x-auth-token": f"{self.auth_token}",
            "Content-Type": "application/json",
        }

    def _url(self, endpoint: str) -> str:
        if endpoint.startswith("http"):
            return endpoint
        return Config.get_full_url(endpoint) or f"{self.backend_url}{endpoint}"

    def validate_connection(self) -> tuple[bool, str]:
        """Test backend reachability and token validity. Returns (success, message)."""
        if not requests:
            return False, "requests library not installed. Run: pip install requests"
        if not self.backend_url or not self.auth_token:
            return False, "BACKEND_URL and AUTH_TOKEN must be set (e.g. in .env)"
        url = self._url(Config.AUTH_VALIDATE_ENDPOINT)
        try:
            r = requests.get(url, headers=self._headers(), timeout=15)
            if r.status_code == 200:
                return True, "Connected"
            if r.status_code in (401, 403):
                return False, "Token invalid or expired"
            return False, f"Backend returned {r.status_code}"
        except requests.exceptions.RequestException as e:
            return False, str(e)

    def get_presigned_url_exact(self, s3_key: str, content_type: str = "") -> dict:
        """
        POST to uploadUrlExact; returns {key, signedUrl, downloadUrl}.
        Raises on non-2xx or missing data.
        """
        if not requests:
            raise RuntimeError("requests not installed")
        url = self._url(Config.PRESIGN_EXACT_ENDPOINT)
        body = {"key": s3_key}
        if content_type:
            body["contentType"] = content_type
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.post(
                    url,
                    json=body,
                    headers=self._headers(),
                    timeout=30,
                )
                if r.status_code in (401, 403):
                    raise PermissionError(f"Auth failed: {r.status_code}")
                r.raise_for_status()
                data = r.json()
                # Backend sendResponse uses "success", not "status"
                ok = data.get("status", data.get("success"))
                if not ok or not data.get("data"):
                    raise ValueError("Invalid response: missing data")
                return data["data"]
            except (requests.exceptions.RequestException, ValueError, PermissionError) as e:
                if attempt == MAX_RETRIES - 1:
                    raise
                time.sleep(RETRY_DELAYS[attempt])
        raise RuntimeError("get_presigned_url_exact failed after retries")

    def upload_file(
        self,
        local_path: str,
        signed_url: str,
        content_type: str = "",
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> None:
        """PUT file to S3 presigned URL. progress_callback(bytes_sent, total_bytes) optional."""
        if not requests:
            raise RuntimeError("requests not installed")
        path = Path(local_path)
        if not path.is_file():
            raise FileNotFoundError(local_path)
        size = path.stat().st_size
        ct = content_type or _get_content_type(local_path)
        headers = {"Content-Type": ct}
        with open(path, "rb") as f:
            data = f.read()
        for attempt in range(MAX_RETRIES):
            try:
                r = requests.put(
                    signed_url,
                    data=data,
                    headers=headers,
                    timeout=300,
                )
                r.raise_for_status()
                if progress_callback:
                    progress_callback(size, size)
                return
            except requests.exceptions.RequestException as e:
                if attempt == MAX_RETRIES - 1:
                    raise
                time.sleep(RETRY_DELAYS[attempt])
        raise RuntimeError("upload_file failed after retries")

    def upload_directory(
        self,
        local_dir: str,
        s3_prefix: str,
        cancel_check: Optional[Callable[[], bool]] = None,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
        state_callback: Optional[Callable[[dict], None]] = None,
    ) -> List[tuple[str, str]]:
        """
        Upload all files under local_dir to S3 with prefix s3_prefix.
        s3_prefix should not have trailing slash (we add / for each relative path).
        Returns list of (local_path, s3_key) uploaded.
        cancel_check() called before each file; if True, stop and return.
        progress_callback(current_index, total_files, current_file_name) optional.
        state_callback(state_dict) called after each file for resume.
        """
        local_path = Path(local_dir)
        if not local_path.is_dir():
            raise NotADirectoryError(local_dir)
        prefix = (s3_prefix or "").rstrip("/")
        uploaded: List[tuple[str, str]] = []
        files: List[Path] = []
        for p in local_path.rglob("*"):
            if p.is_file():
                files.append(p)
        total = len(files)
        for i, p in enumerate(files):
            if cancel_check and cancel_check():
                break
            rel = p.relative_to(local_path)
            parts = rel.parts
            key = f"{prefix}/{'/'.join(parts)}".replace("\\", "/")
            content_type = _get_content_type(str(p))
            presigned = self.get_presigned_url_exact(key, content_type)
            signed_url = presigned.get("signedUrl")
            if not signed_url:
                raise ValueError(f"No signedUrl in response for {key}")
            self.upload_file(str(p), signed_url, content_type)
            uploaded.append((str(p), key))
            if progress_callback:
                progress_callback(i + 1, total, rel.name)
            if state_callback:
                state_callback({"uploaded": uploaded, "last_key": key})
        return uploaded

    def create_file_record(
        self,
        name: str,
        course_id: str,
        language: str,
        s3_keys: dict,
        duration: float = 0,
        qualities: Optional[List[str]] = None,
        uploaded_by: str = "python-encoder",
    ) -> dict:
        """POST to /files to create File record. Returns created file data."""
        if not requests:
            raise RuntimeError("requests not installed")
        url = self._url(Config.FILE_CREATE_ENDPOINT)
        body = {
            "name": name,
            "courseId": course_id,
            "language": language,
            "type": "hls",
            "s3Keys": s3_keys,
            "duration": int(round(duration)),
            "qualities": qualities or [],
            "uploadedBy": uploaded_by,
        }
        r = requests.post(
            url,
            json=body,
            headers=self._headers(),
            timeout=30,
        )
        if r.status_code in (401, 403):
            raise PermissionError(f"Auth failed: {r.status_code}")
        r.raise_for_status()
        data = r.json()
        # Backend sendResponse uses "success"; accept "status" or "success"
        ok = data.get("status", data.get("success"))
        if not ok or "data" not in data:
            raise ValueError("Invalid create file response")
        return data["data"]

    def save_upload_state(self, state: dict, path: str = UPLOAD_STATE_FILE) -> None:
        """Persist upload state to JSON for resume."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)

    def load_upload_state(self, path: str = UPLOAD_STATE_FILE) -> dict:
        """Load upload state from JSON. Returns {} if missing or invalid."""
        if not os.path.isfile(path):
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
