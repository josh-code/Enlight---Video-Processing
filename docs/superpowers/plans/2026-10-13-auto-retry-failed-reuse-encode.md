# Auto Retry-Failed + Reuse-Encode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Auto mode, retry videos sitting in `_failed/` folders (restoring them at run start and on scan passes, each at most once per run) and skip encoding when a complete HLS output already exists in `hls_outputs/` (upload-only).

**Architecture:** Two new pure/IO modules — `failed_retry.py` (find + restore `_failed` videos) and `hls_output.py` (`has_required_qualities`) — mirror the testable style of `auto_scanner.py`. `hls_converter.py`'s `_auto_worker` and `_auto_process_video` consume them: a start-of-run snapshot drives per-pass restoration with a once-per-entry guard, and a reuse check short-circuits the delete+encode flow into an upload-only path.

**Tech Stack:** Python 3, standard library (`os`, `shutil`, `pathlib`, `dataclasses`); tkinter (existing GUI); pytest.

## Global Constraints

- `failed_retry.py` and `hls_output.py` MUST be pure stdlib (no tkinter / no S3 / no `hls_converter` import), mirroring `auto_scanner.py`, so they are unit-testable headless.
- `failed_retry` reuses `VIDEO_EXTENSIONS` and `FAILED_DIR_NAME` from `auto_scanner` (do not redefine them).
- A `_failed` video is one whose immediate parent folder is named `_failed` (`FAILED_DIR_NAME`); its restore target is one directory above `_failed`, same filename.
- Restore MUST NOT clobber: if the destination already exists, skip and return `None`.
- Reuse (skip encode) only when `master.m3u8` AND every quality in `AUTO_QUALITIES` (`["1080p","720p","480p"]`) has `<q>/index.m3u8`; otherwise encode fresh.
- The upload job dict built on the reuse path MUST be field-for-field identical to the one the normal encode path already builds.
- Each snapshot `_failed` entry is attempted for restore at most once per run (guarantees the scan loop terminates).
- Do not modify manual mode, `is_hls_output_valid`, or `infer_qualities_from_output_dir`.
- Run tests with the repo venv: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest ...`. `tests/conftest.py` already puts repo root on `sys.path`.

---

## File Structure

- **Create** `failed_retry.py` — `FailedVideo` dataclass, `find_failed_videos`, `restore_failed_video`.
- **Create** `hls_output.py` — `has_required_qualities`.
- **Create** `tests/test_failed_retry.py`, `tests/test_hls_output.py`.
- **Modify** `hls_converter.py` — import both modules; add snapshot/restore in `_auto_worker`; add reuse short-circuit + `_auto_output_has_transcript` for `_auto_process_video`.

---

### Task 1: `failed_retry.py` — find and restore `_failed` videos

**Files:**
- Create: `failed_retry.py`
- Test: `tests/test_failed_retry.py`

**Interfaces:**
- Consumes: `VIDEO_EXTENSIONS`, `FAILED_DIR_NAME` from `auto_scanner`.
- Produces:
  - `FailedVideo` dataclass with `failed_path: str`, `restore_path: str`.
  - `find_failed_videos(root: str) -> list[FailedVideo]` — videos whose immediate parent folder is `_failed`; `restore_path` is one level above `_failed`; sorted by `failed_path`; `[]` if root missing.
  - `restore_failed_video(failed_path: str) -> str | None` — move the file up out of `_failed/`, delete matching `<stem>.error.txt`, return dest; `None` if source missing or dest already exists.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_failed_retry.py`:

