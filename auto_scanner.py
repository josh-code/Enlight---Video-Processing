"""Scan a root folder (courseId/langCode/*.video) into validated candidates."""
import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv"}
FAILED_DIR_NAME = "_failed"
STABILITY_SECONDS = 15
_OBJECT_ID_RE = re.compile(r"^[a-fA-F0-9]{24}$")


@dataclass
class VideoCandidate:
    source_path: str
    course_id: str
    language: str
    valid: bool
    reason: Optional[str]


def is_valid_course_id(name: str) -> bool:
    return bool(name) and bool(_OBJECT_ID_RE.match(name))


def is_stable(path: str, now_ts: float, min_age_s: float = STABILITY_SECONDS) -> bool:
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return False
    return (now_ts - mtime) >= min_age_s


def scan_root(root: str, supported_codes, now_ts: float, min_age_s: float = STABILITY_SECONDS) -> List[VideoCandidate]:
    root_path = Path(root)
    candidates: List[VideoCandidate] = []
    if not root_path.is_dir():
        return candidates
    supported = {str(c).strip().lower() for c in (supported_codes or [])}
    for p in root_path.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        rel = p.relative_to(root_path)
        if any(part == FAILED_DIR_NAME for part in rel.parts):
            continue
        if not is_stable(str(p), now_ts, min_age_s):
            continue
        if len(rel.parts) != 3:
            candidates.append(VideoCandidate(
                str(p), "", "", False,
                f"Unexpected folder depth: expected <courseId>/<lang>/file, got {rel.as_posix()}",
            ))
            continue
        course_id, lang_folder, _ = rel.parts
        lang = lang_folder.strip().lower()
        if not is_valid_course_id(course_id):
            candidates.append(VideoCandidate(
                str(p), course_id, lang, False,
                f"Invalid courseId folder '{course_id}' (must be 24 hex chars)",
            ))
            continue
        if lang not in supported:
            candidates.append(VideoCandidate(
                str(p), course_id, lang, False,
                f"Unsupported language folder '{lang_folder}'",
            ))
            continue
        candidates.append(VideoCandidate(str(p), course_id, lang, True, None))
    return candidates


def move_to_failed(source_path: str, reason: str, ts_str: str) -> str:
    src = Path(source_path)
    failed_dir = src.parent / FAILED_DIR_NAME
    failed_dir.mkdir(parents=True, exist_ok=True)
    dest = failed_dir / src.name
    counter = 0
    while dest.exists():
        counter += 1
        suffix_ts = ts_str if counter == 1 else f"{ts_str}_{counter}"
        dest = failed_dir / f"{src.stem}_{suffix_ts}{src.suffix}"
    shutil.move(str(src), str(dest))
    err_path = failed_dir / f"{dest.stem}.error.txt"
    err_path.write_text(f"{ts_str}\n{reason}\n", encoding="utf-8")
    return str(dest)
