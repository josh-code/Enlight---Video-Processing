"""Check whether an HLS output directory already holds a complete encode.

Pure stdlib (no GUI deps) so it is unit-testable headless. Intentionally
self-contained; it does not import hls_converter.
"""
import hashlib
import os
from typing import Iterable


def auto_output_dirname(course_id: str, language: str, base_name: str, max_base: int = 30) -> str:
    """Short, deterministic local HLS output-dir NAME for an auto-mode encode.

    The source filename (base_name) can be 140+ chars, which on Windows pushes
    the output path past MAX_PATH (260) and breaks encoding (WinError 206). The
    local output dir only needs to be unique and reproducible — it is deleted
    after upload — so truncate base_name and append a short hash of the FULL
    base_name. The hash keeps distinct long names from colliding and keeps the
    name stable across runs, so the reuse-existing-encode check still matches.
    The full, untruncated base_name is still used for the S3 key and file record.
    """
    short = (base_name or "")[:max_base]
    digest = hashlib.sha1((base_name or "").encode("utf-8")).hexdigest()[:8]
    return f"{course_id}_{language}_{short}_{digest}_hls"


def has_required_qualities(output_dir: str, required_qualities: Iterable[str]) -> bool:
    """True iff output_dir has master.m3u8 and <q>/index.m3u8 for every required q."""
    required = list(required_qualities or [])
    if not output_dir or not os.path.isdir(output_dir) or not required:
        return False
    if not os.path.isfile(os.path.join(output_dir, "master.m3u8")):
        return False
    for q in required:
        if not os.path.isfile(os.path.join(output_dir, q, "index.m3u8")):
            return False
    return True
