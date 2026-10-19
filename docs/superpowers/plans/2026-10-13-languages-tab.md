# Languages Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GUI "Languages" tab to fetch the backend's supported languages (merging into `transcription_config.json`) and edit per-language transcribe on/off toggles plus the top-level `default`.

**Architecture:** Extract the merge + write logic from `update_languages.py:main()` into two reusable helpers (`merge_languages`, `save_config`) so the CLI and GUI share one implementation, then add a new "Languages" tab to the `RetroHlsApp` tkinter class in `hls_converter.py` that consumes them.

**Tech Stack:** Python 3, standard library + tkinter; pytest for tests. `config.fetch_supported_languages` for the backend call.

## Global Constraints

- `update_languages.py` must keep working as a CLI (`python update_languages.py`) with identical output and on-disk result; the refactor only extracts helpers and rewires `main()`.
- `save_config` writes JSON exactly as today: `json.dump(..., ensure_ascii=False, indent=2)` then a trailing newline, UTF-8, shape `{"default": bool, "languages": {code: bool}}`.
- `merge_languages` preserves every existing value and every existing code (even ones the backend no longer returns); new backend codes are added as `False`.
- Fetch must not block the UI thread (the backend call can take ~10s) — run it on a daemon thread and marshal results back with `self.root.after`.
- Fetch merges into the in-memory toggles only; nothing is written to disk until Save.
- Both Fetch and Save are blocked while a render/auto run is active (`self.is_running` or `self.auto_is_running`), consistent with other tabs.
- Reuse the retro theme constants (`RETRO_BG`, `RETRO_PANEL`, `RETRO_FG`, `RETRO_ACCENT`, `RETRO_MUTED`, `FONT_TITLE`, `FONT_MAIN`, `FONT_SMALL`).

---

## File Structure

- **Modify** `update_languages.py` — add `merge_languages`, `save_config`; rewrite `main()` to use them (and the existing `load_existing`). `CONFIG_FILE` and `load_existing` already exist.
- **Create** `tests/test_update_languages.py` — unit tests for `merge_languages` and `save_config`.
- **Modify** `hls_converter.py` — import the helpers; add Languages state vars in `__init__`; register the tab in `_build_ui`; add `_build_languages_tab` + helper/handler methods.

---

### Task 1: Extract `merge_languages` and `save_config`; rewire `main()`

**Files:**
- Modify: `update_languages.py`
- Test: `tests/test_update_languages.py`

**Interfaces:**
- Consumes: existing `load_existing() -> dict` and `fetch_supported_languages()` (unchanged).
- Produces:
  - `merge_languages(existing_languages: dict, backend_langs: list) -> tuple[dict, list]` — returns `(merged, added)`. `existing_languages` is `{code: bool}`; `backend_langs` is a list of `{"code","name"}`. `merged` is a copy of `existing_languages` with each backend code not already present appended as `False`; `added` is the list of those newly added codes (backend order).
  - `save_config(default, languages, path=CONFIG_FILE) -> None` — writes `{"default": bool(default), "languages": languages}` as UTF-8 JSON (`ensure_ascii=False, indent=2`) + trailing newline.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_update_languages.py`:

```python
import io
import json

from update_languages import merge_languages, save_config


def test_merge_preserves_existing_values():
    existing = {"en": True, "fr": False}
    backend = [{"code": "en", "name": "English"}, {"code": "fr", "name": "French"}]
    merged, added = merge_languages(existing, backend)
    assert merged == {"en": True, "fr": False}
    assert added == []


def test_merge_adds_new_backend_codes_as_false():
    existing = {"en": True}
    backend = [{"code": "en", "name": "English"}, {"code": "de", "name": "German"}]
    merged, added = merge_languages(existing, backend)
    assert merged == {"en": True, "de": False}
    assert added == ["de"]


def test_merge_keeps_codes_backend_no_longer_returns():
    existing = {"en": True, "xx": True}
    backend = [{"code": "en", "name": "English"}]
    merged, added = merge_languages(existing, backend)
    assert merged == {"en": True, "xx": True}
    assert added == []


def test_merge_empty_inputs():
    merged, added = merge_languages({}, [])
    assert merged == {}
    assert added == []


def test_merge_does_not_mutate_input():
    existing = {"en": True}
    merge_languages(existing, [{"code": "de", "name": "German"}])
    assert existing == {"en": True}  # original untouched


