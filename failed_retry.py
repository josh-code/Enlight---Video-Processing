"""Find and restore videos sitting in Auto-mode _failed/ folders.

Pure stdlib (no GUI / optional deps), mirroring auto_scanner.py. A "failed"
video is one whose immediate parent folder is named _failed; restoring it moves
it one directory up (back to <courseId>/<lang>/) and removes its .error.txt.
"""
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from auto_scanner import VIDEO_EXTENSIONS, FAILED_DIR_NAME


@dataclass
class FailedVideo:
    failed_path: str
    restore_path: str


def find_failed_videos(root: str) -> List[FailedVideo]:
    """Return videos directly inside any _failed/ folder under root."""
    root_path = Path(root)
    out: List[FailedVideo] = []
    if not root_path.is_dir():
        return out
    for p in root_path.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        if p.parent.name != FAILED_DIR_NAME:
            continue
        restore = p.parent.parent / p.name
        out.append(FailedVideo(str(p), str(restore)))
    out.sort(key=lambda fv: fv.failed_path)
    return out


def restore_failed_video(failed_path: str) -> Optional[str]:
    """Move a _failed/ video back up one level; delete its .error.txt.

    Returns the restored path, or None if the source is missing or the
    destination already exists (never clobber a current video).
    """
    src = Path(failed_path)
    if not src.is_file():
        return None
    dest = src.parent.parent / src.name
    if dest.exists():
        return None
    shutil.move(str(src), str(dest))
    err = src.parent / f"{src.stem}.error.txt"
    if err.exists():
        try:
            err.unlink()
        except OSError:
            pass
    return str(dest)
