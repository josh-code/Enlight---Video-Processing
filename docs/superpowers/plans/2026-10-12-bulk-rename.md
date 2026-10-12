# Bulk Rename (prefix/suffix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GUI feature that adds/edits a prefix and/or suffix on the filenames of all top-level files in a user-selected folder.

**Architecture:** A new pure-logic module `bulk_rename.py` (no GUI/optional deps, following the existing `folder_builder.py` pattern) provides name computation, planning, and application. A new "Bulk Rename" tab in `hls_converter.py` wires thin handler methods to that module. Logic is unit-tested in `tests/test_bulk_rename.py`.

**Tech Stack:** Python 3, standard library only (`os`, `pathlib`), tkinter for GUI, pytest for tests.

## Global Constraints

- `bulk_rename.py` MUST NOT import tkinter or any optional/S3 dependency — it is pure stdlib logic (mirrors `folder_builder.py`).
- Rename **top-level files only**: skip any directory entries; no recursion.
- Suffix is inserted **before** the file extension; prefix is prepended to the whole name. Extension determined by `os.path.splitext`.
- File **contents are never modified** — only `os.rename` of names within the same folder.
- Collisions (target already exists as a different file, or two sources map to the same target) and no-change entries are **skipped, never overwritten**.
- Tests import repo-root modules directly (conftest.py already adds repo root to `sys.path`); use pytest `tmp_path` fixtures for filesystem tests.
- Follow the retro theme constants in `hls_converter.py` (`RETRO_BG`, `RETRO_PANEL`, `RETRO_FG`, `RETRO_ACCENT`, `RETRO_MUTED`, `FONT_TITLE`, `FONT_MAIN`, `FONT_SMALL`).

---

## File Structure

- **Create** `bulk_rename.py` — pure logic: `compute_new_name`, `plan_renames`, `apply_renames`.
- **Create** `tests/test_bulk_rename.py` — unit tests for the above.
- **Modify** `hls_converter.py` — `__init__` state vars, `_build_ui` tab registration, new `_build_bulk_rename_tab` + handler methods.

---

### Task 1: `compute_new_name` — pure name computation

**Files:**
- Create: `bulk_rename.py`
- Test: `tests/test_bulk_rename.py`

**Interfaces:**
- Produces: `compute_new_name(filename: str, prefix: str, suffix: str) -> str` — returns the new filename with `prefix` prepended to the stem and `suffix` inserted before the extension. `os.path.splitext` determines the extension.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_bulk_rename.py`:

```python
import os
import pytest
from bulk_rename import compute_new_name


def test_prefix_and_suffix_before_extension():
    assert compute_new_name("video.mp4", "intro_", "_en") == "intro_video_en.mp4"


def test_prefix_only():
    assert compute_new_name("video.mp4", "intro_", "") == "intro_video.mp4"


def test_suffix_only():
    assert compute_new_name("video.mp4", "", "_en") == "video_en.mp4"


def test_no_extension_appends_suffix():
    assert compute_new_name("README", "x_", "_en") == "x_README_en"


def test_double_extension_uses_last_ext():
    # os.path.splitext treats only the final extension as the ext.
    assert compute_new_name("archive.tar.gz", "", "_bak") == "archive.tar_bak.gz"


def test_dotfile_ext_is_empty():
    # os.path.splitext(".env") -> (".env", ""); suffix appends to the end.
    assert compute_new_name(".env", "x_", "_y") == "x_.env_y"


def test_empty_affixes_identity():
    assert compute_new_name("video.mp4", "", "") == "video.mp4"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_bulk_rename.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bulk_rename'`

- [ ] **Step 3: Write minimal implementation**

Create `bulk_rename.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_bulk_rename.py -v`
Expected: PASS (7 passed)

- [ ] **Step 5: Commit**

```bash
git add bulk_rename.py tests/test_bulk_rename.py
git commit -m "feat: add compute_new_name for bulk rename prefix/suffix"
```

---

### Task 2: `plan_renames` — build the rename plan (top-level only, flag collisions)

**Files:**
- Modify: `bulk_rename.py`
- Test: `tests/test_bulk_rename.py`