def test_save_config_roundtrips(tmp_path):
    path = str(tmp_path / "cfg.json")
    save_config(True, {"en": True, "fr": False}, path=path)
    with io.open(path, encoding="utf-8") as f:
        text = f.read()
    assert text.endswith("\n")  # trailing newline
    data = json.loads(text)
    assert data == {"default": True, "languages": {"en": True, "fr": False}}


def test_save_config_coerces_default_to_bool(tmp_path):
    path = str(tmp_path / "cfg.json")
    save_config(1, {}, path=path)
    with io.open(path, encoding="utf-8") as f:
        data = json.load(f)
    assert data["default"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest tests/test_update_languages.py -v`
Expected: FAIL with `ImportError: cannot import name 'merge_languages'`

- [ ] **Step 3: Add the two helpers**

In `update_languages.py`, after `load_existing()` (before `def main():`), add:

```python
def merge_languages(existing_languages, backend_langs):
    """Merge backend languages into existing toggles.

    Preserve every existing value and code; add backend codes not yet present
    as False. Returns (merged, added) where added lists the newly added codes.
    """
    merged = dict(existing_languages)
    added = []
    for l in backend_langs:
        code = l["code"]
        if code not in merged:
            merged[code] = False
            added.append(code)
    return merged, added


def save_config(default, languages, path=CONFIG_FILE):
    """Write {"default": bool, "languages": {...}} as UTF-8 JSON + trailing newline."""
    out = {"default": bool(default), "languages": languages}
    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
```

- [ ] **Step 4: Rewrite `main()` to use the helpers (identical behaviour)**

Replace the body of `main()` (the part after the `sys.stdout.reconfigure` block) with:

```python
    langs, _default_code = fetch_supported_languages()
    existing = load_existing()

    merged, added = merge_languages(existing["languages"], langs)
    save_config(existing.get("default", False), merged)

    on = [c for c, v in merged.items() if v]
    print(f"Backend languages: {len(langs)} | total in config: {len(merged)}")
    print(f"Newly added (off): {', '.join(added) if added else '(none)'}")
    print(f"Currently ON:      {', '.join(on) if on else '(none)'}")
    print(f"Wrote {CONFIG_FILE}")
```

Keep the `if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")` lines at the top of `main()` unchanged. The module still imports `io`, `json`, `os`, `sys`, and `fetch_supported_languages`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest tests/test_update_languages.py -v`
Expected: PASS (7 passed)

- [ ] **Step 6: Verify the module still imports and the CLI entrypoint is intact**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -c "import update_languages; print(hasattr(update_languages,'main'), hasattr(update_languages,'merge_languages'), hasattr(update_languages,'save_config'))"`
Expected: `True True True`

- [ ] **Step 7: Run the full suite (no regressions)**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest -q`
Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add update_languages.py tests/test_update_languages.py
git commit -m "refactor: extract merge_languages/save_config from update_languages"
```

---

### Task 2: Add the "Languages" tab to the GUI

**Files:**
- Modify: `hls_converter.py` (import ~line 36; `__init__` state vars ~after line 739; `_build_ui` tab registration ~after line 1010; new methods after `on_bulk_rename` / near the other tab builders)

**Interfaces:**
- Consumes: `merge_languages`, `save_config`, `load_existing` from `update_languages` (Task 1); `fetch_supported_languages` (already imported); existing `self._code_to_name`, `self._log`, `self.is_running`, `self.auto_is_running`, `self.notebook`, `self.root`, and retro theme constants.
- Produces: new "Languages" tab; methods `_build_languages_tab`, `_lang_load_from_disk`, `_lang_rebuild_list`, `_set_lang_status`, `on_lang_fetch`, `_lang_apply_fetch`, `on_lang_save`.

- [ ] **Step 1: Add the import**

In `hls_converter.py`, find (line 36):

```python
from bulk_rename import plan_renames, apply_renames
```

Add immediately after it:

```python
from update_languages import load_existing, merge_languages, save_config
```

- [ ] **Step 2: Add state vars in `__init__`**

Find the Bulk-rename state block (lines 736-739):

```python
        # Bulk rename (prefix/suffix) — transient, not persisted
        self.bulk_folder = ""
        self.bulk_prefix = tk.StringVar(value="")
        self.bulk_suffix = tk.StringVar(value="")
```

Add immediately after it:

```python
        # Languages tab (edit transcription_config.json)
        self.lang_default_var = tk.BooleanVar(value=False)
        self.lang_vars = {}       # code -> tk.BooleanVar
        self.lang_order = []      # display order of codes
        self.lang_fetching = False
```

- [ ] **Step 3: Register the tab in `_build_ui`**

Find (lines 1008-1010):

```python
        bulk_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
        self.notebook.add(bulk_tab, text="Bulk Rename")
        self._build_bulk_rename_tab(bulk_tab)
```

Add immediately after it:

```python
        lang_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
        self.notebook.add(lang_tab, text="Languages")
        self._build_languages_tab(lang_tab)
```

- [ ] **Step 4: Add the tab builder and handler methods**

In `hls_converter.py`, add these methods to the `RetroHlsApp` class (place them right after the `on_bulk_rename` method ends, so they sit with the other tab code). Use 4-space indentation (class methods):

```python
    def _build_languages_tab(self, parent):
        tk.Label(parent, text="LANGUAGES", fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_TITLE).pack(anchor="w", padx=10, pady=(10, 2))
        tk.Label(parent, text="Toggle which languages get transcribed, then Save. Fetch pulls the backend list (new ones added OFF).", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=420, justify="left").pack(anchor="w", padx=10)

        drow = tk.Frame(parent, bg=RETRO_PANEL); drow.pack(fill="x", padx=10, pady=(6, 2))
        tk.Checkbutton(
            drow, text="default (transcribe languages not listed)", variable=self.lang_default_var,
            fg=RETRO_FG, bg=RETRO_PANEL, selectcolor=RETRO_BG, activebackground=RETRO_PANEL,
            activeforeground=RETRO_ACCENT, font=FONT_SMALL,
        ).pack(side="left")

        # Scrollable list of per-language checkboxes.
        list_wrap = tk.Frame(parent, bg=RETRO_PANEL); list_wrap.pack(fill="both", expand=True, padx=10, pady=4)
        lang_scrollbar = ttk.Scrollbar(list_wrap)
        lang_canvas = tk.Canvas(list_wrap, bg=RETRO_PANEL, highlightthickness=0, yscrollcommand=lang_scrollbar.set)
        lang_scrollbar.config(command=lang_canvas.yview)
        inner = tk.Frame(lang_canvas, bg=RETRO_PANEL)
        inner_window = lang_canvas.create_window((0, 0), window=inner, anchor="nw")

        def _on_frame_configure(event):
            lang_canvas.configure(scrollregion=lang_canvas.bbox("all"))

        def _on_canvas_configure(event):
            lang_canvas.itemconfig(inner_window, width=event.width)

        def _on_wheel(event):
            lang_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        inner.bind("<Configure>", _on_frame_configure)
        lang_canvas.bind("<Configure>", _on_canvas_configure)
        for w in (lang_canvas, inner):
            w.bind("<MouseWheel>", _on_wheel)
            w.bind("<Button-4>", lambda e: lang_canvas.yview_scroll(-1, "units"))
            w.bind("<Button-5>", lambda e: lang_canvas.yview_scroll(1, "units"))
        lang_scrollbar.pack(side="right", fill="y")
        lang_canvas.pack(side="left", fill="both", expand=True)
        self._lang_list_inner = inner

        brow = tk.Frame(parent, bg=RETRO_PANEL); brow.pack(fill="x", padx=10, pady=6)
        self.lang_fetch_btn = tk.Button(brow, text="Fetch from Backend", command=self.on_lang_fetch, font=FONT_SMALL, bg=RETRO_BG, fg=RETRO_FG)
        self.lang_fetch_btn.pack(side="left")
        tk.Button(brow, text="Save", command=self.on_lang_save, font=FONT_MAIN, bg=RETRO_BG, fg=RETRO_FG).pack(side="left", padx=8)
        self.lang_status_label = tk.Label(parent, text="", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.lang_status_label.pack(anchor="w", padx=10, pady=(2, 8))

        self._lang_load_from_disk()
        self._lang_rebuild_list()

    def _lang_load_from_disk(self):
        data = load_existing()
        self.lang_default_var.set(bool(data.get("default", False)))
        self.lang_vars = {}
        self.lang_order = []
        for code, val in (data.get("languages") or {}).items():
            self.lang_vars[code] = tk.BooleanVar(value=bool(val))
            self.lang_order.append(code)

    def _lang_rebuild_list(self):
        for child in list(self._lang_list_inner.children.values()):
            child.destroy()
        for code in self.lang_order:
            name = self._code_to_name.get(code)
            label = f"{code} — {name}" if name else code
            tk.Checkbutton(
                self._lang_list_inner, text=label, variable=self.lang_vars[code],
                fg=RETRO_FG, bg=RETRO_PANEL, selectcolor=RETRO_BG, activebackground=RETRO_PANEL,
                activeforeground=RETRO_ACCENT, font=FONT_SMALL, anchor="w",
            ).pack(fill="x", anchor="w")

    def _set_lang_status(self, text):
        self.root.after(0, lambda: self.lang_status_label.config(text=text))

    def on_lang_fetch(self):
        if self.is_running or self.auto_is_running:
            messagebox.showinfo("Busy", "A render or auto run is in progress.")
            return
        if self.lang_fetching:
            return
        self.lang_fetching = True
        self.lang_fetch_btn.config(state="disabled")
        self._set_lang_status("Fetching from backend...")

        def worker():
            try:
                langs, _default = fetch_supported_languages()
            except Exception as e:
                self.root.after(0, lambda: self._lang_fetch_failed(str(e)))
                return
            self.root.after(0, lambda: self._lang_apply_fetch(langs))

        threading.Thread(target=worker, daemon=True).start()

    def _lang_fetch_failed(self, msg):
        self.lang_fetching = False
        self.lang_fetch_btn.config(state="normal")
        self._set_lang_status(f"Fetch failed: {msg}")

    def _lang_apply_fetch(self, langs):
        current = {code: var.get() for code, var in self.lang_vars.items()}
        merged, added = merge_languages(current, langs)
        for code in added:
            self.lang_vars[code] = tk.BooleanVar(value=False)
            self.lang_order.append(code)
        self._lang_rebuild_list()
        self.lang_fetching = False
        self.lang_fetch_btn.config(state="normal")
        self._set_lang_status(f"Backend: {len(langs)} | newly added (off): {len(added)}")

    def on_lang_save(self):
        if self.is_running or self.auto_is_running:
            messagebox.showinfo("Busy", "A render or auto run is in progress.")
            return
        languages = {code: self.lang_vars[code].get() for code in self.lang_order}
        try:
            save_config(self.lang_default_var.get(), languages)
        except OSError as e:
            messagebox.showerror("Languages", f"Could not save: {e}")
            return
        on_count = sum(1 for v in languages.values() if v)
        self._log(f"[LANG] Saved {len(languages)} languages ({on_count} on), default={self.lang_default_var.get()}.")
        self._set_lang_status(f"Saved {len(languages)} languages ({on_count} on).")
        messagebox.showinfo("Languages", f"Saved {len(languages)} languages.\n{on_count} on, default={self.lang_default_var.get()}.")
```

- [ ] **Step 5: Smoke-test import + wiring**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -c "import update_languages, hls_converter; print('import ok')"`
Expected: `import ok`

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `C:/Users/BLUEH/Documents/Enlight---Video-Processing/.venv/Scripts/python.exe -m pytest -q`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add hls_converter.py
git commit -m "feat: add Languages tab (fetch + edit transcription config)"
```

---

## Self-Review

**Spec coverage:**
- Refactor `update_languages.py` → `merge_languages` + `save_config`, `main()` rewired, CLI identical → Task 1. ✓
- New "Languages" tab in notebook → Task 2 Steps 3-4. ✓
- `default` checkbox + per-language on/off list → Task 2 `_build_languages_tab`, `_lang_rebuild_list`. ✓
- Friendly name where known, else bare code → `_lang_rebuild_list` uses `self._code_to_name.get(code)`. ✓
- Fetch on daemon thread, merge in-memory, new=off, status report → `on_lang_fetch`/`_lang_apply_fetch`. ✓
- Save writes JSON via `save_config`, OSError → error dialog, log + confirm → `on_lang_save`. ✓
- Busy guard on both actions → both handlers. ✓
- Fetch button disabled while in flight, re-entrancy guard → `lang_fetching` + button state. ✓
- Tests for `merge_languages` (preserve, add-as-false, keep-removed, empty, no-mutate) and `save_config` (roundtrip, bool coercion) → Task 1 Step 1. ✓

**Placeholder scan:** No TBD/TODO; every code/command step has concrete content. ✓

**Type consistency:** `merge_languages(existing_languages, backend_langs) -> (merged, added)` and `save_config(default, languages, path=CONFIG_FILE)` used identically in Task 1 tests, `main()`, and Task 2 handlers. `load_existing()` returns `{"default", "languages"}` consumed consistently. `self.lang_vars` (code→BooleanVar), `self.lang_order` (list) used consistently across build/rebuild/fetch/save. ✓

> Note: `_lang_apply_fetch` only appends codes; it never removes. This matches the spec (UI never deletes codes) and `merge_languages` guarantees `added` contains only codes not already in `current`, so no duplicate `lang_order` entries.
