# Bulk Rename (prefix/suffix) — Design

**Date:** 2026-10-12
**Branch:** feature/auto-folder-batch-processing

## Goal

Let the user add/edit a prefix and/or suffix on the filenames of all files in a
selected folder, in one bulk operation, from the GUI.

## Decisions (from brainstorming)

- **Scope:** Rename files on disk only. File *contents* are never touched.
- **Reach:** Top-level files only — subdirectories are skipped, no recursion.
- **Affix placement:** A prefix is prepended to the filename; a suffix is
  inserted *before* the extension.
  Example: `video.mp4` + prefix `intro_` + suffix `_en` → `intro_video_en.mp4`.
- **Safety:** Count-based confirm dialog before applying. Collisions and
  no-change entries are skipped automatically, never overwritten.
- **UI placement:** A new dedicated "Bulk Rename" tab in the notebook.

## Architecture

Follows the existing `folder_builder.py` pattern: a small, pure-logic module
with no GUI / optional dependencies, fully unit-testable, wired into the
tkinter app via thin handler methods.

### New module: `bulk_rename.py`

```
compute_new_name(filename, prefix, suffix) -> str
```
Inserts `prefix` before the stem and `suffix` before the extension. Pure string
logic. Rules:
- Extension is the final `.ext` as determined by `os.path.splitext`.
- `os.path.splitext("archive.tar.gz")` → stem `archive.tar`, ext `.gz`; suffix
  goes before `.gz`. (Documented, acceptable.)
- Dotfiles: `os.path.splitext(".env")` → `(".env", "")`; suffix appends to the
  end, prefix prepends. So `.env` + prefix `x_` + suffix `_y` → `x_.env_y`.
  (Edge case, documented.)
- No-extension files: suffix simply appended (`README` → `README_en`).

```
plan_renames(folder, prefix, suffix) -> list[dict]
```
Lists **top-level files only** (`os.scandir`, skip entries where `is_dir()`).
For each file builds an entry:
```
{"old": "<name>", "new": "<name>", "status": "rename" | "unchanged" | "collision", "reason": "<optional>"}
```
- `unchanged`: new name == old name (both affixes empty, or produced identical name).
- `collision`: the target name already exists on disk as a different file, OR
  two source files map to the same target name within this batch.
- `rename`: safe to rename.
Pure computation — no disk writes. Entries returned in directory-scan order.

```
apply_renames(folder, plan) -> dict
```
Performs the renames for `status == "rename"` entries only. Returns
`{"renamed": [(old, new), ...], "skipped": [(old, reason), ...], "errors": [(old, message), ...]}`.

**Two-phase swap safety:** a target new-name may equal an existing *old* name
that is itself being renamed (e.g. shifting a sequence). To avoid clobbering,
apply in two passes: (1) rename every planned source to a unique temporary name
in the same folder, (2) rename each temp to its final target. Any `OSError` is
captured per-file into `errors` without aborting the whole batch.

### GUI changes: `hls_converter.py`

- In `_build_ui`, add a `bulk_tab = tk.Frame(self.notebook, ...)` and
  `self.notebook.add(bulk_tab, text="Bulk Rename")`, then call
  `self._build_bulk_rename_tab(bulk_tab)`.
- `_build_bulk_rename_tab(parent)` — retro-themed widgets:
  - "Choose Folder" button → `on_bulk_choose_folder` (uses `filedialog.askdirectory`).
  - Folder path label.
  - Prefix entry (`tk.Entry` bound to `self.bulk_prefix`), Suffix entry
    (`self.bulk_suffix`).
  - A file-count label ("N files in folder"), refreshed when a folder is chosen.
  - "RENAME FILES" button → `on_bulk_rename`.
- `on_bulk_choose_folder` — pick a folder, store on `self.bulk_folder`, update
  label + count. Blocked while a render/auto run is in progress (consistent with
  other handlers).
- `on_bulk_rename`:
  - Validate: folder chosen & exists; at least one of prefix/suffix non-empty
    (else `messagebox.showwarning`).
  - `plan = plan_renames(...)`; partition into to-rename / skipped counts.
  - If nothing to rename → info dialog, stop.
  - `messagebox.askyesno` count-based confirm:
    "Rename N files in <folder>? (M skipped — collisions/no change)".
  - On yes → `apply_renames`, show result `messagebox.showinfo`, and
    `self._log(...)` a summary line to the Logs pane. Refresh the count label.

State init: add `self.bulk_folder = ""`, `self.bulk_prefix`, `self.bulk_suffix`
(`tk.StringVar`) in `__init__` near the other tk vars. No persistence to
`s3_config.json` (transient per-session).

## Error handling

- Invalid/missing folder → warning dialog, no action.
- Both affixes empty → warning dialog, no action.
- Per-file `OSError` during apply → collected in `errors`, surfaced in the
  result dialog; batch continues.
- Running during an active render/auto job → "Busy" info dialog, no action.

## Testing: `tests/test_bulk_rename.py`

Unit tests (pure module, use `tmp_path`):
- `compute_new_name`: prefix only, suffix only, both, no-extension, dotfile,
  double-extension (`.tar.gz`), empty affixes (identity).
- `plan_renames`: skips subdirectories; marks `unchanged` for empty affixes;
  flags collision when target exists; flags collision when two sources collide;
  normal rename entries.
- `apply_renames`: renames planned files; skips collisions/unchanged; two-phase
  swap (A→B, B→A style shift) completes without data loss; captures `OSError`
  into `errors` without aborting the rest.

## Out of scope (YAGNI)

- Recursion into subfolders.
- Editing file contents.
- Find/replace or regex renaming.
- Undo. (Collisions are skipped, so no overwrite; user re-runs with inverse
  affixes if needed.)
- Detailed old→new preview list (count-based confirm chosen instead).
