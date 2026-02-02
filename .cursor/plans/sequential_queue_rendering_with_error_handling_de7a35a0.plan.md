---
name: Sequential Queue Rendering with Error Handling
overview: Enhance the queue rendering system to process all files sequentially, handle errors gracefully by continuing with remaining files, update UI after each file completion, and show a final summary of successes and failures.
todos:
  - id: "1"
    content: Add queue_results, failed_files, and render_mode tracking variables to __init__
    status: pending
  - id: "2"
    content: Modify on_start to detect queue selection and prompt user for render mode (all vs selected)
    status: pending
  - id: "3"
    content: Update on_start to pass correct file list to _render_worker based on selected mode
    status: pending
  - id: "4"
    content: Modify _render_worker to wrap each file in try-except and continue on errors
    status: pending
  - id: "5"
    content: Create _finish_queue_complete method to handle queue completion with summary
    status: pending
  - id: "6"
    content: Update progress calculation to properly account for completed files
    status: pending
  - id: "7"
    content: Enhance status messages to show completion status after each file
    status: pending
  - id: "8"
    content: "Handle edge cases: deleted files, all failures, empty results, invalid selections"
    status: pending
isProject: false
---

# Sequential Queue Rendering with Error Handling

## Current State Analysis

The `_render_worker` method in [`hls_converter.py`](hls_converter.py) already processes files sequentially (line 756), but has these issues:

- Stops entire queue on first error
- Success message only shows last file
- No tracking of which files succeeded/failed
- No visual indication of completed files in queue
- Only supports rendering all files in queue - no option to render selected file

## Implementation Plan

### 1. Add Success/Failure Tracking and Render Mode

**File**: [`hls_converter.py`](hls_converter.py), `__init__` method (after line 255, before `self.quality_vars`)

**Exact location**: Insert after `self.history_order = []` (line 255)

**Code to add**:

```python
# Queue processing tracking
self.queue_results = []  # List of dicts: {"file": str, "status": "success"|"failed", "output_dir": str|None, "error": str|None, "master_path": str|None}
self.render_mode = "all"  # "all" or "selected"
```

**Data structure details**:

- `queue_results`: List of dictionaries, one per processed file
                                                                                                                                                                                                                                                                - `"file"`: Full file path (str)
                                                                                                                                                                                                                                                                - `"status"`: Either `"success"` or `"failed"` (str)
                                                                                                                                                                                                                                                                - `"output_dir"`: Output directory path if successful, `None` if failed (str|None)
                                                                                                                                                                                                                                                                - `"error"`: Error message if failed, `None` if successful (str|None)
                                                                                                                                                                                                                                                                - `"master_path"`: Path to master.m3u8 if successful, `None` if failed (str|None)
- `render_mode`: Tracks current render mode, defaults to `"all"`

### 2. Add Render Mode Selection UI

**File**: [`hls_converter.py`](hls_converter.py), `_build_ui` method

**Decision**: Keep existing "START RENDER" button (line 349-350). No UI changes needed - the dialog will be shown in `on_start` method when button is clicked.

**Note**: The button text and appearance remain unchanged. The behavior change is entirely in the `on_start` method (see section 3).

### 3. Modify `on_start` Method

**File**: [`hls_converter.py`](hls_converter.py), method starting at line 565

**Exact modification location**: After line 584 (FFmpeg check), before line 586 (setting `self.current_selected`)

**Step-by-step changes**:

1. **After FFmpeg validation (line 584)**, add render mode selection logic:
   ```python
   # Determine render mode and files to process
   files_to_render = []
   sel = self.queue_list.curselection()
   
   if sel and len(sel) > 0:
       # File is selected - ask user
       idx = sel[0]
       if 0 <= idx < len(self.render_queue):
           selected_file = self.render_queue[idx]
           # Validate selected file exists
           if not os.path.isfile(selected_file):
               messagebox.showerror("Error", f"Selected file no longer exists:\n{selected_file}")
               return
           
           # Show dialog
           response = messagebox.askyesnocancel(
               "Render Mode",
               f"A file is selected in the queue:\n{os.path.basename(selected_file)}\n\n"
               "Choose render mode:\n\n"
               "Yes = Render Selected File Only\n"
               "No = Render All Files\n"
               "Cancel = Don't Start"
           )
           
           if response is None:  # Cancel
               return
           elif response is True:  # Yes - selected only
               self.render_mode = "selected"
               files_to_render = [selected_file]
           else:  # False - No - all files
               self.render_mode = "all"
               files_to_render = list(self.render_queue)
       else:
           # Invalid selection index - fallback to all
           self.render_mode = "all"
           files_to_render = list(self.render_queue)
   else:
       # No selection - render all
       self.render_mode = "all"
       files_to_render = list(self.render_queue)
   
   # Validate files exist
   valid_files = [f for f in files_to_render if os.path.isfile(f)]
   if not valid_files:
       messagebox.showerror("Error", "No valid files to render. Please check file paths.")
       return
   
   if len(valid_files) < len(files_to_render):
       missing = [f for f in files_to_render if f not in valid_files]
       messagebox.showwarning("Warning", 
           f"{len(missing)} file(s) no longer exist and will be skipped:\n" + 
           "\n".join([os.path.basename(f) for f in missing[:3]]) + 
           ("..." if len(missing) > 3 else ""))
       files_to_render = valid_files
   ```

