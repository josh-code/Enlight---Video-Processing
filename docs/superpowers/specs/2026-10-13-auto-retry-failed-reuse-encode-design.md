# Auto mode — retry failed videos + reuse existing encodes — Design

**Date:** 2026-10-13
**Branch:** feature/auto-folder-batch-processing

## Goal

In Auto / Folder mode:
1. Bring videos sitting in `_failed/` folders back into the pipeline so they are
   retried (re-processed and uploaded), at run start and on subsequent scan
   passes, without ever looping forever on a video that keeps failing.
2. Before encoding a video, check whether a complete HLS output already exists in
   the project's `hls_outputs/` folder. If it does, skip encoding and only upload
   it. This makes an upload-failure retry cheap (no re-encode).

## Background (current behavior)

- `auto_scanner.scan_root` walks `<root>/<courseId>/<lang>/*.video` and **skips**
  anything under a `_failed/` folder (`auto_scanner.py:48`). Failures move the
  source into a sibling `_failed/` via `move_to_failed`, so failed videos are
  never rescanned.
- `_auto_process_video` always **deletes and recreates** the output dir, then
  re-encodes all `AUTO_QUALITIES` (`["1080p","720p","480p"]`), builds the master,
  optionally transcribes, and queues an upload with `delete_local: True`. On
  **upload** failure the local output survives (local delete happens only after a
  successful upload); on **encode** failure the dir is partial.
- Output dirs are named `<output_base>/<courseId>_<lang>_<base>_hls` where
  `output_base = <cwd>/hls_outputs`.
- Manual mode already has an "already encoded → upload only" idiom
  (`hls_converter.py:2529`) using `is_hls_output_valid` +
  `infer_qualities_from_output_dir`. Auto mode will mirror this.

## Decisions (from brainstorming)

- **Restore mechanism:** physically move each `_failed/` video back up to its
  `<courseId>/<lang>/` folder and delete its `.error.txt`, so the normal scanner
  picks it up.
- **Retry timing + loop guard:** snapshot the list of `_failed` videos at run
  start; restore each snapshot entry **at most once per run** (attempted on the
  first scan and on each subsequent pass). A video that fails again in the same
  run lands back in `_failed` under a new name, is not in the snapshot, and waits
  for the next run. This guarantees the scan loop still reaches empty and stops.
- **Reuse criteria:** reuse (skip encode) only when `master.m3u8` **and all** of
  `AUTO_QUALITIES` index playlists are present. Otherwise encode fresh.
- **No valid output:** fall back to the normal encode-then-upload flow.

## Architecture

### New module `failed_retry.py` (pure IO, no tkinter — mirrors `auto_scanner.py`)

Imports `VIDEO_EXTENSIONS` and `FAILED_DIR_NAME` from `auto_scanner`.

```
@dataclass
class FailedVideo:
    failed_path: str     # absolute path to the video inside a _failed/ folder
    restore_path: str    # absolute target path one level above _failed/
```

```
find_failed_videos(root: str) -> list[FailedVideo]
```
Walk `root` recursively. For each file whose suffix is in `VIDEO_EXTENSIONS` that
sits **directly** inside a folder named `_failed` (`path.parent.name == "_failed"`),
emit a `FailedVideo` with `failed_path = str(path)` and
`restore_path = str(path.parent.parent / path.name)`. Ignore `.error.txt` and any
non-video files. Return `[]` when `root` is not a directory. Order: sorted by
`failed_path` for determinism.

```
restore_failed_video(failed_path: str) -> str | None
```
- If `failed_path` is not an existing file, return `None`.
- Compute `dest = failed_path.parent.parent / failed_path.name`.
- If `dest` already exists, do nothing and return `None` (never clobber a current
  video).
- Otherwise `shutil.move(failed_path, dest)`; then delete the sibling error file
  `failed_path.parent / (failed_path.stem + ".error.txt")` if it exists (ignore
  errors). Return `str(dest)`.

### New module `hls_output.py` (pure IO, no tkinter)

```
has_required_qualities(output_dir: str, required_qualities) -> bool
```
Return `True` iff `output_dir` is a directory containing `master.m3u8` AND, for
every quality string in `required_qualities`, a file `<output_dir>/<q>/index.m3u8`
exists. Return `False` if `output_dir` is falsy/not a dir or `required_qualities`
is empty. (Self-contained; intentionally does not depend on `hls_converter` so it
is unit-testable without importing tkinter. Minor overlap with
`is_hls_output_valid` is accepted; that function is left unchanged.)

