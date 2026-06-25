"""Idempotently scaffold the Auto / Folder directory structure under a root.

Creates <root>/<courseId>/<langCode>/ for each course x language. Existing
folders are skipped; only missing ones are created. If no languages are given,
the bare <root>/<courseId>/ folders are created instead.
"""
import os
from pathlib import Path
from typing import Dict, List


def ensure_folder_structure(root: str, course_ids: List[str], languages: List[str]) -> Dict[str, List[str]]:
    """Create the course/language folder tree under root (idempotent).

    Returns {"created": [...], "existing": [...]} where each entry is a relative
    path string: "courseId/lang" when languages are given, else "courseId".
    """
    root_path = Path(root)
    created: List[str] = []
    existing: List[str] = []
    for cid in course_ids:
        course_dir = root_path / cid
        if languages:
            for lang in languages:
                target = course_dir / lang
                rel = f"{cid}/{lang}"
                if target.is_dir():
                    existing.append(rel)
                else:
                    target.mkdir(parents=True, exist_ok=True)
                    created.append(rel)
        else:
            if course_dir.is_dir():
                existing.append(cid)
            else:
                course_dir.mkdir(parents=True, exist_ok=True)
                created.append(cid)
    return {"created": created, "existing": existing}