2. **Replace line 586-587** (current `self.jobs_total` setting):
   ```python
   self.current_selected = selected
   self.jobs_total = len(files_to_render)  # Use files_to_render count, not entire queue
   self.jobs_done = 0
   ```

3. **Replace line 599** (thread start):
   ```python
   threading.Thread(target=self._render_worker, args=(files_to_render, selected), daemon=True).start()
   ```


**Important notes**:

- Always validate file existence before adding to `files_to_render`
- If user cancels dialog, return early (don't start render)
- If selected file is invalid, show error and return
- If some files are missing, warn user but continue with valid files
- `jobs_total` must match the actual number of files being rendered

### 4. Modify `_render_worker` Method

**File**: [`hls_converter.py`](hls_converter.py), method starting at line 750

**Exact changes**:

1. **At method start (after line 753)**, initialize tracking:
   ```python
   queue_results = []  # Local list to track results
   ```

2. **Replace entire loop (lines 755-801)** with try-except wrapped version:
```python
master_path = None  # Track last successful master path
for idx, fp in enumerate(files, 1):
    file_result = {
        "file": fp,
        "status": "failed",  # Default to failed, set to success if completes
        "output_dir": None,
        "error": None,
        "master_path": None
    }
    
    try:
        # Validate file exists (re-check in case deleted)
        if not os.path.isfile(fp):
            file_result["error"] = f"File missing: {fp}"
            queue_results.append(file_result)
            self.root.after(0, lambda idx=idx, total=len(files), fp=fp: self._set_status(f"Failed {idx}/{total}: {os.path.basename(fp)} - file missing"))
            self.jobs_done = idx
            continue
        
        # Set up file processing
        self.file_path = fp
        base_name = os.path.splitext(os.path.basename(fp))[0]
        self.output_dir = os.path.join(self.output_base_dir, base_name + "_hls")
        safe_mkdir(self.output_dir)
        
        # Get video info
        info = get_video_info(fp)
        self.duration_s = float(info.get("duration_s", 0.0) or 0.0)
        self.audio_exists = has_audio_stream(fp)
        self.current_selected = selected
        self._reset_progress(reset_overall=False)
        self.per_quality_progress = {q: 0.0 for q in selected}
        
        # Update UI
        self.root.after(0, lambda fp=fp: self._update_selected_file_info(fp))
        self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"rendering {idx}/{total}: {name}"))
        
        # Render each quality
        total_s = max(float(self.duration_s), 0.001)
        render_error = None
        
        for q_idx, q in enumerate(selected, 1):
            self.root.after(0, lambda q=q, q_idx=q_idx, total_q=len(selected): self._set_status(f"rendering {q} ({q_idx}/{total_q})"))
            ok, err = self._render_single_quality(q, total_s, selected)
            if not ok:
                if err is None:
                    # Process was killed/stuck - treat as error
                    render_error = f"Rendering {q} was interrupted"
                else:
                    render_error = err
                break  # Exit quality loop on error
        
        # Check if rendering succeeded
        if render_error:
            file_result["error"] = render_error
            queue_results.append(file_result)
            self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Failed {idx}/{total}: {name}"))
            self.jobs_done = idx
            # Update overall progress for failed file
            if self.jobs_total > 0:
                queue_percent = (self.jobs_done / self.jobs_total) * 100.0
                self.root.after(0, lambda p=queue_percent: self._update_overall(p))
            continue
        
        # Create master playlist
        try:
            master_path = add_master_playlist(self.output_dir, selected, self.audio_exists)
            file_result["master_path"] = master_path
        except Exception as e:
            file_result["error"] = f"Master playlist write failed: {e}"
            queue_results.append(file_result)
            self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Failed {idx}/{total}: {name} - playlist error"))
            self.jobs_done = idx
            if self.jobs_total > 0:
                queue_percent = (self.jobs_done / self.jobs_total) * 100.0
                self.root.after(0, lambda p=queue_percent: self._update_overall(p))
            continue
        
        # Success - save to history and update result
        file_result["status"] = "success"
        file_result["output_dir"] = self.output_dir
        queue_results.append(file_result)
        
        self.history[fp] = {"output": self.output_dir, "ts": datetime.now().isoformat(timespec="seconds")}
        save_history(self.history)
        self.root.after(0, self._refresh_history_ui)
        self.last_output_dir = self.output_dir
        self.jobs_done = idx
        
        # Update status and progress
        self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Completed {idx}/{total}: {name}"))
        if self.jobs_total > 0:
            queue_percent = (self.jobs_done / self.jobs_total) * 100.0
            self.root.after(0, lambda p=queue_percent: self._update_overall(p))
        
        # Small delay to show completion status
        time.sleep(0.5)
    
    except Exception as e:
        # Catch any unexpected exceptions
        file_result["error"] = f"Unexpected error: {str(e)}"
        queue_results.append(file_result)
        self.root.after(0, lambda idx=idx, total=len(files), fp=fp: self._set_status(f"Failed {idx}/{total}: {os.path.basename(fp)} - error"))
        self.jobs_done = idx
        if self.jobs_total > 0:
            queue_percent = (self.jobs_done / self.jobs_total) * 100.0
            self.root.after(0, lambda p=queue_percent: self._update_overall(p))
        continue

# After loop completes, call finish method
self.root.after(0, lambda results=queue_results: self._finish_queue_complete(results))
```


**Critical points**:

- Wrap entire file processing in try-except
- Never return early - always continue to next file
- Update `jobs_done` immediately after each file (success or failure)
- Update overall progress after each file
- Save history only on success
- Always append to `queue_results` (success or failure)
- Call `_finish_queue_complete` after loop, not `_finish_success`

### 5. Create `_finish_queue_complete` Method

**File**: [`hls_converter.py`](hls_converter.py), insert after `_finish_with_error` method (after line 622)

**Exact implementation**:

```python
def _finish_queue_complete(self, queue_results):
    """
    Handle completion of entire queue with summary.
    
    Args:
        queue_results: List of dicts with format:
            {"file": str, "status": "success"|"failed", "output_dir": str|None, 
             "error": str|None, "master_path": str|None}
    """
    if not queue_results:
        # Edge case: no results (shouldn't happen, but handle it)
        self._set_status("completed (no files processed)")
        self.is_running = False
        self.start_btn.config(state="normal")
        self.pick_btn.config(state="normal")
        self.remove_btn.config(state="normal")
        self.clear_btn.config(state="normal")
        self.open_btn.config(state="disabled")
        messagebox.showwarning("Warning", "No files were processed.")
        return
    
    # Calculate statistics
    total = len(queue_results)
    successes = [r for r in queue_results if r["status"] == "success"]
    failures = [r for r in queue_results if r["status"] == "failed"]
    success_count = len(successes)
    failure_count = len(failures)
    
    # Update progress to 100%
    self._update_overall(100.0)
    
    # Update all quality bars to 100% for visual completion
    for q in self.current_selected:
        self._update_quality_progress(q, 100.0, self.current_selected)
    
    # Find last successful output
    last_success = None
    last_master_path = None
    for r in reversed(queue_results):  # Check in reverse to get last
        if r["status"] == "success" and r["output_dir"]:
            last_success = r["output_dir"]
            last_master_path = r.get("master_path")
            break
    
    # Update last_output_dir
    if last_success:
        self.last_output_dir = last_success
    
    # Reset state
    self.is_running = False
    self.start_btn.config(state="normal")
    self.pick_btn.config(state="normal")
    self.remove_btn.config(state="normal")
    self.clear_btn.config(state="normal")
    
    # Enable/disable open button based on success
    if last_success:
        self.open_btn.config(state="normal")
    else:
        self.open_btn.config(state="disabled")
    
    # Build summary message
    if failure_count == 0:
        # All succeeded
        self._set_status("done ✅ - all succeeded")
        msg = f"All {success_count} file(s) rendered successfully!\n\n"
        if last_master_path:
            msg += f"Last output:\n{last_success}\n\nMaster playlist:\n{last_master_path}"
        else:
            msg += f"Last output:\n{last_success}"
        messagebox.showinfo("Success", msg)
    elif success_count == 0:
        # All failed
        self._set_status("done ❌ - all failed")
        msg = f"All {failure_count} file(s) failed to render.\n\n"
        msg += "Failed files:\n"
        for r in failures[:5]:  # Show first 5
            msg += f"  • {os.path.basename(r['file'])}\n"
            if r["error"]:
                msg += f"    Error: {r['error'][:100]}\n"
        if len(failures) > 5:
            msg += f"  ... and {len(failures) - 5} more"
        messagebox.showerror("All Failed", msg)
    else:
        # Partial success
        self._set_status(f"done ⚠️ - {success_count} succeeded, {failure_count} failed")
        msg = f"Queue completed: {success_count} succeeded, {failure_count} failed\n\n"
        
        if success_count > 0:
            msg += f"✅ Successful ({success_count}):\n"
            for r in successes[:3]:  # Show first 3
                msg += f"  • {os.path.basename(r['file'])}\n"
            if len(successes) > 3:
                msg += f"  ... and {len(successes) - 3} more\n"
            msg += "\n"
        
        if failure_count > 0:
            msg += f"❌ Failed ({failure_count}):\n"
            for r in failures[:3]:  # Show first 3
                msg += f"  • {os.path.basename(r['file'])}\n"
                if r["error"]:
                    error_preview = r["error"][:80] + "..." if len(r["error"]) > 80 else r["error"]
                    msg += f"    {error_preview}\n"
            if len(failures) > 3:
                msg += f"  ... and {len(failures) - 3} more\n"
        
        if last_master_path:
            msg += f"\nLast successful output:\n{last_success}"
        
        messagebox.showwarning("Queue Complete", msg)
    
    # Final history refresh
    self.root.after(0, self._refresh_history_ui)
```

**Key implementation details**:

- Always update progress to 100% at end
- Calculate statistics from `queue_results`
- Find last successful output by iterating in reverse
- Build different messages for: all success, all failure, partial success
- Limit displayed file lists to prevent huge messageboxes
- Always refresh history UI at end
- Set appropriate button states

### 6. Enhance UI Updates During Processing

**File**: [`hls_converter.py`](hls_converter.py), `_render_worker` method

**UI update locations** (already included in section 4, but documented here for clarity):

1. **Status updates** (using `self.root.after(0, lambda: self._set_status(...))`):

                                                                                                                                                                                                                                                                                                                                                                                                - Start of each file: `"rendering {idx}/{total}: {name}"` (line 773 equivalent)
                                                                                                                                                                                                                                                                                                                                                                                                - During quality rendering: `"rendering {quality} ({q_idx}/{total_q})"` (line 777 equivalent)
                                                                                                                                                                                                                                                                                                                                                                                                - After success: `"Completed {idx}/{total}: {name}"` (new)
                                                                                                                                                                                                                                                                                                                                                                                                - After failure: `"Failed {idx}/{total}: {name}"` or with error details (new)

2. **Progress updates**:

                                                                                                                                                                                                                                                                                                                                                                                                - After each file (success or failure): Update `jobs_done` and call `_update_overall`
                                                                                                                                                                                                                                                                                                                                                                                                - Formula: `queue_percent = (jobs_done / jobs_total) * 100.0`
                                                                                                                                                                                                                                                                                                                                                                                                - Use `self.root.after(0, lambda p=queue_percent: self._update_overall(p))` for thread safety

3. **File info updates**:

                                                                                                                                                                                                                                                                                                                                                                                                - At start of each file: `self._update_selected_file_info(fp)` (line 772 equivalent)
                                                                                                                                                                                                                                                                                                                                                                                                - This updates the file label, metadata, and history display

4. **History UI refresh**:

                                                                                                                                                                                                                                                                                                                                                                                                - After each successful file: `self._refresh_history_ui()` (line 794 equivalent)
                                                                                                                                                                                                                                                                                                                                                                                                - Final refresh in `_finish_queue_complete`

**Note**: All UI updates must use `self.root.after(0, ...)` for thread safety since `_render_worker` runs in a separate thread.

### 7. Improve Progress Calculation

**File**: [`hls_converter.py`](hls_converter.py), `_update_quality_progress` method (line 418)

**Current implementation** (lines 430-432):

```python
if self.jobs_total > 0:
    queue_percent = ((self.jobs_done + (avg / 100.0)) / self.jobs_total) * 100.0
    self._update_overall(queue_percent)
```

**Issue**: This formula is correct for in-progress files, but needs to be called explicitly after each file completes.

**Fix in `_render_worker`**:

- After each file completes (success or failure), calculate progress directly:
  ```python
  if self.jobs_total > 0:
      queue_percent = (self.jobs_done / self.jobs_total) * 100.0
      self.root.after(0, lambda p=queue_percent: self._update_overall(p))
  ```

- This ensures progress reflects completed files immediately
- The existing `_update_quality_progress` method handles per-quality progress correctly
- No changes needed to `_update_quality_progress` method itself

**Progress calculation logic**:

- During file rendering: `((jobs_done + (current_job_percent / 100.0)) / jobs_total) * 100.0`
- After file completion: `(jobs_done / jobs_total) * 100.0`
- Both formulas are correct for their respective states

### 8. Handle Edge Cases

**File**: [`hls_converter.py`](hls_converter.py)

**Edge cases and their handling**:

1. **File deleted during processing**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `_render_worker` loop, before processing each file
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Check `os.path.isfile(fp)` at start of try block
                                                                                                                                                                                                                                                                                                                                                                                                - **Action**: Mark as failed with error "File missing", continue to next file
                                                                                                                                                                                                                                                                                                                                                                                                - **Already handled**: Yes, in section 4 implementation

2. **Empty queue after validation**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `on_start`, after determining `files_to_render`
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Check `if not files_to_render:` and show error, return early
                                                                                                                                                                                                                                                                                                                                                                                                - **Already handled**: Yes, in section 3 implementation

3. **All files fail**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `_finish_queue_complete`
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Check `if success_count == 0:`, show error messagebox, disable "Open Last Output"
                                                                                                                                                                                                                                                                                                                                                                                                - **Already handled**: Yes, in section 5 implementation

4. **Partial success**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `_finish_queue_complete`
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Show warning messagebox with both success and failure lists
                                                                                                                                                                                                                                                                                                                                                                                                - **Already handled**: Yes, in section 5 implementation

5. **Thread interruption**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `_render_worker` and `_finish_queue_complete`
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Always set `self.is_running = False` in `_finish_queue_complete` (guaranteed to run)
                                                                                                                                                                                                                                                                                                                                                                                                - **Note**: If thread is killed externally, `_finish_queue_complete` won't run, but this is acceptable as the app would be closing

6. **Selected file becomes invalid**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `on_start`, after getting selection
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Validate file exists and is in queue before proceeding
                                                                                                                                                                                                                                                                                                                                                                                                - **Already handled**: Yes, in section 3 implementation

7. **No valid files after filtering**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `on_start`, after filtering out missing files
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Check `if not valid_files:` and show error, return early
                                                                                                                                                                                                                                                                                                                                                                                                - **Already handled**: Yes, in section 3 implementation

8. **Empty queue_results**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `_finish_queue_complete`
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Check at start of method, show warning and return early
                                                                                                                                                                                                                                                                                                                                                                                                - **Already handled**: Yes, in section 5 implementation

9. **User cancels render mode dialog**:

                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: In `on_start`, after `askyesnocancel`
                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Check `if response is None: return`
                                                                                                                                                                                                                                                                                                                                                                                                - **Already handled**: Yes, in section 3 implementation

10. **Queue modified during render**:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - **Location**: Buttons are disabled during render (lines 591-595)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - **Handling**: Buttons remain disabled until `_finish_queue_complete` re-enables them
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - **Note**: This prevents queue modification during render, which is correct behavior

### 9. Update History and UI Refresh

**File**: [`hls_converter.py`](hls_converter.py)

**Current behavior** (lines 792-794): History is saved and UI refreshed after each successful file.

**Implementation details**:

1. **History saving** (in `_render_worker`, after successful file):
   ```python
   self.history[fp] = {"output": self.output_dir, "ts": datetime.now().isoformat(timespec="seconds")}
   save_history(self.history)
   ```


                                                                                                                                                                                                                                                                                                                                                                                                - Only saves successful files (correct behavior)
                                                                                                                                                                                                                                                                                                                                                                                                - Saves immediately after each success (good for crash recovery)
                                                                                                                                                                                                                                                                                                                                                                                                - Uses `datetime.now().isoformat(timespec="seconds")` for timestamp

2. **History UI refresh** (in `_render_worker`, after saving history):
   ```python
   self.root.after(0, self._refresh_history_ui)
   ```


                                                                                                                                                                                                                                                                                                                                                                                                - Refreshes after each successful file (good for real-time updates)
                                                                                                                                                                                                                                                                                                                                                                                                - Uses `self.root.after(0, ...)` for thread safety

3. **Final history refresh** (in `_finish_queue_complete`):
   ```python
   self.root.after(0, self._refresh_history_ui)
   ```


                                                                                                                                                                                                                                                                                                                                                                                                - Final refresh at end to ensure UI is up-to-date
                                                                                                                                                                                                                                                                                                                                                                                                - Handles case where UI refresh was missed

**No changes needed**: Current implementation is correct. The final refresh in `_finish_queue_complete` ensures UI is current even if a refresh was missed.

### 10. Status Message Improvements

**File**: [`hls_converter.py`](hls_converter.py), `_render_worker` method

**Status message locations and formats**:

1. **Queue start** (line 752):

                                                                                                                                                                                                                                                                                                                                                                                                - Current: `"rendering queue..."`
                                                                                                                                                                                                                                                                                                                                                                                                - Keep as-is

2. **File start** (line 773 equivalent):

                                                                                                                                                                                                                                                                                                                                                                                                - Current: `"rendering {idx}/{total}: {name}"`
                                                                                                                                                                                                                                                                                                                                                                                                - Keep as-is (good format)

3. **Quality rendering** (line 777 equivalent):

                                                                                                                                                                                                                                                                                                                                                                                                - Current: `"rendering {quality} ({q_idx}/{total_q})"`
                                                                                                                                                                                                                                                                                                                                                                                                - Keep as-is (good format)

4. **File completion (success)** (new, in section 4):

                                                                                                                                                                                                                                                                                                                                                                                                - Format: `"Completed {idx}/{total}: {name}"`
                                                                                                                                                                                                                                                                                                                                                                                                - Location: After successful master playlist creation
                                                                                                                                                                                                                                                                                                                                                                                                - Purpose: Show file completed before moving to next

5. **File completion (failure)** (new, in section 4):

                                                                                                                                                                                                                                                                                                                                                                                                - Format: `"Failed {idx}/{total}: {name}"` or `"Failed {idx}/{total}: {name} - {error_preview}"`
                                                                                                                                                                                                                                                                                                                                                                                                - Location: After error is caught
                                                                                                                                                                                                                                                                                                                                                                                                - Purpose: Show file failed, indicate continuing

6. **Queue complete** (in `_finish_queue_complete`):

                                                                                                                                                                                                                                                                                                                                                                                                - Formats:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - All success: `"done ✅ - all succeeded"`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - All failed: `"done ❌ - all failed"`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Partial: `"done ⚠️ - {success_count} succeeded, {failure_count} failed"`
                                                                                                                                                                                                                                                                                                                                                                                                - Location: At start of `_finish_queue_complete`

**Implementation**: All status updates use `self.root.after(0, lambda: self._set_status(...))` for thread safety.

## Implementation Order

**Critical**: Follow this exact order to avoid breaking the application:

1. **Add tracking variables** (Section 1)

                                                                                                                                                                                                                                                                                                                                                                                                - Add `self.queue_results = []` and `self.render_mode = "all"` to `__init__`
                                                                                                                                                                                                                                                                                                                                                                                                - Test: App should start normally

2. **Create `_finish_queue_complete` method** (Section 5)

                                                                                                                                                                                                                                                                                                                                                                                                - Add new method after `_finish_with_error`
                                                                                                                                                                                                                                                                                                                                                                                                - Test: Method exists, no syntax errors

3. **Modify `on_start` for render mode** (Section 3)

                                                                                                                                                                                                                                                                                                                                                                                                - Add selection detection and dialog
                                                                                                                                                                                                                                                                                                                                                                                                - Update file list determination
                                                                                                                                                                                                                                                                                                                                                                                                - Test: Dialog appears when file selected, correct files passed to worker

4. **Modify `_render_worker` error handling** (Section 4)

                                                                                                                                                                                                                                                                                                                                                                                                - Wrap loop in try-except structure
                                                                                                                                                                                                                                                                                                                                                                                                - Replace early returns with continue statements
                                                                                                                                                                                                                                                                                                                                                                                                - Add queue_results tracking
                                                                                                                                                                                                                                                                                                                                                                                                - Call `_finish_queue_complete` instead of `_finish_success`
                                                                                                                                                                                                                                                                                                                                                                                                - Test: Single file render works, errors don't crash app

5. **Verify progress calculation** (Section 7)

                                                                                                                                                                                                                                                                                                                                                                                                - Ensure progress updates after each file
                                                                                                                                                                                                                                                                                                                                                                                                - Test: Progress bar updates correctly during multi-file render

6. **Test all scenarios**:

                                                                                                                                                                                                                                                                                                                                                                                                - Single file (selected mode)
                                                                                                                                                                                                                                                                                                                                                                                                - Single file (all mode, no selection)
                                                                                                                                                                                                                                                                                                                                                                                                - Multiple files, all succeed
                                                                                                                                                                                                                                                                                                                                                                                                - Multiple files, one fails
                                                                                                                                                                                                                                                                                                                                                                                                - Multiple files, all fail
                                                                                                                                                                                                                                                                                                                                                                                                - File deleted during processing
                                                                                                                                                                                                                                                                                                                                                                                                - User cancels dialog

**Important notes**:

- Don't modify `_render_single_quality` - it already returns `(ok, err)` tuple correctly
- Don't modify `_update_quality_progress` - it works correctly
- All UI updates must use `self.root.after(0, ...)` for thread safety
- Test incrementally after each major change

## Testing Considerations

- Test with single file (should work as before)
- Test with multiple files, all succeed
- Test with multiple files, one fails in middle
- Test with multiple files, all fail
- Test with file deleted during processing
- Verify UI updates after each file
- Verify history is saved after each successful file
- Verify final summary shows correct counts

## Summary of Key Changes

### Files Modified

- **`hls_converter.py`**: Single file containing all changes

### Methods Modified

1. **`__init__`** (line ~255): Add `queue_results` and `render_mode` variables
2. **`on_start`** (line ~565): Add render mode selection dialog and file list determination
3. **`_render_worker`** (line ~750): Complete rewrite of error handling, add queue_results tracking

### Methods Added

1. **`_finish_queue_complete`** (after line 622): New method to handle queue completion with summary

### Methods Unchanged (but called differently)

- `_render_single_quality`: No changes needed, already returns `(ok, err)` tuple
- `_update_quality_progress`: No changes needed, progress calculation is correct
- `_finish_success`: Will not be called from `_render_worker` anymore (replaced by `_finish_queue_complete`)
- `_finish_with_error`: Will not be called from `_render_worker` anymore (errors handled in loop)

### Data Flow

```
User clicks "START RENDER"
  ↓
on_start() validates and determines files_to_render
  ↓
_render_worker(files_to_render, selected) starts in thread
  ↓
For each file:
 - Try to process
 - On success: Save to history, append to queue_results
 - On failure: Append to queue_results with error, continue
 - Update UI and progress
  ↓
After all files:
  _finish_queue_complete(queue_results)
 - Calculate statistics
 - Show summary messagebox
 - Reset UI state
```

### Critical Implementation Notes

1. **Thread Safety**: All UI updates MUST use `self.root.after(0, lambda: ...)` since `_render_worker` runs in a separate thread

2. **Error Handling**: Never return early from `_render_worker` loop - always continue to next file

3. **Progress Tracking**: Update `jobs_done` immediately after each file (success or failure), then update overall progress

4. **History Saving**: Only save successful files to history, but save immediately after each success

5. **Render Mode**: `files_to_render` list determines what gets processed - always validate files exist before adding to list

6. **State Management**: `is_running` must be set to `False` in `_finish_queue_complete` (guaranteed execution point)

### Potential Pitfalls to Avoid

1. **Don't** modify `_render_single_quality` - it works correctly
2. **Don't** use early returns in `_render_worker` loop - always continue
3. **Don't** call `_finish_success` from `_render_worker` - use `_finish_queue_complete`
4. **Don't** forget to validate file existence in `on_start` before rendering
5. **Don't** update UI directly from worker thread - always use `self.root.after(0, ...)`
6. **Don't** forget to update `jobs_done` after each file completion
7. **Don't** forget to call `_finish_queue_complete` after loop completes (even if all fail)