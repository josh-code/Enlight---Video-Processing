# Languages Tab (fetch + edit transcription config) — Design

**Date:** 2026-10-13
**Branch:** feature/auto-folder-batch-processing

## Goal

Add a GUI tab that lets the user (1) fetch the backend's supported languages and
merge them into `transcription_config.json` (the `update_languages.py` behaviour),
and (2) edit the per-language transcribe on/off toggles plus the top-level
`default`, saving back to `transcription_config.json`.

## Decisions (from brainstorming)

- **Placement:** a new "Languages" tab in the notebook.
- **Editable fields:** one on/off checkbox per language code + the top-level
  `default` boolean.
- **Fetch & save:** Fetch merges backend languages into the in-memory list (new
  codes added as off), showing the friendly name where known. Nothing is written
  to disk until the user clicks Save.

## Architecture

### Refactor `update_languages.py` for reuse (DRY)

The merge + write logic currently lives inside `main()`. Extract it so the GUI and
CLI share one implementation. `load_existing()` already exists and is reused as-is.

```
merge_languages(existing_languages: dict, backend_langs: list) -> tuple[dict, list]
```
Pure function. `existing_languages` is `{code: bool}`; `backend_langs` is the
`fetch_supported_languages()` list of `{"code","name"}`. Returns `(merged, added)`:
- `merged` starts as a copy of `existing_languages` (preserves every existing value
  AND codes the backend no longer returns).
- For each backend code not already present, add it as `False` and append the code
  to `added`.
- Order: existing codes keep their insertion order; newly added codes appended in
  backend order. `added` lists only the newly added codes.

```
save_config(default: bool, languages: dict, path: str = CONFIG_FILE) -> None
```
Writes `{"default": bool(default), "languages": languages}` to `path` as UTF-8
JSON with `ensure_ascii=False, indent=2` and a trailing newline (identical to the
current `main()` write).

`main()` is rewritten to: `langs,_ = fetch_supported_languages()`,
`existing = load_existing()`, `merged, added = merge_languages(existing["languages"], langs)`,
`save_config(existing.get("default", False), merged)`, then print the same summary
lines it prints today (backend count, newly added, currently ON, wrote path).
CLI output and behaviour are unchanged.

### GUI: `hls_converter.py`

State added in `__init__` (near the other tk-var groups):
- `self.lang_default_var = tk.BooleanVar(value=False)` — the top-level default.
- `self.lang_vars: dict[str, tk.BooleanVar] = {}` — per-code on/off vars.
- `self.lang_order: list[str] = []` — display order of codes.
- `self.lang_fetching = False` — guard so Fetch isn't re-entered.

Tab registration in `_build_ui` (after the Bulk Rename tab):
```python
lang_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
self.notebook.add(lang_tab, text="Languages")
self._build_languages_tab(lang_tab)
```

`_build_languages_tab(parent)`:
- Title + hint labels (retro theme constants).
- A "default" checkbox bound to `self.lang_default_var`.
- A scrollable region: a `tk.Canvas` + inner `tk.Frame` + vertical `ttk.Scrollbar`,
  following the existing left-column scroll pattern (`_on_left_frame_configure` /
  `_on_left_canvas_configure`). The inner frame holds one `tk.Checkbutton` per code.
  Kept in a helper `self._lang_list_inner` so it can be rebuilt.
- Button row: "Fetch from Backend" (`on_lang_fetch`), "Save" (`on_lang_save`).
- Status label `self.lang_status_label`.
- Calls `self._lang_load_from_disk()` then `self._lang_rebuild_list()` to populate.

Helper methods:
- `_lang_load_from_disk()` — `data = update_languages.load_existing()`; set
  `self.lang_default_var`, build `self.lang_vars` (`BooleanVar` per code) and
  `self.lang_order` from `data["languages"]`.
- `_lang_rebuild_list()` — clear the inner frame's children and recreate a
  `tk.Checkbutton` per code in `self.lang_order`, label `"{code} — {name}"` where
  `name = self._code_to_name.get(code)` or just `code` when unknown. Each
  checkbutton is bound to `self.lang_vars[code]`.
- `_set_lang_status(text)` — update the status label (via `self.root.after` when
  called from a thread).

`on_lang_fetch`:
- Busy guard: if `self.is_running` or `self.auto_is_running` → info dialog, return.
- If `self.lang_fetching` → return. Set it True, disable the Fetch button, set
  status "fetching...".
- Start a daemon thread that calls `fetch_supported_languages()` (can block ~10s),
  then marshals back via `self.root.after(0, ...)` to `_lang_apply_fetch(langs)`.
- `_lang_apply_fetch(langs)`: current in-memory toggles = `{c: v.get() for c,v in self.lang_vars.items()}`;
  `merged, added = merge_languages(current, langs)`; update `self.lang_vars`
  (keep existing vars, add new `BooleanVar(False)`), extend `self.lang_order` with
  `added`, rebuild list, status = `f"Backend: {len(langs)} | added (off): {len(added)}"`.
  Re-enable button, clear `lang_fetching`.

`on_lang_save`:
- Busy guard as above.
- `languages = {code: self.lang_vars[code].get() for code in self.lang_order}`.
- `try: save_config(self.lang_default_var.get(), languages)` except `OSError as e`
  → error dialog. On success: `self._log("[LANG] Saved N languages ...")`, info
  dialog.

Imports: add `from update_languages import load_existing, merge_languages, save_config`
near the other top-level helper imports (`folder_builder`, `bulk_rename`).
`fetch_supported_languages` is already imported. `threading`, `tk`, `ttk`,
`messagebox` already imported.

## Error handling

- Fetch: `fetch_supported_languages()` already swallows network errors and returns
  the built-in fallback list; the worker thread is additionally wrapped so any
  unexpected error reports to the status label and re-enables the button.
- Save: `OSError` → `messagebox.showerror`, button/state unchanged.
- Busy guard on both actions while a render/auto run is active.

## Out of scope (YAGNI)

- Adding/removing arbitrary language codes by hand (only backend fetch adds codes;
  existing codes are never deleted by the UI).
- Live re-wiring of a running Auto job (it reloads config on start already).
- Search/filter box over the language list.

## Testing

`tests/test_update_languages.py` (new), using `tmp_path`:
- `merge_languages`: preserves an existing True/False value; adds a new backend code
  as False and lists it in `added`; keeps a code the backend no longer returns;
  returns no `added` when backend subset already present; empty existing + empty
  backend → `({}, [])`.
- `save_config`: writes a file that round-trips via `json.load` to
  `{"default":..., "languages":...}` with the expected values; writes UTF-8 and a
  trailing newline.

GUI: import smoke test (`import hls_converter`) + full suite for no regressions. No
automated GUI interaction test.