```python
import os

from failed_retry import find_failed_videos, restore_failed_video, FailedVideo

VALID_ID = "a" * 24


def _make_failed(tmp_path, name="video.mp4", with_error=True):
    failed_dir = tmp_path / VALID_ID / "hi" / "_failed"
    failed_dir.mkdir(parents=True)
    vid = failed_dir / name
    vid.write_text("data")
    if with_error:
        (failed_dir / (os.path.splitext(name)[0] + ".error.txt")).write_text("boom")
    return vid


def test_find_returns_failed_video_with_restore_path(tmp_path):
    vid = _make_failed(tmp_path)
    found = find_failed_videos(str(tmp_path))
    assert len(found) == 1
    assert found[0].failed_path == str(vid)
    assert found[0].restore_path == str(tmp_path / VALID_ID / "hi" / "video.mp4")


def test_find_ignores_error_txt_and_non_videos(tmp_path):
    failed_dir = tmp_path / VALID_ID / "hi" / "_failed"
    failed_dir.mkdir(parents=True)
    (failed_dir / "note.txt").write_text("x")
    (failed_dir / "clip.error.txt").write_text("x")
    assert find_failed_videos(str(tmp_path)) == []


def test_find_ignores_videos_not_in_failed(tmp_path):
    d = tmp_path / VALID_ID / "hi"
    d.mkdir(parents=True)
    (d / "normal.mp4").write_text("x")
    assert find_failed_videos(str(tmp_path)) == []


def test_find_missing_root(tmp_path):
    assert find_failed_videos(str(tmp_path / "nope")) == []


def test_restore_moves_file_and_deletes_error(tmp_path):
    vid = _make_failed(tmp_path)
    err = vid.parent / "video.error.txt"
    dest = restore_failed_video(str(vid))
    assert dest == str(tmp_path / VALID_ID / "hi" / "video.mp4")
    assert os.path.isfile(dest)
    assert not vid.exists()            # moved out of _failed
    assert not err.exists()            # error file removed


def test_restore_skips_when_dest_exists(tmp_path):
    vid = _make_failed(tmp_path, with_error=False)
    # A current video already occupies the restore target.
    existing = tmp_path / VALID_ID / "hi" / "video.mp4"
    existing.write_text("current")
    assert restore_failed_video(str(vid)) is None
    assert vid.exists()                # left in place, not clobbered
    assert existing.read_text() == "current"


def test_restore_missing_source(tmp_path):
    assert restore_failed_video(str(tmp_path / "ghost.mp4")) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest tests/test_failed_retry.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'failed_retry'`

- [ ] **Step 3: Write the implementation**

Create `failed_retry.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest tests/test_failed_retry.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add failed_retry.py tests/test_failed_retry.py
git commit -m "feat: add failed_retry (find/restore _failed videos)"
```

---

### Task 2: `hls_output.py` — complete-encode check

**Files:**
- Create: `hls_output.py`
- Test: `tests/test_hls_output.py`

**Interfaces:**
- Produces: `has_required_qualities(output_dir: str, required_qualities) -> bool` — `True` iff `output_dir` is a dir containing `master.m3u8` and, for every quality in `required_qualities`, `<output_dir>/<q>/index.m3u8`. `False` if dir missing/falsy or `required_qualities` empty.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_hls_output.py`:

```python
import os

from hls_output import has_required_qualities

REQUIRED = ["1080p", "720p", "480p"]


def _make_output(tmp_path, qualities, with_master=True):
    out = tmp_path / "out_hls"
    out.mkdir()
    if with_master:
        (out / "master.m3u8").write_text("#EXTM3U")
    for q in qualities:
        qd = out / q
        qd.mkdir()
        (qd / "index.m3u8").write_text("#EXTM3U")
    return out


def test_true_when_master_and_all_qualities_present(tmp_path):
    out = _make_output(tmp_path, REQUIRED)
    assert has_required_qualities(str(out), REQUIRED) is True


def test_false_when_master_missing(tmp_path):
    out = _make_output(tmp_path, REQUIRED, with_master=False)
    assert has_required_qualities(str(out), REQUIRED) is False


def test_false_when_a_quality_missing(tmp_path):
    out = _make_output(tmp_path, ["1080p", "720p"])  # missing 480p
    assert has_required_qualities(str(out), REQUIRED) is False


