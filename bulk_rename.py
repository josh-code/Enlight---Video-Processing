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


def plan_renames(folder: str, prefix: str, suffix: str) -> List[Dict]:
    """Build a rename plan for top-level files in folder (no disk writes)."""
    names = [e.name for e in os.scandir(folder) if e.is_file()]
    existing = set(names)

    # Count how many sources map to each target, to catch batch-internal clashes.
    target_counts: Dict[str, int] = {}
    computed = []
    for name in names:
        new = compute_new_name(name, prefix, suffix)
        computed.append((name, new))
        target_counts[new] = target_counts.get(new, 0) + 1

    plan: List[Dict] = []
    for name, new in computed:
        if new == name:
            status, reason = "unchanged", ""
        elif new in existing or target_counts.get(new, 0) > 1:
            status = "collision"
            reason = "target already exists" if new in existing else "two files map to the same name"
        else:
            status, reason = "rename", ""
        plan.append({"old": name, "new": new, "status": status, "reason": reason})
    return plan
