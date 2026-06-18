# Auto / Folder Batch Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unattended "Auto / Folder" mode that scans a root folder structured as `courseId/langCode/*.mp4`, encodes each video to 1080/720/480, transcribes per a language config file, uploads to S3, deletes source+output on success, moves failures to a per-language `_failed/`, writes a per-run tracking CSV and history, and loops until a scan finds nothing.

**Architecture:** Pure-logic pieces (config loader, scanner, tracking CSV, loop control) live in new small flat modules next to `config.py`/`s3_uploader.py` and are unit-tested with pytest. The Tkinter GUI in `hls_converter.py` gets a new tab plus an orchestrator thread that wires the real encode/upload functions (already present) into the pure loop. The existing background upload worker is extended to handle auto-mode jobs without changing manual-mode behavior.

**Tech Stack:** Python 3, Tkinter, FFmpeg, openai-whisper, requests; pytest for tests (new dev dependency).

## Global Constraints

- Auto-mode qualities are ALWAYS `["1080p", "720p", "480p"]` — copied verbatim, not user-selectable.
- S3 prefix shape is `courses/{courseId}/{langCode}/{base_name}` (must match existing manual mode).
- courseId folder must match `^[a-fA-F0-9]{24}$` (MongoDB ObjectId).
- langCode folder must be a supported language code (from `self._supported_codes`), used lowercased.
- Accepted video extensions: `.mp4`, `.mov`, `.mkv`.
- `_failed/` is always created as a sibling of the failed video: `<video parent>/_failed/`, named `_failed` (constant `FAILED_DIR_NAME`).
- Files modified within the last 15 seconds (`STABILITY_SECONDS`) are skipped (still downloading).
- Manual-mode upload jobs must be unchanged: all new behavior is gated on `job.get("auto_mode")`.
- Platform is Windows; run tests with `python -m pytest`.
- Tracking CSV columns, in order: `timestamp, courseId, language, filename, duration_s, transcribed, s3_master_key`.

---

## File Structure

- Create `transcription_config.py` — load/parse `transcription_config.json`; decide transcribe-per-language.
- Create `auto_scanner.py` — validation + root scan into candidates + move-to-`_failed`.
- Create `tracking_csv.py` — create/append tracking CSV + build a row from an upload job.
- Create `auto_orchestrator.py` — pure scan→process→re-scan→stop loop driven by injected callables.
- Create `tests/` — pytest unit tests for the four modules above.
- Modify `hls_converter.py` — new Auto tab, `auto_root` persistence, orchestrator thread, per-video processor, and upload-worker extension.
- Modify `requirements.txt` — add `pytest` (dev/test).
- Modify `docs/getting-started.md` — document the Auto / Folder mode (optional doc task).

---

### Task 1: Test scaffolding + pytest dependency

**Files:**
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Modify: `requirements.txt`

**Interfaces:**
- Produces: a runnable `python -m pytest` with `tests/` on the path so `import transcription_config` etc. resolve from repo root.

- [ ] **Step 1: Add pytest to requirements**

Append to `requirements.txt`:
```
pytest>=8.0
```

- [ ] **Step 2: Create the tests package**

Create `tests/__init__.py` (empty file).

Create `tests/conftest.py`:
```python
import os
import sys

# Make repo-root modules (transcription_config, auto_scanner, ...) importable from tests.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

- [ ] **Step 3: Verify pytest collects an empty suite**

Run: `python -m pip install pytest`
Run: `python -m pytest -q`
Expected: `no tests ran` (exit code 5) — confirms pytest is installed and discovery works.

- [ ] **Step 4: Commit**

```bash
git add requirements.txt tests/__init__.py tests/conftest.py
git commit -m "test: add pytest scaffolding for auto-folder modules"
```

---

### Task 2: `transcription_config.py`

**Files:**
- Create: `transcription_config.py`
- Test: `tests/test_transcription_config.py`

**Interfaces:**
- Produces:
  - `TRANSCRIPTION_CONFIG_FILE = "transcription_config.json"`
  - `class TranscriptionConfig` with `.default: bool`, `.languages: dict[str,bool]`, `.should_transcribe(lang_code: str) -> bool`, `.summary() -> str`
  - `load_transcription_config(path: str = TRANSCRIPTION_CONFIG_FILE) -> TranscriptionConfig`

- [ ] **Step 1: Write the failing test**

Create `tests/test_transcription_config.py`:
```python
import json
from transcription_config import TranscriptionConfig, load_transcription_config


def test_should_transcribe_known_language():
    cfg = TranscriptionConfig(default=False, languages={"hi": True, "en": False})
    assert cfg.should_transcribe("hi") is True
    assert cfg.should_transcribe("en") is False


def test_should_transcribe_unknown_falls_back_to_default():
    cfg = TranscriptionConfig(default=True, languages={"en": False})
    assert cfg.should_transcribe("ur") is True


def test_should_transcribe_is_case_insensitive():
    cfg = TranscriptionConfig(default=False, languages={"hi": True})
    assert cfg.should_transcribe("HI") is True


def test_load_missing_file_returns_default_off(tmp_path):
    cfg = load_transcription_config(str(tmp_path / "nope.json"))
    assert cfg.default is False
    assert cfg.should_transcribe("hi") is False