def test_false_when_dir_missing(tmp_path):
    assert has_required_qualities(str(tmp_path / "nope"), REQUIRED) is False


def test_false_when_required_empty(tmp_path):
    out = _make_output(tmp_path, REQUIRED)
    assert has_required_qualities(str(out), []) is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest tests/test_hls_output.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'hls_output'`

- [ ] **Step 3: Write the implementation**

Create `hls_output.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest tests/test_hls_output.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add hls_output.py tests/test_hls_output.py
git commit -m "feat: add hls_output.has_required_qualities"
```

---

### Task 3: Wire retry + reuse into Auto mode

**Files:**
- Modify: `hls_converter.py` (import block ~line 36-37; `_auto_worker` ~line 1423-1430; `_auto_process_video` ~line 1493-1499; add helper method near `_auto_process_video`)

**Interfaces:**
- Consumes: `find_failed_videos`, `restore_failed_video` (Task 1); `has_required_qualities` (Task 2); existing `self.auto_root`, `self._supported_codes`, `self._log`, `self.upload_queue`, `self.AUTO_QUALITIES`, `self.output_base_dir`, `get_video_info`, `sanitize_folder_name`, `safe_mkdir`, `scan_root`, `_seen_key`.
- Produces: restore behavior in `_auto_worker`; reuse short-circuit in `_auto_process_video`; `_auto_output_has_transcript` method.

- [ ] **Step 1: Add imports**

In `hls_converter.py`, find (line 37):

```python
from update_languages import load_existing, merge_languages, save_config
```

Add immediately after it:

```python
from failed_retry import find_failed_videos, restore_failed_video
from hls_output import has_required_qualities
```

- [ ] **Step 2: Add snapshot + restore in `_auto_worker`**

In `_auto_worker`, find this block (around lines 1423-1430):

```python
        seen = set()

        def _seen_key(path):
            return os.path.normcase(os.path.abspath(path))

        def scan_fn():
            cands = scan_root(self.auto_root, self._supported_codes, time.time())
            return [c for c in cands if _seen_key(c.source_path) not in seen]
```

Replace it with:

```python
        seen = set()

        def _seen_key(path):
            return os.path.normcase(os.path.abspath(path))

        # Snapshot _failed videos at run start; restore each at most once this run
        # (attempted on the first scan and each later pass). A video that fails
        # again lands back in _failed under a new name, is not in the snapshot,
        # and waits for the next run -> the scan loop still terminates.
        failed_snapshot = find_failed_videos(self.auto_root)
        retried = set()
        if failed_snapshot:
            self._log(f"[AUTO] Found {len(failed_snapshot)} failed video(s) to retry this run.")

        def _restore_pending():
            for fv in failed_snapshot:
                key = os.path.normcase(os.path.abspath(fv.failed_path))
                if key in retried:
                    continue
                retried.add(key)  # attempt once regardless of outcome
                try:
                    dest = restore_failed_video(fv.failed_path)
                except Exception as e:
                    self._log(f"[AUTO] Could not restore {os.path.basename(fv.failed_path)}: {e}", is_error=True)
                    continue
                if dest:
                    self._log(f"[AUTO] Restored failed video for retry: {dest}")
                else:
                    self._log(f"[AUTO] Skipped restoring {os.path.basename(fv.failed_path)} (missing or name already present).")

        def scan_fn():
            _restore_pending()
            cands = scan_root(self.auto_root, self._supported_codes, time.time())
            return [c for c in cands if _seen_key(c.source_path) not in seen]
```

- [ ] **Step 3: Add reuse short-circuit in `_auto_process_video`**

In `_auto_process_video`, find this block (lines 1493-1499):

```python
        self.output_dir = os.path.join(self.output_base_dir, f"{c.course_id}_{c.language}_{base_name}_hls")
        if os.path.isdir(self.output_dir):
            try:
                shutil.rmtree(self.output_dir)
            except OSError:
                pass
        safe_mkdir(self.output_dir)