**Interfaces:**
- Consumes: `compute_new_name` from Task 1.
- Produces: `plan_renames(folder: str, prefix: str, suffix: str) -> List[Dict]`. Each entry is `{"old": str, "new": str, "status": str, "reason": str}` where `status` is `"rename"`, `"unchanged"`, or `"collision"`. `"unchanged"` when `new == old`. `"collision"` when the target name already exists on disk (as a different file) or when two sources in this batch map to the same target. Only top-level files are considered (directories skipped). Entries are in `os.scandir` order.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_bulk_rename.py`:

```python
from bulk_rename import plan_renames


def _status_for(plan, old):
    return next(e["status"] for e in plan if e["old"] == old)


def test_plan_skips_subdirectories(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "nested.mp4").write_text("x")
    plan = plan_renames(str(tmp_path), "p_", "")
    olds = {e["old"] for e in plan}
    assert olds == {"a.mp4"}  # subdir and its contents excluded


def test_plan_marks_unchanged_for_empty_affixes(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    plan = plan_renames(str(tmp_path), "", "")
    assert _status_for(plan, "a.mp4") == "unchanged"


def test_plan_normal_rename(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    plan = plan_renames(str(tmp_path), "p_", "_s")
    entry = plan[0]
    assert entry["old"] == "a.mp4"
    assert entry["new"] == "p_a_s.mp4"
    assert entry["status"] == "rename"


def test_plan_collision_when_target_exists(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    (tmp_path / "p_a.mp4").write_text("y")  # target already present
    plan = plan_renames(str(tmp_path), "p_", "")
    assert _status_for(plan, "a.mp4") == "collision"


def test_plan_collision_when_two_sources_collide(tmp_path):
    # Two different names that map to the same target after affixing.
    (tmp_path / "a.mp4").write_text("x")
    (tmp_path / "a.MP4").write_text("y")
    # Force a collision: strip extension differences won't help here, so use
    # names that clearly collide after prefixing identical stems.
    (tmp_path / "a.mp4").unlink()
    (tmp_path / "a.MP4").unlink()
    (tmp_path / "x.txt").write_text("1")
    (tmp_path / "y.txt").write_text("2")
    # Both map to themselves normally; craft collision via suffix that makes
    # x.txt -> shared.txt and y.txt -> shared.txt is impossible with pure
    # affixing, so instead assert the simpler same-target case:
    plan = plan_renames(str(tmp_path), "", "")
    # Empty affixes -> both unchanged, no collision.
    assert all(e["status"] == "unchanged" for e in plan)
```

> Note: pure prefix/suffix affixing cannot make two *distinct* source names collide unless one source's result equals another existing name. The meaningful collision case is "target already exists" (previous test) and the batch-internal case is covered structurally in the implementation (dict of target counts). Keep the batch-collision guard in code even though affixing rarely triggers it; this protects against future changes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_bulk_rename.py -v`
Expected: FAIL with `ImportError: cannot import name 'plan_renames'`

- [ ] **Step 3: Write minimal implementation**

Append to `bulk_rename.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_bulk_rename.py -v`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add bulk_rename.py tests/test_bulk_rename.py
git commit -m "feat: add plan_renames (top-level files, collision flagging)"
```

---

### Task 3: `apply_renames` — perform renames with two-phase swap safety

**Files:**
- Modify: `bulk_rename.py`
- Test: `tests/test_bulk_rename.py`

**Interfaces:**
- Consumes: `plan_renames` output from Task 2.
- Produces: `apply_renames(folder: str, plan: List[Dict]) -> Dict` returning `{"renamed": List[tuple], "skipped": List[tuple], "errors": List[tuple]}`. `renamed` holds `(old, new)`; `skipped` holds `(old, reason)`; `errors` holds `(old, message)`. Only `status == "rename"` entries are applied; others are skipped. A two-phase approach (rename to temp names, then to finals) avoids clobbering when a target equals an existing source being renamed. Per-file `OSError` is captured into `errors` without aborting the batch.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_bulk_rename.py`:

```python
from bulk_rename import apply_renames


def test_apply_renames_basic(tmp_path):
    (tmp_path / "a.mp4").write_text("data")
    plan = plan_renames(str(tmp_path), "p_", "")
    result = apply_renames(str(tmp_path), plan)
    assert ("a.mp4", "p_a.mp4") in result["renamed"]
    assert (tmp_path / "p_a.mp4").read_text() == "data"
    assert not (tmp_path / "a.mp4").exists()


def test_apply_skips_collision_and_unchanged(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    (tmp_path / "p_a.mp4").write_text("y")  # collision target
    (tmp_path / "b.mp4").write_text("z")
    plan = plan_renames(str(tmp_path), "p_", "")
    result = apply_renames(str(tmp_path), plan)
    skipped_olds = {old for old, _ in result["skipped"]}
    assert "a.mp4" in skipped_olds           # collision skipped
    assert (tmp_path / "p_a.mp4").read_text() == "y"  # not overwritten
    assert ("b.mp4", "p_b.mp4") in result["renamed"]


def test_apply_two_phase_swap(tmp_path):
    # Simulate a shift where a planned target equals another planned source.
    # Build the plan manually to force the swap scenario A->B, B->C etc.
    (tmp_path / "1.txt").write_text("one")
    (tmp_path / "2.txt").write_text("two")
    plan = [
        {"old": "1.txt", "new": "2.txt", "status": "rename", "reason": ""},
        {"old": "2.txt", "new": "3.txt", "status": "rename", "reason": ""},
    ]
    result = apply_renames(str(tmp_path), plan)
    assert (tmp_path / "2.txt").read_text() == "one"
    assert (tmp_path / "3.txt").read_text() == "two"
    assert not (tmp_path / "1.txt").exists()
    assert len(result["renamed"]) == 2
    assert result["errors"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_bulk_rename.py -v`
Expected: FAIL with `ImportError: cannot import name 'apply_renames'`

- [ ] **Step 3: Write minimal implementation**

Append to `bulk_rename.py`:

```python
def apply_renames(folder: str, plan: List[Dict]) -> Dict:
    """Apply a rename plan. Two-phase (temp then final) to allow safe swaps."""
    renamed: List[tuple] = []
    skipped: List[tuple] = []
    errors: List[tuple] = []

    to_do = []
    for entry in plan:
        if entry["status"] == "rename":
            to_do.append((entry["old"], entry["new"]))
        else:
            skipped.append((entry["old"], entry["status"] + (f": {entry['reason']}" if entry["reason"] else "")))

    # Phase 1: move every source to a unique temp name.
    temps = []  # (temp_name, final_name, old_name)
    for i, (old, new) in enumerate(to_do):
        temp = f".__bulk_tmp_{i}__{new}"
        try:
            os.rename(os.path.join(folder, old), os.path.join(folder, temp))
            temps.append((temp, new, old))
        except OSError as e:
            errors.append((old, str(e)))

    # Phase 2: move each temp to its final name.
    for temp, new, old in temps:
        try:
            os.rename(os.path.join(folder, temp), os.path.join(folder, new))
            renamed.append((old, new))
        except OSError as e:
            errors.append((old, str(e)))

    return {"renamed": renamed, "skipped": skipped, "errors": errors}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_bulk_rename.py -v`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `python -m pytest -q`
Expected: all existing tests + new bulk_rename tests PASS

- [ ] **Step 6: Commit**

```bash
git add bulk_rename.py tests/test_bulk_rename.py
git commit -m "feat: add apply_renames with two-phase swap and error capture"
```

---

### Task 4: Wire the "Bulk Rename" tab into the GUI

**Files:**
- Modify: `hls_converter.py` (`__init__` ~line 726–733; `_build_ui` ~line 998–1000; new methods after `_build_auto_tab`/its handlers, e.g. after line 1077)

**Interfaces:**
- Consumes: `plan_renames`, `apply_renames` from `bulk_rename.py`. Uses existing `self._log`, `self.is_running`, `self.auto_is_running`, retro theme constants, and `filedialog`/`messagebox` already imported at top of file.
- Produces: new tab registered on `self.notebook`; handler methods `on_bulk_choose_folder`, `on_bulk_rename`, helper `_refresh_bulk_count`.

- [ ] **Step 1: Add the import near the other pure-helper import**

In `hls_converter.py`, find the line (~37):

```python
from folder_builder import ensure_folder_structure
```

Add immediately after it:

```python
from bulk_rename import plan_renames, apply_renames
```

- [ ] **Step 2: Add state vars in `__init__`**

In `hls_converter.py`, after the "Auto / Folder mode" block (after `self.AUTO_QUALITIES = ["1080p", "720p", "480p"]`, ~line 733), add:

```python
        # Bulk rename (prefix/suffix) — transient, not persisted
        self.bulk_folder = ""
        self.bulk_prefix = tk.StringVar(value="")
        self.bulk_suffix = tk.StringVar(value="")
```

- [ ] **Step 3: Register the tab in `_build_ui`**

In `_build_ui`, find (~line 998–1000):

```python
        auto_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
        self.notebook.add(auto_tab, text="Auto / Folder")
        self._build_auto_tab(auto_tab)
```

Add immediately after:

```python
        bulk_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
        self.notebook.add(bulk_tab, text="Bulk Rename")
        self._build_bulk_rename_tab(bulk_tab)
```

- [ ] **Step 4: Add the tab builder and handlers**

In `hls_converter.py`, after `_set_auto_counts` (or anywhere among the `RetroHlsApp` methods, e.g. right after `_build_auto_tab`'s handlers near line 1077), add these methods (note the 4-space indentation — they are methods of `RetroHlsApp`):

```python
    def _build_bulk_rename_tab(self, parent):
        tk.Label(parent, text="BULK RENAME", fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_TITLE).pack(anchor="w", padx=10, pady=(10, 2))
        tk.Label(parent, text="Add a prefix and/or suffix to ALL top-level files in a folder. Suffix goes before the extension.", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=420, justify="left").pack(anchor="w", padx=10)

        row = tk.Frame(parent, bg=RETRO_PANEL); row.pack(fill="x", padx=10, pady=6)
        tk.Button(row, text="Choose Folder", command=self.on_bulk_choose_folder, font=FONT_SMALL, bg=RETRO_BG, fg=RETRO_FG).pack(side="left")
        self.bulk_folder_label = tk.Label(row, text=self.bulk_folder or "(none)", fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=360, justify="left")
        self.bulk_folder_label.pack(side="left", padx=8)

        prow = tk.Frame(parent, bg=RETRO_PANEL); prow.pack(fill="x", padx=10, pady=2)
        tk.Label(prow, text="Prefix:", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_SMALL).pack(side="left")
        tk.Entry(prow, textvariable=self.bulk_prefix, width=18, bg=RETRO_BG, fg=RETRO_FG, insertbackground=RETRO_FG, font=FONT_SMALL).pack(side="left", padx=6)
        tk.Label(prow, text="Suffix:", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_SMALL).pack(side="left", padx=(12, 0))
        tk.Entry(prow, textvariable=self.bulk_suffix, width=18, bg=RETRO_BG, fg=RETRO_FG, insertbackground=RETRO_FG, font=FONT_SMALL).pack(side="left", padx=6)

        self.bulk_count_label = tk.Label(parent, text="Files in folder: 0", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.bulk_count_label.pack(anchor="w", padx=10, pady=(4, 2))

        brow = tk.Frame(parent, bg=RETRO_PANEL); brow.pack(fill="x", padx=10, pady=6)
        tk.Button(brow, text="RENAME FILES", command=self.on_bulk_rename, font=FONT_MAIN, bg=RETRO_BG, fg=RETRO_FG).pack(side="left")

        tk.Label(parent, text="Example: video.mp4 + prefix 'intro_' + suffix '_en' -> intro_video_en.mp4", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=420, justify="left").pack(anchor="w", padx=10, pady=(6, 2))

    def _refresh_bulk_count(self):
        n = 0
        if self.bulk_folder and os.path.isdir(self.bulk_folder):
            n = sum(1 for e in os.scandir(self.bulk_folder) if e.is_file())
        self.bulk_count_label.config(text=f"Files in folder: {n}")

    def on_bulk_choose_folder(self):
        if self.is_running or self.auto_is_running:
            messagebox.showinfo("Busy", "A render or auto run is in progress.")
            return
        folder = filedialog.askdirectory(title="Select folder to rename files in", initialdir=self.bulk_folder or os.getcwd())
        if folder:
            self.bulk_folder = folder
            self.bulk_folder_label.config(text=folder)
            self._refresh_bulk_count()

    def on_bulk_rename(self):
        if self.is_running or self.auto_is_running:
            messagebox.showinfo("Busy", "A render or auto run is in progress.")
            return
        if not self.bulk_folder or not os.path.isdir(self.bulk_folder):
            messagebox.showwarning("No folder", "Choose a valid folder first.")
            return
        prefix = self.bulk_prefix.get()
        suffix = self.bulk_suffix.get()
        if not prefix and not suffix:
            messagebox.showwarning("Nothing to do", "Enter a prefix and/or a suffix.")
            return
        plan = plan_renames(self.bulk_folder, prefix, suffix)
        to_rename = [e for e in plan if e["status"] == "rename"]
        skipped = [e for e in plan if e["status"] != "rename"]
        if not to_rename:
            messagebox.showinfo("Bulk Rename", "No files to rename (all unchanged or in collision).")
            return
        if not messagebox.askyesno(
            "Confirm Bulk Rename",
            f"Rename {len(to_rename)} file(s) in:\n{self.bulk_folder}\n\n"
            f"{len(skipped)} file(s) will be skipped (no change or name collision).\n\nProceed?",
        ):
            return
        result = apply_renames(self.bulk_folder, plan)
        self._log(
            f"[BULK] {self.bulk_folder}: {len(result['renamed'])} renamed, "
            f"{len(result['skipped'])} skipped, {len(result['errors'])} error(s)."
        )
        for old, msg in result["errors"]:
            self._log(f"[BULK] ERROR renaming {old}: {msg}", is_error=True)
        self._refresh_bulk_count()
        messagebox.showinfo(
            "Bulk Rename",
            f"Renamed: {len(result['renamed'])}\n"
            f"Skipped: {len(result['skipped'])}\n"
            f"Errors: {len(result['errors'])}",
        )
```

- [ ] **Step 5: Smoke-test that the app imports and the module wires up**

Run: `python -c "import bulk_rename, hls_converter; print('import ok')"`
Expected: `import ok` (no exceptions). This confirms the new import and method definitions parse. Full GUI launch is manual (`.\run.ps1`) and not required for this step.

- [ ] **Step 6: Run the full test suite**

Run: `python -m pytest -q`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add hls_converter.py
git commit -m "feat: add Bulk Rename tab (prefix/suffix for all files in a folder)"
```

---

## Self-Review

**Spec coverage:**
- Rename files on disk, contents untouched → Tasks 1–3 (pure `os.rename`). ✓
- Top-level only, skip subdirs → Task 2 `plan_renames` (`e.is_file()`), test `test_plan_skips_subdirectories`. ✓
- Prefix prepend + suffix before extension → Task 1 `compute_new_name`, tests cover ext/no-ext/dotfile/double-ext. ✓
- Count-based confirm dialog → Task 4 `on_bulk_rename` (`askyesno` with counts). ✓
- Collisions/no-op skipped, never overwritten → Task 2 flags them, Task 3 skips them, test `test_apply_skips_collision_and_unchanged`. ✓
- Two-phase swap safety → Task 3 + `test_apply_two_phase_swap`. ✓
- Per-file error capture → Task 3 `errors` list. ✓
- New "Bulk Rename" tab → Task 4. ✓
- Both affixes empty → warning → Task 4 handler. ✓
- Busy guard during render/auto → Task 4 handlers. ✓

**Placeholder scan:** No TBD/TODO; all steps contain concrete code and commands. ✓

**Type consistency:** `compute_new_name(filename, prefix, suffix)`, `plan_renames(folder, prefix, suffix)` returning entries with keys `old/new/status/reason`, `apply_renames(folder, plan)` returning `renamed/skipped/errors` — names used consistently across Tasks 2–4. ✓

> Note: one test in Task 2 (`test_plan_collision_when_two_sources_collide`) documents that pure affixing can't force two distinct sources to collide; it asserts the realistic empty-affix case. The batch-internal collision guard remains in code defensively.