def test_load_malformed_file_returns_default_off(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{ not json", encoding="utf-8")
    cfg = load_transcription_config(str(p))
    assert cfg.default is False


def test_load_valid_file(tmp_path):
    p = tmp_path / "transcription_config.json"
    p.write_text(json.dumps({"default": False, "languages": {"hi": True, "ur": True}}), encoding="utf-8")
    cfg = load_transcription_config(str(p))
    assert cfg.should_transcribe("hi") is True
    assert cfg.should_transcribe("ur") is True
    assert cfg.should_transcribe("en") is False


def test_summary_mentions_languages():
    cfg = TranscriptionConfig(default=False, languages={"hi": True, "en": False})
    s = cfg.summary()
    assert "hi=on" in s and "en=off" in s
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_transcription_config.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'transcription_config'`.

- [ ] **Step 3: Write minimal implementation**

Create `transcription_config.py`:
```python
"""Per-language transcription toggle loaded from transcription_config.json."""
import json
from pathlib import Path

TRANSCRIPTION_CONFIG_FILE = "transcription_config.json"


class TranscriptionConfig:
    def __init__(self, default: bool, languages: dict):
        self.default = bool(default)
        self.languages = {
            str(k).strip().lower(): bool(v)
            for k, v in (languages or {}).items()
        }

    def should_transcribe(self, lang_code: str) -> bool:
        if not lang_code:
            return self.default
        return self.languages.get(lang_code.strip().lower(), self.default)

    def summary(self) -> str:
        default_txt = "on" if self.default else "off"
        if not self.languages:
            return f"Transcribe: (none set), default {default_txt}"
        parts = [f"{k}={'on' if v else 'off'}" for k, v in sorted(self.languages.items())]
        return "Transcribe: " + ", ".join(parts) + f" (default {default_txt})"


def load_transcription_config(path: str = TRANSCRIPTION_CONFIG_FILE) -> "TranscriptionConfig":
    p = Path(path)
    if not p.is_file():
        return TranscriptionConfig(default=False, languages={})
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, ValueError):
        return TranscriptionConfig(default=False, languages={})
    if not isinstance(data, dict):
        return TranscriptionConfig(default=False, languages={})
    return TranscriptionConfig(
        default=data.get("default", False),
        languages=data.get("languages") or {},
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_transcription_config.py -q`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add transcription_config.py tests/test_transcription_config.py
git commit -m "feat: add per-language transcription config loader"
```

---

### Task 3: `tracking_csv.py`

**Files:**
- Create: `tracking_csv.py`
- Test: `tests/test_tracking_csv.py`

**Interfaces:**
- Produces:
  - `TRACKING_COLUMNS = ["timestamp","courseId","language","filename","duration_s","transcribed","s3_master_key"]`
  - `tracking_filename(ts_str: str) -> str` → `f"upload_tracking_{ts_str}.csv"`
  - `create_tracking_csv(root: str, ts_str: str) -> str` (writes header row, returns full path)
  - `append_tracking_row(path: str, row: dict) -> None`
  - `build_tracking_row(job: dict, master_key: str, now) -> dict` where `now` is a `datetime`

- [ ] **Step 1: Write the failing test**

Create `tests/test_tracking_csv.py`:
```python
import csv
from datetime import datetime
from tracking_csv import (
    TRACKING_COLUMNS,
    tracking_filename,
    create_tracking_csv,
    append_tracking_row,
    build_tracking_row,
)


def test_tracking_filename_includes_timestamp():
    assert tracking_filename("2026-06-18_142305") == "upload_tracking_2026-06-18_142305.csv"


def test_create_writes_header(tmp_path):
    path = create_tracking_csv(str(tmp_path), "2026-06-18_142305")
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    assert rows[0] == TRACKING_COLUMNS


def test_append_row_roundtrip(tmp_path):
    path = create_tracking_csv(str(tmp_path), "2026-06-18_142305")
    append_tracking_row(path, {
        "timestamp": "2026-06-18 14:23:05",
        "courseId": "699d28a50692dfb70e5c7e65",
        "language": "hi",
        "filename": "lecture1.mp4",
        "duration_s": 642,
        "transcribed": "yes",
        "s3_master_key": "courses/699d/hi/lecture1/master.m3u8",
    })
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert rows[0]["language"] == "hi"
    assert rows[0]["filename"] == "lecture1.mp4"


def test_build_tracking_row_from_job():
    job = {
        "course_id": "699d28a50692dfb70e5c7e65",
        "language": "hi",
        "source_path": "/root/699d28a50692dfb70e5c7e65/hi/lecture1.mp4",
        "duration_s": 642.4,
        "transcribed": True,
    }
    now = datetime(2026, 6, 18, 14, 23, 5)
    row = build_tracking_row(job, "courses/699d/hi/lecture1/master.m3u8", now)
    assert row["timestamp"] == "2026-06-18 14:23:05"
    assert row["courseId"] == "699d28a50692dfb70e5c7e65"
    assert row["filename"] == "lecture1.mp4"
    assert row["duration_s"] == 642
    assert row["transcribed"] == "yes"
    assert row["s3_master_key"] == "courses/699d/hi/lecture1/master.m3u8"


def test_build_tracking_row_not_transcribed():
    job = {"course_id": "c", "language": "en", "source_path": "x/a.mp4", "duration_s": 0, "transcribed": False}
    row = build_tracking_row(job, "k", datetime(2026, 1, 1, 0, 0, 0))
    assert row["transcribed"] == "no"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_tracking_csv.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'tracking_csv'`.

- [ ] **Step 3: Write minimal implementation**

Create `tracking_csv.py`:
```python
"""Per-run upload tracking CSV for auto-folder mode."""
import csv
import os
from pathlib import Path

TRACKING_COLUMNS = [
    "timestamp",
    "courseId",
    "language",
    "filename",
    "duration_s",
    "transcribed",
    "s3_master_key",
]


def tracking_filename(ts_str: str) -> str:
    return f"upload_tracking_{ts_str}.csv"


def create_tracking_csv(root: str, ts_str: str) -> str:
    path = Path(root) / tracking_filename(ts_str)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=TRACKING_COLUMNS)
        writer.writeheader()
    return str(path)


def append_tracking_row(path: str, row: dict) -> None:
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=TRACKING_COLUMNS)
        writer.writerow({col: row.get(col, "") for col in TRACKING_COLUMNS})


def build_tracking_row(job: dict, master_key: str, now) -> dict:
    return {
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "courseId": job.get("course_id", ""),
        "language": job.get("language", ""),
        "filename": os.path.basename(job.get("source_path", "") or ""),
        "duration_s": int(round(float(job.get("duration_s", 0) or 0))),
        "transcribed": "yes" if job.get("transcribed") else "no",
        "s3_master_key": master_key or "",
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_tracking_csv.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add tracking_csv.py tests/test_tracking_csv.py
git commit -m "feat: add per-run upload tracking CSV"
```

---

### Task 4: `auto_scanner.py`

**Files:**
- Create: `auto_scanner.py`
- Test: `tests/test_auto_scanner.py`

**Interfaces:**
- Produces:
  - `VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv"}`, `FAILED_DIR_NAME = "_failed"`, `STABILITY_SECONDS = 15`
  - `@dataclass VideoCandidate(source_path: str, course_id: str, language: str, valid: bool, reason: Optional[str])`
  - `is_valid_course_id(name: str) -> bool`
  - `is_stable(path: str, now_ts: float, min_age_s: float = STABILITY_SECONDS) -> bool`
  - `scan_root(root: str, supported_codes, now_ts: float, min_age_s: float = STABILITY_SECONDS) -> List[VideoCandidate]`
  - `move_to_failed(source_path: str, reason: str, ts_str: str) -> str`

- [ ] **Step 1: Write the failing test**

Create `tests/test_auto_scanner.py`:
```python
import os
from pathlib import Path
from auto_scanner import (
    FAILED_DIR_NAME,
    VideoCandidate,
    is_valid_course_id,
    is_stable,
    scan_root,
    move_to_failed,
)

VALID_ID = "699d28a50692dfb70e5c7e65"
SUPPORTED = ["hi", "en", "ur"]


def _make_video(root: Path, course: str, lang: str, name: str, old=True):
    d = root / course / lang
    d.mkdir(parents=True, exist_ok=True)
    f = d / name
    f.write_bytes(b"x")
    if old:
        old_ts = os.path.getmtime(f) - 3600
        os.utime(f, (old_ts, old_ts))
    return f


def test_is_valid_course_id():
    assert is_valid_course_id(VALID_ID) is True
    assert is_valid_course_id("not-an-id") is False
    assert is_valid_course_id("") is False


def test_is_stable_true_for_old_file(tmp_path):
    f = tmp_path / "a.mp4"
    f.write_bytes(b"x")
    old_ts = os.path.getmtime(f) - 100
    os.utime(f, (old_ts, old_ts))
    assert is_stable(str(f), now_ts=os.path.getmtime(f) + 100, min_age_s=15) is True


def test_is_stable_false_for_fresh_file(tmp_path):
    f = tmp_path / "a.mp4"
    f.write_bytes(b"x")
    mtime = os.path.getmtime(f)
    assert is_stable(str(f), now_ts=mtime + 1, min_age_s=15) is False


def test_scan_returns_valid_candidate(tmp_path):
    f = _make_video(tmp_path, VALID_ID, "hi", "lec1.mp4")
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert len(cands) == 1
    c = cands[0]
    assert c.valid is True
    assert c.course_id == VALID_ID
    assert c.language == "hi"


def test_scan_flags_invalid_course_id(tmp_path):
    f = _make_video(tmp_path, "bad-course", "hi", "lec1.mp4")
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert len(cands) == 1
    assert cands[0].valid is False
    assert "courseId" in cands[0].reason


def test_scan_flags_unsupported_language(tmp_path):
    f = _make_video(tmp_path, VALID_ID, "zz", "lec1.mp4")
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert cands[0].valid is False
    assert "language" in cands[0].reason.lower()


def test_scan_skips_failed_dir(tmp_path):
    d = tmp_path / VALID_ID / "hi" / FAILED_DIR_NAME
    d.mkdir(parents=True)
    f = d / "broken.mp4"
    f.write_bytes(b"x")
    old_ts = os.path.getmtime(f) - 3600
    os.utime(f, (old_ts, old_ts))
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert cands == []


def test_scan_skips_fresh_file(tmp_path):
    f = _make_video(tmp_path, VALID_ID, "hi", "lec1.mp4", old=False)
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 1)
    assert cands == []


def test_scan_ignores_non_video(tmp_path):
    d = tmp_path / VALID_ID / "hi"
    d.mkdir(parents=True)
    (d / "notes.txt").write_text("hi", encoding="utf-8")
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=9_999_999_999)
    assert cands == []


def test_scan_flags_wrong_depth(tmp_path):
    # video directly under courseId (missing language folder)
    d = tmp_path / VALID_ID
    d.mkdir(parents=True)
    f = d / "lec1.mp4"
    f.write_bytes(b"x")
    old_ts = os.path.getmtime(f) - 3600
    os.utime(f, (old_ts, old_ts))
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert len(cands) == 1
    assert cands[0].valid is False


def test_move_to_failed(tmp_path):
    f = _make_video(tmp_path, VALID_ID, "hi", "lec1.mp4")
    dest = move_to_failed(str(f), "Encode failed", "2026-06-18_142305")
    assert os.path.isfile(dest)
    assert FAILED_DIR_NAME in dest
    assert not os.path.isfile(str(f))
    err = Path(dest).parent / (Path(dest).stem + ".error.txt")
    assert err.is_file()
    assert "Encode failed" in err.read_text(encoding="utf-8")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_auto_scanner.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'auto_scanner'`.

- [ ] **Step 3: Write minimal implementation**

Create `auto_scanner.py`:
```python
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
    if dest.exists():
        dest = failed_dir / f"{src.stem}_{ts_str}{src.suffix}"
    shutil.move(str(src), str(dest))
    err_path = failed_dir / f"{dest.stem}.error.txt"
    err_path.write_text(f"{ts_str}\n{reason}\n", encoding="utf-8")
    return str(dest)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_auto_scanner.py -q`
Expected: PASS (11 passed).

- [ ] **Step 5: Commit**

```bash
git add auto_scanner.py tests/test_auto_scanner.py
git commit -m "feat: add root-folder scanner with validation and _failed move"
```

---

### Task 5: `auto_orchestrator.py`

**Files:**
- Create: `auto_orchestrator.py`
- Test: `tests/test_auto_orchestrator.py`

**Interfaces:**
- Consumes: candidate objects with a `.valid` attribute (from `auto_scanner.VideoCandidate`), but only via injected callables — no direct import.
- Produces:
  - `run_auto_loop(scan_fn, process_fn, move_failed_fn, stop_fn, log_fn) -> dict` returning `{"processed": int, "failed": int, "passes": int, "stopped": bool}`.
  - Behavior: loop calls `scan_fn()`; empty list → stop. For each candidate: `stop_fn()` True → stop; `not c.valid` → `move_failed_fn(c)` + failed+1; else `process_fn(c)` + processed+1. Re-scan after each full pass.

- [ ] **Step 1: Write the failing test**

Create `tests/test_auto_orchestrator.py`:
```python
from auto_orchestrator import run_auto_loop


class FakeCand:
    def __init__(self, valid):
        self.valid = valid


def make_scan(passes):
    """passes: list of lists; each call pops the next pass, then [] forever."""
    state = {"i": 0}

    def scan_fn():
        if state["i"] < len(passes):
            out = passes[state["i"]]
            state["i"] += 1
            return out
        return []
    return scan_fn


def test_stops_on_empty_scan():
    log = []
    summary = run_auto_loop(
        scan_fn=make_scan([]),
        process_fn=lambda c: None,
        move_failed_fn=lambda c: None,
        stop_fn=lambda: False,
        log_fn=log.append,
    )
    assert summary["passes"] == 0
    assert summary["processed"] == 0


def test_processes_then_stops_when_empty():
    processed = []
    summary = run_auto_loop(
        scan_fn=make_scan([[FakeCand(True), FakeCand(True)]]),
        process_fn=processed.append,
        move_failed_fn=lambda c: None,
        stop_fn=lambda: False,
        log_fn=lambda m: None,
    )
    assert len(processed) == 2
    assert summary["processed"] == 2
    assert summary["passes"] == 1


def test_invalid_candidate_is_moved_not_processed():
    processed, moved = [], []
    summary = run_auto_loop(
        scan_fn=make_scan([[FakeCand(False), FakeCand(True)]]),
        process_fn=processed.append,
        move_failed_fn=moved.append,
        stop_fn=lambda: False,
        log_fn=lambda m: None,
    )
    assert len(processed) == 1
    assert len(moved) == 1
    assert summary["failed"] == 1


def test_rescans_to_catch_added_videos():
    # First pass has 1 video; second pass (simulating a newly added file) has 1; then empty.
    processed = []
    summary = run_auto_loop(
        scan_fn=make_scan([[FakeCand(True)], [FakeCand(True)]]),
        process_fn=processed.append,
        move_failed_fn=lambda c: None,
        stop_fn=lambda: False,
        log_fn=lambda m: None,
    )
    assert len(processed) == 2
    assert summary["passes"] == 2


def test_stop_flag_breaks_mid_pass():
    processed = []
    calls = {"n": 0}

    def stop_fn():
        calls["n"] += 1
        return calls["n"] > 1  # allow first check, then stop

    summary = run_auto_loop(
        scan_fn=make_scan([[FakeCand(True), FakeCand(True), FakeCand(True)]]),
        process_fn=processed.append,
        move_failed_fn=lambda c: None,
        stop_fn=stop_fn,
        log_fn=lambda m: None,
    )
    assert summary["stopped"] is True
    assert len(processed) < 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_auto_orchestrator.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'auto_orchestrator'`.

- [ ] **Step 3: Write minimal implementation**

Create `auto_orchestrator.py`:
```python
"""Pure control-flow loop for auto-folder mode (scan -> process -> re-scan -> stop)."""
from typing import Callable, List


def run_auto_loop(
    scan_fn: Callable[[], List],
    process_fn: Callable[[object], None],
    move_failed_fn: Callable[[object], None],
    stop_fn: Callable[[], bool],
    log_fn: Callable[[str], None],
) -> dict:
    processed = 0
    failed = 0
    passes = 0
    stopped = False
    while True:
        if stop_fn():
            stopped = True
            break
        candidates = scan_fn()
        if not candidates:
            break
        passes += 1
        log_fn(f"Scan pass {passes}: found {len(candidates)} video(s).")
        for c in candidates:
            if stop_fn():
                stopped = True
                break
            if not getattr(c, "valid", False):
                move_failed_fn(c)
                failed += 1
                continue
            process_fn(c)
            processed += 1
        if stopped:
            break
    return {"processed": processed, "failed": failed, "passes": passes, "stopped": stopped}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_auto_orchestrator.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add auto_orchestrator.py tests/test_auto_orchestrator.py
git commit -m "feat: add auto-folder orchestration loop"
```

---

### Task 6: Extend the upload worker for auto-mode jobs

**Files:**
- Modify: `hls_converter.py` (imports near top; `_upload_worker` ~1143-1245; add two helper methods)

**Interfaces:**
- Consumes: `tracking_csv.build_tracking_row`, `tracking_csv.append_tracking_row`, `auto_scanner.move_to_failed`, existing `save_history`.
- Auto-mode upload job dict shape (produced in Task 7):
  ```python
  {
    "output_dir", "s3_prefix", "base_name", "course_id", "language",
    "duration_s", "qualities", "delete_local": True,
    "auto_mode": True, "source_path": <abs source video>,
    "tracking_csv": <csv path>, "transcribed": <bool>,
  }
  ```
- Produces (for Task 7 to rely on): `self._auto_move_source_to_failed(source_path, reason)` and `self._auto_record_success(job, master_key)`.

- [ ] **Step 1: Add imports for the new modules**

In `hls_converter.py`, inside the existing `try:`/`except ImportError:` block that imports config/s3 (lines ~16-27), add the new imports so they share the `_S3_AVAILABLE` guard. Modify:
```python
try:
    from config import Config as S3Config
    from config import fetch_supported_languages
    from s3_uploader import S3UploadManager
    _S3_AVAILABLE = True
```
to:
```python
try:
    from config import Config as S3Config
    from config import fetch_supported_languages
    from s3_uploader import S3UploadManager
    from transcription_config import load_transcription_config, TRANSCRIPTION_CONFIG_FILE
    from tracking_csv import create_tracking_csv, append_tracking_row, build_tracking_row
    from auto_scanner import scan_root, move_to_failed, VideoCandidate
    from auto_orchestrator import run_auto_loop
    _S3_AVAILABLE = True
```

- [ ] **Step 2: Add the two helper methods**

Insert these two methods immediately BEFORE `def _upload_worker(self):` (line ~1143):
```python
    def _auto_move_source_to_failed(self, source_path: str, reason: str):
        """Move an auto-mode source video into its sibling _failed/ folder."""
        if not source_path or not os.path.isfile(source_path):
            return
        try:
            ts_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
            dest = move_to_failed(source_path, reason, ts_str)
            self._log(f"  Moved source to _failed: {dest}", is_error=True)
        except Exception as e:
            self._log(f"  Could not move source to _failed: {e}", is_error=True)

    def _auto_record_success(self, job: dict, master_key: str):
        """On successful auto-mode upload: append tracking CSV row and update history."""
        now = datetime.now()
        if job.get("tracking_csv"):
            try:
                append_tracking_row(job["tracking_csv"], build_tracking_row(job, master_key, now))
            except Exception as e:
                self._log(f"  Tracking CSV write failed: {e}", is_error=True)
        src = job.get("source_path")
        if src:
            self.history[src] = {
                "output": job.get("output_dir"),
                "ts": now.isoformat(timespec="seconds"),
                "courseId": job.get("course_id"),
                "language": job.get("language"),
                "s3_master_key": master_key,
                "transcribed": bool(job.get("transcribed")),
            }
            save_history(self.history)
            self.root.after(0, self._refresh_history_ui)
```

- [ ] **Step 3: Read auto-mode keys at the top of the job loop**

In `_upload_worker`, just after the line `delete_local = job["delete_local"]` (line ~1159), add:
```python
            auto_mode = job.get("auto_mode", False)
            source_path = job.get("source_path")
```

- [ ] **Step 4: Move source to _failed on partial upload failure**

In the partial-failure block, the existing code logs failures then `continue` (lines ~1182-1194). Immediately BEFORE the `continue` on line ~1194, add:
```python
                    if auto_mode:
                        self._auto_move_source_to_failed(source_path, f"Upload partial failure: {len(failed)} file(s) failed")
```

- [ ] **Step 5: Record success and delete source after the file record is created**

The success path currently logs `File record created` then runs the delete block (lines ~1229-1235). Replace this block:
```python
                self._log(f"  File record created for {base_name}.")
                if delete_local:
                    try:
                        shutil.rmtree(output_dir)
                        self._log(f"  Local files deleted for {base_name}.")
                    except OSError:
                        pass
```
with:
```python
                self._log(f"  File record created for {base_name}.")
                if auto_mode:
                    self._auto_record_success(job, master_key)
                if delete_local:
                    try:
                        shutil.rmtree(output_dir)
                        self._log(f"  Local files deleted for {base_name}.")
                    except OSError:
                        pass
                    if auto_mode and source_path and os.path.isfile(source_path):
                        try:
                            os.remove(source_path)
                            self._log(f"  Source video deleted: {os.path.basename(source_path)}")
                        except OSError:
                            pass
```

- [ ] **Step 6: Move source to _failed on auth/unexpected upload errors**

The two `except` blocks at the end of the loop (auth ~1236-1239, general ~1240-1243) each append to `upload_failures` and log. Add a failed-move at the end of EACH except block body:

In the `except PermissionError as e:` block, after its `self._log(...)` line, add:
```python
                if job.get("auto_mode"):
                    self._auto_move_source_to_failed(job.get("source_path"), f"Upload auth failed: {e}")
```
In the `except Exception as e:` block, after its `self._log(...)` line, add:
```python
                if job.get("auto_mode"):
                    self._auto_move_source_to_failed(job.get("source_path"), f"Upload error: {e}")
```

- [ ] **Step 7: Verify the module still imports and unit tests pass**

Run: `python -c "import ast; ast.parse(open('hls_converter.py', encoding='utf-8').read()); print('OK')"`
Expected: `OK` (no syntax error).
Run: `python -m pytest -q`
Expected: all prior tests still PASS (no regressions; this task adds no new test — its behavior is verified end-to-end in Task 8).

- [ ] **Step 8: Commit**

```bash
git add hls_converter.py
git commit -m "feat: handle auto-mode upload jobs (tracking, history, source delete, _failed)"
```

---

### Task 7: Auto / Folder tab, persistence, and orchestrator thread

**Files:**
- Modify: `hls_converter.py` (`__init__` ~670-731; `_load_s3_config`/`_save_s3_config` ~1045-1073; `_build_ui` notebook section ~972-980; add new methods)

**Interfaces:**
- Consumes: `run_auto_loop`, `scan_root`, `move_to_failed`, `load_transcription_config` (imported in Task 6); existing `_render_single_quality`, `add_master_playlist`, `add_master_playlist_with_subtitles`, `create_subtitle_playlist`, `extract_audio_from_video`, `transcribe_audio_with_whisper`, `get_video_info`, `has_audio_stream`, `sanitize_folder_name`, `safe_mkdir`; `self.upload_queue`, `self._upload_worker`, `self.encoder_var`.
- Produces: a working Auto tab with Start/Stop, and the enqueued auto-mode job dict consumed by Task 6.

- [ ] **Step 1: Add auto-mode instance state**

In `__init__`, immediately after the S3 block (after `self._uploader_thread = None`, line ~716), add:
```python
        # Auto / Folder mode
        self.auto_root = ""
        self.auto_is_running = False
        self.auto_stop_flag = False
        self.auto_tracking_csv = None
        self._auto_config = None
        self._auto_thread = None
        self.AUTO_QUALITIES = ["1080p", "720p", "480p"]
```

- [ ] **Step 2: Persist `auto_root` in s3_config**

In `_load_s3_config`, inside the `try:` after the `delete_local_after_upload` handling (line ~1058), add:
```python
            if data.get("auto_root") is not None:
                self.auto_root = data["auto_root"]
```
In `_save_s3_config`, add `"auto_root"` to the `data` dict:
```python
            data = {
                "last_course_id": self.s3_course_id.get(),
                "language": self._get_s3_language_code(),
                "delete_local_after_upload": self.s3_delete_local.get(),
                "auto_root": getattr(self, "auto_root", ""),
            }
```

- [ ] **Step 3: Add the Auto tab to the notebook**

In `_build_ui`, where tabs are created (lines ~975-980), after `self.notebook.add(logs_tab, text="Logs")` add:
```python
        auto_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
        self.notebook.add(auto_tab, text="Auto / Folder")
        self._build_auto_tab(auto_tab)
```

- [ ] **Step 4: Add the `_build_auto_tab` method**

Add this method to the class (e.g. right after `_build_ui`):
```python
    def _build_auto_tab(self, parent):
        tk.Label(parent, text="AUTO / FOLDER MODE", fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_TITLE).pack(anchor="w", padx=10, pady=(10, 2))
        tk.Label(parent, text="Structure: <root>/<courseId>/<langCode>/video.mp4", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL).pack(anchor="w", padx=10)

        row = tk.Frame(parent, bg=RETRO_PANEL); row.pack(fill="x", padx=10, pady=6)
        tk.Button(row, text="Choose Root Folder", command=self.on_auto_choose_root, font=FONT_SMALL, bg=RETRO_BG, fg=RETRO_FG).pack(side="left")
        self.auto_root_label = tk.Label(row, text=self.auto_root or "(none)", fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=360, justify="left")
        self.auto_root_label.pack(side="left", padx=8)

        erow = tk.Frame(parent, bg=RETRO_PANEL); erow.pack(fill="x", padx=10, pady=2)
        tk.Label(erow, text="Encoder:", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_SMALL).pack(side="left")
        ttk.Combobox(erow, textvariable=self.encoder_var, values=list(self.encoder_display.values()), state="readonly", width=22).pack(side="left", padx=6)
        tk.Label(erow, text="Qualities: 1080p, 720p, 480p (fixed)", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL).pack(side="left", padx=12)

        self.auto_transcribe_label = tk.Label(parent, text="Transcribe: (load on start)", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.auto_transcribe_label.pack(anchor="w", padx=10, pady=(2, 6))

        brow = tk.Frame(parent, bg=RETRO_PANEL); brow.pack(fill="x", padx=10, pady=4)
        self.auto_start_btn = tk.Button(brow, text="START AUTO", command=self.on_auto_start, font=FONT_MAIN, bg=RETRO_BG, fg=RETRO_FG)
        self.auto_start_btn.pack(side="left")
        self.auto_stop_btn = tk.Button(brow, text="STOP", command=self.on_auto_stop, font=FONT_MAIN, bg=RETRO_BG, fg=RETRO_ACCENT, state="disabled")
        self.auto_stop_btn.pack(side="left", padx=8)

        self.auto_status_label = tk.Label(parent, text="Status: idle", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_SMALL)
        self.auto_status_label.pack(anchor="w", padx=10, pady=(6, 2))
        self.auto_counts_label = tk.Label(parent, text="Processed: 0 | Failed: 0 | Passes: 0", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.auto_counts_label.pack(anchor="w", padx=10)
```

- [ ] **Step 5: Add root picker, transcription-summary refresh, and start/stop handlers**

Add these methods to the class:
```python
    def on_auto_choose_root(self):
        if self.auto_is_running:
            messagebox.showinfo("Busy", "Auto mode is running.")
            return
        folder = filedialog.askdirectory(title="Select root folder", initialdir=self.auto_root or os.getcwd())
        if folder:
            self.auto_root = folder
            self.auto_root_label.config(text=folder)
            self._save_s3_config()

    def _set_auto_status(self, text: str):
        self.root.after(0, lambda: self.auto_status_label.config(text=f"Status: {text}"))

    def _set_auto_counts(self, processed: int, failed: int, passes: int):
        self.root.after(0, lambda: self.auto_counts_label.config(text=f"Processed: {processed} | Failed: {failed} | Passes: {passes}"))

    def on_auto_start(self):
        if self.is_running or self.auto_is_running:
            messagebox.showinfo("Busy", "A render or auto run is already in progress.")
            return
        if not self.auto_root or not os.path.isdir(self.auto_root):
            messagebox.showwarning("No folder", "Choose a valid root folder first.")
            return
        if not (_S3_AVAILABLE and S3Config and S3Config.is_configured()):
            messagebox.showerror("S3", "Backend not configured. Set BACKEND_URL and AUTH_TOKEN in .env")
            return
        ok, err = check_ffmpeg_available()
        if not ok:
            messagebox.showerror("FFmpeg Not Found", err)
            return
        self._auto_config = load_transcription_config(TRANSCRIPTION_CONFIG_FILE)
        self.auto_transcribe_label.config(text=self._auto_config.summary())
        ts_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        try:
            self.auto_tracking_csv = create_tracking_csv(self.auto_root, ts_str)
        except OSError as e:
            messagebox.showerror("Tracking", f"Could not create tracking file: {e}")
            return
        self.auto_stop_flag = False
        self.auto_is_running = True
        self.auto_start_btn.config(state="disabled")
        self.auto_stop_btn.config(state="normal")
        self._log(f"[AUTO] Started. Root: {self.auto_root}")
        self._log(f"[AUTO] Tracking: {self.auto_tracking_csv}")
        self._auto_thread = threading.Thread(target=self._auto_worker, daemon=True)
        self._auto_thread.start()

    def on_auto_stop(self):
        if self.auto_is_running:
            self.auto_stop_flag = True
            self._set_auto_status("stopping after current video...")
            self._log("[AUTO] Stop requested.")

    def _auto_finish(self, summary: dict):
        self.auto_is_running = False
        self.auto_start_btn.config(state="normal")
        self.auto_stop_btn.config(state="disabled")
        self._set_auto_status("done" if not summary.get("stopped") else "stopped")
        self._set_auto_counts(summary.get("processed", 0), summary.get("failed", 0), summary.get("passes", 0))
        with self._upload_failures_lock:
            ufails = len(self.upload_failures)
        messagebox.showinfo(
            "Auto Complete",
            f"Auto run finished.\n\nProcessed: {summary.get('processed', 0)}\n"
            f"Invalid/failed (pre-upload): {summary.get('failed', 0)}\n"
            f"Upload failures: {ufails}\n\nTracking: {self.auto_tracking_csv}",
        )
        self.root.after(0, self._refresh_history_ui)
```

- [ ] **Step 6: Add the orchestrator thread (`_auto_worker`)**

Add this method to the class:
```python
    def _auto_worker(self):
        # Start the background uploader (same worker manual mode uses).
        self.upload_failures = []
        self.s3_upload_cancel = False
        self._uploader_thread = threading.Thread(target=self._upload_worker, daemon=True)
        self._uploader_thread.start()

        counts = {"processed": 0, "failed": 0, "passes": 0}

        def scan_fn():
            return scan_root(self.auto_root, self._supported_codes, time.time())

        def process_fn(c):
            self._auto_process_video(c)
            counts["processed"] += 1
            self._set_auto_counts(counts["processed"], counts["failed"], counts["passes"])

        def move_failed_fn(c):
            ts_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
            try:
                move_to_failed(c.source_path, c.reason or "Invalid", ts_str)
                self._log(f"[AUTO] Invalid -> _failed: {os.path.basename(c.source_path)} — {c.reason}", is_error=True)
            except Exception as e:
                self._log(f"[AUTO] Could not move invalid file: {e}", is_error=True)
            counts["failed"] += 1
            self._set_auto_counts(counts["processed"], counts["failed"], counts["passes"])

        def stop_fn():
            return self.auto_stop_flag

        def log_fn(msg):
            counts["passes"] = counts.get("passes", 0)
            self._set_auto_status(msg)
            self._log(f"[AUTO] {msg}")

        try:
            summary = run_auto_loop(scan_fn, process_fn, move_failed_fn, stop_fn, log_fn)
        except Exception as e:
            self._log(f"[AUTO] Orchestrator error: {e}", is_error=True)
            summary = {"processed": counts["processed"], "failed": counts["failed"], "passes": counts["passes"], "stopped": True}
        else:
            summary["processed"] = counts["processed"]
            summary["failed"] = counts["failed"]

        # Drain uploads: sentinel makes the uploader finish queued jobs then exit.
        self._log("[AUTO] Waiting for uploads to finish...")
        self._set_auto_status("finishing uploads...")
        try:
            self.upload_queue.put(None)
            if self._uploader_thread:
                self._uploader_thread.join()
        except Exception as e:
            self._log(f"[AUTO] Upload drain error: {e}", is_error=True)

        self.root.after(0, lambda: self._auto_finish(summary))
```

- [ ] **Step 7: Add the per-video processor (`_auto_process_video`)**

Add this method to the class:
```python
    def _auto_process_video(self, c):
        fp = c.source_path
        base_name = sanitize_folder_name(os.path.splitext(os.path.basename(fp))[0])
        self.file_path = fp
        safe_mkdir(self.output_base_dir)
        self.output_dir = os.path.join(self.output_base_dir, base_name + "_hls")
        if os.path.isdir(self.output_dir):
            try:
                shutil.rmtree(self.output_dir)
            except OSError:
                pass
        safe_mkdir(self.output_dir)

        selected = self.AUTO_QUALITIES
        self.current_selected = selected
        info = get_video_info(fp)
        self.duration_s = float(info.get("duration_s", 0.0) or 0.0)
        self.audio_exists = has_audio_stream(fp)
        self.jobs_total = 0
        self.jobs_done = 0
        self.per_quality_progress = {q: 0.0 for q in selected}
        self.root.after(0, lambda: self._reset_progress(reset_overall=False))
        self._set_auto_status(f"encoding {base_name} ({c.course_id}/{c.language})")
        self._log(f"[AUTO] Encoding {base_name} ({c.course_id}/{c.language}) {selected}")

        total_s = max(float(self.duration_s), 0.001)
        for q in selected:
            ok, err = self._render_single_quality(q, total_s, selected)
            if not ok:
                self._auto_move_source_to_failed(fp, f"Encode failed ({q}): {err}")
                self._log(f"[AUTO] Encode failed for {base_name}: {err}", is_error=True)
                return
            self._log(f"[AUTO]   {q} done.")

        try:
            master_path = add_master_playlist(self.output_dir, selected, self.audio_exists)
        except Exception as e:
            self._auto_move_source_to_failed(fp, f"Master playlist failed: {e}")
            self._log(f"[AUTO] Master playlist failed for {base_name}: {e}", is_error=True)
            return

        transcribed = False
        if self.audio_exists and self._auto_config and self._auto_config.should_transcribe(c.language):
            transcribed = self._auto_transcribe(fp, base_name, selected, c.language)

        s3_prefix = f"courses/{c.course_id}/{c.language}/{base_name}"
        self.upload_queue.put({
            "output_dir": self.output_dir,
            "s3_prefix": s3_prefix,
            "base_name": base_name,
            "course_id": c.course_id,
            "language": c.language,
            "duration_s": self.duration_s,
            "qualities": selected,
            "delete_local": True,
            "auto_mode": True,
            "source_path": fp,
            "tracking_csv": self.auto_tracking_csv,
            "transcribed": transcribed,
        })
        self._set_auto_status(f"queued upload: {base_name}")
        self._log(f"[AUTO] Queued upload for {base_name}.")
```

- [ ] **Step 8: Add the transcription helper (`_auto_transcribe`)**

Add this method to the class (mirrors the manual render worker's transcription block, but transcribes in the folder's language and returns a bool):
```python
    def _auto_transcribe(self, fp, base_name, selected, lang_code):
        try:
            self._set_auto_status(f"transcribing {base_name}")
            self._log(f"[AUTO] Transcription started ({lang_code}).")
            temp_audio = os.path.join(self.output_dir, f"{base_name}_temp_audio.wav")
            ok, err = extract_audio_from_video(fp, temp_audio)
            if not ok:
                self._log(f"[AUTO]   Audio extraction failed: {err}", is_error=True)
                return False
            success, result, terr = transcribe_audio_with_whisper(temp_audio, lang_code, self.output_dir)
            try:
                if os.path.exists(temp_audio):
                    os.remove(temp_audio)
            except OSError:
                pass
            if not (success and result):
                self._log(f"[AUTO]   Transcription failed: {terr}", is_error=True)
                return False
            vtt = result.get("vtt_path") or result.get("srt_path")
            if not (vtt and os.path.exists(vtt)):
                self._log("[AUTO]   Subtitle file not found after transcription.", is_error=True)
                return False
            sub_playlist = create_subtitle_playlist(self.output_dir, vtt, lang_code)
            add_master_playlist_with_subtitles(self.output_dir, selected, self.audio_exists, {lang_code: sub_playlist})
            self._log("[AUTO]   Transcription + subtitle track done.")
            return True
        except Exception as e:
            self._log(f"[AUTO]   Transcription error: {e}", is_error=True)
            return False
```

- [ ] **Step 9: Verify the module parses and tests still pass**

Run: `python -c "import ast; ast.parse(open('hls_converter.py', encoding='utf-8').read()); print('OK')"`
Expected: `OK`.
Run: `python -m pytest -q`
Expected: all unit tests PASS (Tasks 2-5 unaffected).

- [ ] **Step 10: Commit**

```bash
git add hls_converter.py
git commit -m "feat: add Auto / Folder tab and orchestrator thread"
```

---

### Task 8: End-to-end manual verification + docs

**Files:**
- Create: `transcription_config.json` (sample at repo root)
- Modify: `docs/getting-started.md`

This task has no automated test (it exercises Tkinter + FFmpeg + the live backend). Follow the manual steps and confirm each observation before committing.

- [ ] **Step 1: Create a sample transcription config**

Create `transcription_config.json`:
```json
{
  "default": false,
  "languages": { "hi": true, "ur": true, "en": false }
}
```

- [ ] **Step 2: Build a throwaway test tree**

Create a temp root, e.g. `C:\auto_test\<24-hex-course-id>\hi\` and drop one short real `.mp4` in it. Use a real courseId that exists in your backend. (A second folder with an unsupported lang like `zz` is useful to confirm the `_failed` path.)

- [ ] **Step 3: Launch and run auto mode**

Run: `./run.ps1`
In the app: open the **Auto / Folder** tab → **Choose Root Folder** (`C:\auto_test`) → confirm the transcription summary shows `hi=on, ur=on, en=off` → **START AUTO**.

- [ ] **Step 4: Confirm behavior** (watch the Logs tab)

Expected observations:
- A `upload_tracking_YYYY-MM-DD_HHMMSS.csv` appears in `C:\auto_test\` with a header row.
- The `hi` video encodes (1080/720/480), transcribes (since `hi=on`), uploads, and on success: the source `.mp4` AND its `_hls` output folder are deleted.
- One data row is appended to the tracking CSV; the History tab gains an entry.
- The `zz` video is moved into `C:\auto_test\<course>\zz\_failed\` with a `.error.txt`.
- After a pass with nothing left, the run stops and the "Auto Complete" summary appears.

- [ ] **Step 5: Confirm the loop catches late additions**

Start auto mode again with one video; while it's encoding, drop a second video (older than 15s, or wait 15s) into a valid folder. Confirm the second video is picked up in a subsequent pass before the run stops.

- [ ] **Step 6: Confirm manual mode still works**

Switch to the **Queue** tab, add a file, enable S3, and render as before. Confirm manual upload still behaves exactly as before (no tracking CSV, deletion follows the manual "Delete local" checkbox, no `_failed` moves).

- [ ] **Step 7: Update docs**

In `docs/getting-started.md`, add a short "Auto / Folder mode" section describing: the `courseId/langCode/video.mp4` layout, the `transcription_config.json` file, fixed 1080/720/480 qualities, the per-run tracking CSV, the per-language `_failed/` folder, and that source+output are deleted on successful upload.

- [ ] **Step 8: Commit**

```bash
git add transcription_config.json docs/getting-started.md
git commit -m "docs: document Auto / Folder mode + sample transcription config"
```

---

## Self-Review

**Spec coverage:**
- Folder contract / validation → Task 4 (`scan_root`, `is_valid_course_id`). ✓
- `_failed/` per-language (sibling of video) → Task 4 (`move_to_failed`). ✓
- Transcription config file → Task 2; wired in Task 7 Step 7-8. ✓
- Always 1080/720/480 → Task 7 (`AUTO_QUALITIES`). ✓
- Scan → process → re-scan → stop-on-empty → Task 5; wired Task 7 Step 6. ✓
- Unstable-file guard (15s) → Task 4 (`is_stable`). ✓
- Source + output deletion on success → Task 6 Step 5. ✓
- Per-run tracking CSV → Task 3; created Task 7 Step 5; appended Task 6 Step 5. ✓
- History kept → Task 6 (`_auto_record_success`). ✓
- Move source to `_failed` on encode/transcode failure → Task 7 Step 7-8; on upload failure → Task 6 Steps 4/6. ✓
- New tab, manual flow untouched → Task 7; gating on `auto_mode` keeps manual unchanged (Task 6). ✓
- `auto_root` persistence → Task 7 Step 2. ✓
- Error table (invalid course/lang, no audio, encode, transcode, upload, S3/FFmpeg missing) → covered across Tasks 4/6/7 (no-audio: `_auto_process_video` skips transcription via `self.audio_exists` guard, still uploads). ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. ✓

**Type consistency:** Job dict keys (`auto_mode`, `source_path`, `tracking_csv`, `transcribed`, `course_id`, `language`, `duration_s`) are produced in Task 7 Step 7 and consumed in Task 6 Steps 3-6 with matching names. `build_tracking_row(job, master_key, now)` signature matches its call site. `run_auto_loop` parameter names match the call in Task 7 Step 6. `VideoCandidate` fields (`source_path`, `course_id`, `language`, `valid`, `reason`) match usage in `move_failed_fn` and `_auto_process_video`. ✓
