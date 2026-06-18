# Auto / Folder Batch Processing — Design

**Date:** 2026-06-18
**Status:** Approved (design); pending implementation plan
**Component:** `hls_converter.py` (new "Auto / Folder" tab + orchestrator), small extension to the upload job

## Problem

Today, processing a video is fully manual and one batch at a time: select videos, set course ID + language, choose transcription + language, pick qualities, hit Start Render. After each batch completes the operator must come back, select the next batch, and meanwhile is also downloading the next set of videos to process. This serialized, attention-heavy loop wastes operator time.

## Goal

Point the tool at a single **root folder** whose structure encodes course and language, and let it process everything unattended: scan → encode → (optionally) transcribe → upload to S3 → record → clean up → re-scan, stopping only when a scan finds nothing left to do. The operator just keeps dropping downloaded videos into the right folders.

## Folder Contract

```
<root>/
  <courseId>/                 # 24-hex MongoDB ObjectId (validated)
    <langCode>/               # supported language code: hi, ur, en, ...
      lecture1.mp4
      lecture2.mp4
      _failed/                # auto-created per language on first failure; ignored by scans
        lecture3.mp4
        lecture3.error.txt
```

- **courseId folder**: must be a 24-character hex string (MongoDB ObjectId). Otherwise every video beneath it is moved to `_failed/` with a reason.
- **langCode folder**: must be one of the supported language codes (from `fetch_supported_languages()` / the configured fallback). Used verbatim as the S3 path segment, the Whisper transcription language, and the File record's `language`.
- **Accepted video extensions**: `.mp4`, `.mov`, `.mkv` (single list, easy to extend).
- **`_failed/`** is always created as a sibling of the failed video — i.e. `<video's parent folder>/_failed/`. In the normal case that is the language folder, so the state of a language is obvious at a glance: leftover videos = not done yet, a `_failed/` folder = something errored, empty folder = everything uploaded and cleaned up. Because a video always lives directly inside its parent folder, this rule holds even when the courseId/langCode names are *invalid* (the file's parent still exists). Scans ignore any `_failed/` directory at any depth.

## Transcription Config File

`transcription_config.json` at the repo root (next to `s3_config.json`):

```json
{
  "default": false,
  "languages": { "hi": true, "ur": true, "en": false }
}
```

- Per language code, decide transcribe-or-not. A language code not listed falls back to `default`.
- When transcription is enabled for a language, Whisper transcribes **in that folder's language**, and subtitles are wired into the master playlist (existing behavior). No per-run UI selection in auto mode.
- The file is read at the start of each run; if missing or malformed, treat as `default=false` and log a warning.

## Qualities

Always **1080p, 720p, 480p** in auto mode — not user-selectable. Shown read-only in the tab.

## UI — New "Auto / Folder" Tab

A new notebook tab alongside the existing manual tabs (manual flow untouched):

- **Root folder** picker; remembered in `s3_config.json` as `auto_root`.
- **Encoder** dropdown (CPU / NVENC / AMF / QSV) — reuse the existing encoder selector.
- Read-only **qualities** label: `1080p, 720p, 480p`.
- Read-only **transcription summary** loaded from `transcription_config.json` (e.g. `Transcribe: hi=on, ur=on, en=off (default off)`).
- **Start** / **Stop** buttons.
- **Status line**: `idle / scanning… / encoding {file} / uploading {file} / done`.
- **Counters**: processed, failed, remaining-this-pass.
- **Live log** pane (reuse the existing log styling/helpers).

Start is disabled if the manual render is running, and vice versa, to avoid two encode pipelines competing.

## Orchestrator Loop (background thread)

```
on Start:
  load transcription_config.json
  validate S3 configured (BACKEND_URL + AUTH_TOKEN) and FFmpeg present
  create tracking CSV: <root>/upload_tracking_YYYY-MM-DD_HHMMSS.csv (header row)
  start (or reuse) the background upload worker

loop:
  videos = scan(root)            # exclude _failed/ dirs; skip "unstable" files
  if videos is empty:
      stop, show summary         # ← stop-after-empty-scan
      break
  for each video (one at a time):
      if stop requested: break
      courseId, lang = parent folder names
      validate courseId (24-hex) and lang (supported code)
        -> invalid: move source to <video's parent>/_failed/ + .error.txt, continue
      output_dir = hls_outputs/<base_name>/
      encode 1080/720/480  (reuse _render_single_quality)
      if config[lang] transcribe: run Whisper, build subtitle playlist
      build master playlist
        -> any encode/transcode error: move source to _failed/, continue
      enqueue upload job {
        output_dir, source_path, s3_prefix=courses/<courseId>/<lang>/<base_name>,
        course_id, lang, duration, qualities=[1080p,720p,480p], transcribed,
        failed_dir=<lang>/_failed, tracking_csv, delete=True
      }
  # after the pass, loop again and re-scan — catches videos added while this pass ran
```

- **One encode at a time**; uploads overlap in the background via the existing upload queue (`_upload_worker`). Load characteristics unchanged from today.
- **Unstable-file guard**: skip any video whose mtime is within the last ~15 seconds (likely still downloading); it gets picked up on the next pass.
- **Stop button**: cooperative — finishes nothing new, lets the in-flight encode/upload settle, then halts the loop.

## Upload Worker — Extensions

The existing `_upload_worker` job dict gains: `source_path`, `failed_dir`, `tracking_csv`, `transcribed`. Behavior added on top of current logic:

- **On full success** (all files uploaded + File record created):
  - Append a row to the tracking CSV (live).
  - Update `output_history.json` (success entry).
  - Delete the HLS **output directory** (existing) **and** the **source `.mp4`** (new). This satisfies "delete output and rendered on successful upload."
- **On upload failure** (or partial failure, or auth failure): move the **source `.mp4`** into its language `_failed/` folder with a `.error.txt`, and do **not** delete anything. The failed file will not be retried (it's now under `_failed/`, which scans ignore).

## Tracking CSV

One file per **Start**, created in the root folder, named `upload_tracking_YYYY-MM-DD_HHMMSS.csv`. One row per **successfully uploaded** video, appended live:

| Column | Example |
|---|---|
| timestamp | 2026-06-18 14:23:05 |
| courseId | 699d28a50692dfb70e5c7e65 |
| language | hi |
| filename | lecture1.mp4 |
| duration_s | 642 |
| transcribed | yes |
| s3_master_key | courses/699d.../hi/lecture1/master.m3u8 |

Failures are intentionally **not** in this file — they live in the `_failed/` folder + `.error.txt` + the live log.

## History

Auto mode writes to `output_history.json` (the same file the manual flow and History tab use) on each successful upload — timestamp, source path, output dir, courseId, language, S3 master key. This is the permanent record. It is **not** used as the scan skip-check; deletion-on-success is the dedup mechanism (a file still present = not yet done).

## Reuse vs. New Code

**Reused as-is:**
- `_render_single_quality` (per-quality FFmpeg encode)
- Whisper transcription path + subtitle playlist builder (`transcribe_audio_with_whisper`, `create_subtitle_playlist`, `add_master_playlist_with_subtitles`)
- `_upload_worker`, `S3UploadManager`, `create_file_record`, `upload_directory`
- S3 prefix shape `courses/{courseId}/{lang}/{base_name}`
- Encoder selection, log helpers, `output_history.json` read/write helpers

**New:**
- The "Auto / Folder" tab and its widgets.
- `transcription_config.json` loader.
- Root-folder scanner + validation (courseId, lang, extension, stability, `_failed/` exclusion).
- The orchestrator thread (scan → process → re-scan → stop-on-empty).
- Tracking-CSV writer.

**Extended:**
- The upload job dict + `_upload_worker` (source deletion, `_failed/` move on failure, tracking CSV, history on success). Manual mode passes the new keys as no-ops (e.g. `source_path=None`, `failed_dir=None`, `tracking_csv=None`) so its behavior is unchanged.

## Error Handling Summary

| Failure | Action |
|---|---|
| Invalid courseId / lang folder | Move source → language `_failed/` + `.error.txt`; continue |
| No audio but transcription requested | Skip transcription, still encode/upload (log note) — *not* a failure |
| Encode error | Move source → `_failed/`; continue |
| Whisper/transcode error | Move source → `_failed/`; continue |
| Upload failure (partial/full/auth) | Move source → `_failed/`; keep output; do not delete; continue |
| S3 not configured / FFmpeg missing | Block Start with a clear message |

## Out of Scope (YAGNI)

- Filesystem-watch (watchdog) instant pickup — polling re-scan is sufficient.
- Parallel multi-video encoding — sequential encode with overlapped upload is the existing, sufficient model.
- Headless/CLI mode — operator chose the in-app tab.
- Retrying `_failed/` automatically — operator fixes and re-drops manually.

## Open Questions

None outstanding. CSV chosen for tracking (confirmed). `_failed/` per-language (confirmed). History kept (confirmed).