### Wiring in `hls_converter.py`

Imports (near the other helper imports): `from failed_retry import find_failed_videos, restore_failed_video`
and `from hls_output import has_required_qualities`.

**`_auto_worker`** — add a failed-retry snapshot and restore step:
- Near the top (before defining `scan_fn`), after `seen = set()`:
  ```python
  failed_snapshot = find_failed_videos(self.auto_root)
  retried = set()  # normalized failed_path, attempted at most once per run
  if failed_snapshot:
      self._log(f"[AUTO] Found {len(failed_snapshot)} failed video(s) to retry this run.")

  def _restore_pending():
      for fv in failed_snapshot:
          key = os.path.normcase(os.path.abspath(fv.failed_path))
          if key in retried:
              continue
          retried.add(key)  # attempt once regardless of outcome -> guarantees termination
          try:
              dest = restore_failed_video(fv.failed_path)
          except Exception as e:
              self._log(f"[AUTO] Could not restore {os.path.basename(fv.failed_path)}: {e}", is_error=True)
              continue
          if dest:
              self._log(f"[AUTO] Restored failed video for retry: {dest}")
          else:
              self._log(f"[AUTO] Skipped restoring {os.path.basename(fv.failed_path)} (missing or name already present).")
  ```
- In `scan_fn`, call `_restore_pending()` **before** `scan_root(...)`:
  ```python
  def scan_fn():
      _restore_pending()
      cands = scan_root(self.auto_root, self._supported_codes, time.time())
      return [c for c in cands if _seen_key(c.source_path) not in seen]
  ```

**`_auto_process_video`** — reuse-existing-output check before delete+encode. Replace
the current block that computes `self.output_dir` then unconditionally `rmtree`s it
with:
```python
self.output_dir = os.path.join(self.output_base_dir, f"{c.course_id}_{c.language}_{base_name}_hls")

# Reuse a complete existing encode -> upload only (cheap retry after upload failure).
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
# ... existing encode flow unchanged from here ...
```
The upload job dict must stay field-for-field identical to the one the normal path
already builds (so the uploader, tracking CSV, and history recording behave the
same).

Add a small helper method:
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

## Error handling

- Restore: non-existent file or name collision -> skipped (returns `None`), logged,
  never clobbers. Unexpected exceptions are caught and logged; the entry is still
  marked attempted so the run cannot loop.
- Termination: every snapshot entry is attempted exactly once; mid-run re-failures
  get new `_failed` names not in the snapshot, so `scan_fn` eventually returns no
  candidates and `run_auto_loop` stops.
- Reuse: purely optional. Missing or partial output always falls back to a fresh
  delete+encode. A reused output still goes through the same uploader, which on
  upload failure moves the source to `_failed` exactly as today.

## Out of scope (YAGNI)

- Per-video retry-count caps across runs (a deterministically broken video will be
  retried once each run; acceptable).
- Reusing partial encodes (fewer than all AUTO_QUALITIES) — treated as not-encoded.
- Re-transcribing when reusing an existing encode (we upload whatever subtitles are
  already there and set the tracking flag accordingly).
- Changing manual mode or `is_hls_output_valid` / `infer_qualities_from_output_dir`.

## Testing

`tests/test_failed_retry.py` (use `tmp_path`):
- `find_failed_videos`: finds a video inside `<cid>/<lang>/_failed/`; ignores
  `.error.txt` and non-video files; ignores videos not under `_failed/`; returns
  correct `restore_path`; `[]` when root missing or no `_failed`.
- `restore_failed_video`: moves the file up out of `_failed/` and returns dest;
  deletes the matching `.error.txt`; returns `None` and leaves the file when the
  destination already exists; returns `None` for a missing source.

`tests/test_hls_output.py` (use `tmp_path`):
- `has_required_qualities`: `True` when `master.m3u8` + all required
  `<q>/index.m3u8` exist; `False` when `master.m3u8` missing; `False` when one
  required quality's `index.m3u8` missing; `False` when dir does not exist; `False`
  when `required_qualities` empty.

GUI (`_auto_worker` / `_auto_process_video` changes): import smoke test
(`import hls_converter`) + full suite for no regressions. No automated GUI test.
