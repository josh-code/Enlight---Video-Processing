"""Check whether an HLS output directory already holds a complete encode.

Pure stdlib (no GUI deps) so it is unit-testable headless. Intentionally
self-contained; it does not import hls_converter.
"""
import os
from typing import Iterable


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