```

Replace it with:

```python
        self.output_dir = os.path.join(self.output_base_dir, f"{c.course_id}_{c.language}_{base_name}_hls")

        # Reuse a complete existing encode -> upload only (cheap retry after an
        # upload failure, where the local output survives but the source failed).
        if has_required_qualities(self.output_dir, self.AUTO_QUALITIES):
            selected = self.AUTO_QUALITIES
            self.current_selected = selected
            info = get_video_info(fp)
            self.duration_s = float(info.get("duration_s", 0.0) or 0.0)
            transcribed = self._auto_output_has_transcript(self.output_dir)
            self._set_auto_status(f"reusing encode: {base_name} ({c.course_id}/{c.language})")
            self._log(f"[AUTO] Reusing existing encoded output for {base_name} — upload only.")
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
            return True

        if os.path.isdir(self.output_dir):
            try:
                shutil.rmtree(self.output_dir)
            except OSError:
                pass
        safe_mkdir(self.output_dir)
```

- [ ] **Step 4: Add the `_auto_output_has_transcript` helper**

In `hls_converter.py`, add this method to `RetroHlsApp` immediately after `_auto_process_video` ends (just before `def _auto_transcribe(self, ...)`). Use 4-space indentation:

```python
    def _auto_output_has_transcript(self, output_dir: str) -> bool:
        """True if a transcript/subtitle artifact is present in an existing output dir."""
        try:
            for entry in os.scandir(output_dir):
                n = entry.name.lower()
                if n.startswith("subtitles") and n.endswith(".m3u8"):
                    return True
                if "_transcript." in n:
                    return True
        except OSError:
            return False
        return False
```

- [ ] **Step 5: Smoke-test import + wiring**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -c "import failed_retry, hls_output, hls_converter; print('import ok')"`
Expected: `import ok`

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest -q`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add hls_converter.py
git commit -m "feat: auto mode retries _failed videos and reuses complete encodes"
```

---

## Self-Review

**Spec coverage:**
- Restore `_failed` videos back to their folder, delete `.error.txt`, never clobber → Task 1 `restore_failed_video` + tests. ✓
- Find `_failed` videos (snapshot source) → Task 1 `find_failed_videos` + tests. ✓
- Snapshot at start; restore at most once per run; attempted at start and each pass; termination → Task 3 Step 2 (`failed_snapshot`, `retried`, `_restore_pending` in `scan_fn`). ✓
- Reuse only when master + all AUTO_QUALITIES present → Task 2 `has_required_qualities` + Task 3 Step 3. ✓
- Reuse path = upload-only, identical upload job dict → Task 3 Step 3 (mirrors the normal job dict fields). ✓
- No valid output → fall back to delete+encode (unchanged) → Task 3 Step 3 keeps the original block after the short-circuit. ✓
- Transcribed flag on reuse from existing artifacts → Task 3 Step 4 `_auto_output_has_transcript`. ✓
- Pure modules, no tkinter/hls_converter import; reuse auto_scanner constants → Tasks 1-2 implementations. ✓
- Don't touch manual mode / is_hls_output_valid / infer_qualities → not modified by any task. ✓

**Placeholder scan:** No TBD/TODO; every code/command step is concrete. ✓

**Type consistency:** `FailedVideo(failed_path, restore_path)`, `find_failed_videos(root) -> list[FailedVideo]`, `restore_failed_video(failed_path) -> str|None`, `has_required_qualities(output_dir, required_qualities) -> bool`, `_auto_output_has_transcript(output_dir) -> bool` used consistently across tasks. `self.AUTO_QUALITIES` is the single source for required qualities in both the reuse check and the job dict. ✓

> Note: `restore_path` is produced by `find_failed_videos` for clarity/future use, but `restore_failed_video` recomputes the destination from `failed_path` itself, so the two never disagree. The upload job dict in the reuse path is deliberately a verbatim copy of the normal path's dict so the uploader/tracking/history behave identically.
