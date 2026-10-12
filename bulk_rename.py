"""Bulk-rename files in a folder by adding a prefix and/or suffix.

Pure stdlib logic (no GUI / optional deps), mirroring folder_builder.py.

- Prefix is prepended to the whole filename.
- Suffix is inserted before the extension (as determined by os.path.splitext).
- Top-level files only; contents are never modified.
"""
import os
from typing import Dict, List


def compute_new_name(filename: str, prefix: str, suffix: str) -> str:
    """Return filename with prefix prepended and suffix inserted before the ext."""
    stem, ext = os.path.splitext(filename)
    return f"{prefix}{stem}{suffix}{ext}"
