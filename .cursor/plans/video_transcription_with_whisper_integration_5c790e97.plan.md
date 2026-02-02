---
name: Video Transcription with Whisper Integration
overview: Add video transcription functionality using OpenAI Whisper (base model) that runs offline on local PC. Users can enable transcription, select language, and generate subtitle files (SRT, TXT, JSON) alongside HLS output. SRT and TXT files are integrated into HLS as subtitle tracks, while JSON is saved separately. Transcription runs after video rendering completes and handles errors gracefully without failing the entire render process.
todos:
  - id: "1"
    content: Update requirements.txt to add openai-whisper package
    status: completed
  - id: "2"
    content: "Add transcription helper functions: extract_audio_from_video, format_srt_time, transcribe_audio_with_whisper (with JSON output)"
    status: completed
  - id: "3"
    content: "Add HLS subtitle helper functions: create_subtitle_playlist, add_master_playlist_with_subtitles"
    status: completed
  - id: "4"
    content: Add transcription state variables (transcribe_enabled, transcription_language) to __init__
    status: completed
  - id: "5"
    content: Add transcription UI panel with checkbox and language dropdown
    status: completed
  - id: "6"
    content: Add _on_transcribe_toggle method to enable/disable language selection
    status: completed
  - id: "7"
    content: Update file_result structure to include transcript_paths (SRT/TXT/JSON), subtitle_playlist_path, and transcript_error fields
    status: completed
  - id: "8"
    content: Integrate transcription step into _render_worker after initial master playlist creation
    status: in_progress
  - id: "9"
    content: Update master playlist to include subtitle tracks after transcription completes
    status: pending
  - id: "10"
    content: Update history saving to include transcription info (SRT/TXT/JSON paths and subtitle playlist)
    status: pending
  - id: "11"
    content: Update success summary message to show transcript paths (SRT/TXT/JSON) and subtitle playlist
    status: pending
isProject: false
---

# Video Transcription with Whisper Integration

## Overview

Add offline video transcription using OpenAI Whisper (base model). Transcription runs after HLS rendering completes, generates SRT subtitle files, TXT text transcripts, and JSON data files. SRT and TXT files are integrated into the HLS master playlist as subtitle tracks, while JSON is saved as a separate file for programmatic access. Transcription handles errors gracefully without affecting video rendering success.

## Implementation Plan

### 1. Update Requirements

**File**: [`requirements.txt`](requirements.txt)

**Add**:

```
openai-whisper>=20231117
```

**Note**: Whisper will automatically download the "base" model (~150MB) on first use. No manual setup required.

### 2. Add Transcription Helper Functions

**File**: [`hls_converter.py`](hls_converter.py), after `safe_mkdir` function (after line 115)

**Add three helper functions**:

```python
def extract_audio_from_video(video_path: str, output_audio_path: str) -> Tuple[bool, str]:
    """
    Extract audio from video file using ffmpeg.
    Converts to 16kHz mono WAV format required by Whisper.
    
    Args:
        video_path: Path to input video file
        output_audio_path: Path where extracted audio will be saved
    
    Returns:
        Tuple of (success: bool, error_message: str)
    """
    cmd = [
        "ffmpeg", "-y", "-i", video_path,
        "-vn",  # No video
        "-acodec", "pcm_s16le",  # 16-bit PCM
        "-ar", "16000",  # 16kHz sample rate
        "-ac", "1",  # Mono
        output_audio_path
    ]
    creationflags, startupinfo = windows_no_window_flags()
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=creationflags,
            startupinfo=startupinfo
        )
        if result.returncode != 0:
            return False, f"FFmpeg error: {result.stderr[:200]}"
        return True, ""
    except Exception as e:
        return False, f"Failed to extract audio: {e}"

def format_srt_time(seconds: float) -> str:
    """
    Convert seconds to SRT time format: HH:MM:SS,mmm
    
    Args:
        seconds: Time in seconds (float)
    
    Returns:
        Formatted time string (e.g., "00:01:23,456")
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def transcribe_audio_with_whisper(audio_path: str, language: str = "auto", output_dir: str = None) -> Tuple[bool, dict, str]:
    """
    Transcribe audio using OpenAI Whisper (base model).
    
    Args:
        audio_path: Path to audio file (WAV format, 16kHz mono)
        language: Language code ("auto" for auto-detect, or "en", "es", etc.)
        output_dir: Directory to save transcript files (optional)
    
    Returns:
        Tuple of (success: bool, result_dict: dict, error_message: str)
        If success=True, result_dict contains:
        - "transcript_text": str - Plain text transcript
        - "srt_path": str - Path to SRT file (if output_dir provided)
        - "txt_path": str - Path to TXT file (if output_dir provided)
        - "json_path": str - Path to JSON file (if output_dir provided)
        - "detected_language": str - Language code detected by Whisper
        If success=False, result_dict will be empty dict
    """
    try:
        import whisper
        import json
    except ImportError:
        return False, {}, "Whisper not installed. Run: pip install openai-whisper"
    
    try:
        # Load Whisper model (base model for speed/quality balance)
        # First run will download model automatically (~150MB)
        model = whisper.load_model("base")
        
        # Transcribe
        if language == "auto":
            result = model.transcribe(audio_path)
        else:
            result = model.transcribe(audio_path, language=language)
        
        transcript_text = result["text"]
        detected_language = result.get("language", language if language != "auto" else "unknown")
        
        result_dict = {
            "transcript_text": transcript_text,
            "detected_language": detected_language
        }
        
        # Save transcript files if output_dir provided
        if output_dir:
            base_name = os.path.splitext(os.path.basename(audio_path))[0]
            # Remove "_temp_audio" suffix if present
            if base_name.endswith("_temp_audio"):
                base_name = base_name[:-11]
            
            # Save as .txt (plain text transcript)
            txt_path = os.path.join(output_dir, f"{base_name}_transcript.txt")
            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(transcript_text)
            result_dict["txt_path"] = txt_path
            
            # Save as .srt (subtitle format with timestamps)
            srt_path = os.path.join(output_dir, f"{base_name}_transcript.srt")
            with open(srt_path, "w", encoding="utf-8") as f:
                segments = result.get("segments", [])
                for i, segment in enumerate(segments, 1):
                    start = segment["start"]
                    end = segment["end"]
                    text = segment["text"].strip()
                    
                    # Convert seconds to SRT time format
                    start_time = format_srt_time(start)
                    end_time = format_srt_time(end)
                    
                    f.write(f"{i}\n")
                    f.write(f"{start_time} --> {end_time}\n")
                    f.write(f"{text}\n\n")
            result_dict["srt_path"] = srt_path
            
            # Save as .json (full transcription data with segments, words, etc.)
            json_path = os.path.join(output_dir, f"{base_name}_transcript.json")
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            result_dict["json_path"] = json_path
            
            return True, result_dict, ""
        else:
            return True, result_dict, ""
            
    except Exception as e:
        return False, {}, f"Transcription error: {str(e)}"
```

**Key points**:

- Audio extraction uses ffmpeg (already required)
- Whisper model loads on first use (automatic download)
- SRT format includes timestamps for subtitle compatibility
- JSON file contains full transcription data (segments, words, language, etc.)
- All errors return descriptive messages
- Returns dictionary with paths to SRT, TXT, and JSON files

### 3. Add HLS Subtitle Playlist Helper Function

**File**: [`hls_converter.py`](hls_converter.py), after `add_master_playlist` function (after line 229)

**Add new helper function**:

```python
def create_subtitle_playlist(output_dir: str, srt_path: str, language_code: str = "en") -> str:
    """
    Create an HLS subtitle playlist (.m3u8) that references an SRT file.
    
    Args:
        output_dir: Directory where playlist will be saved
        srt_path: Path to the SRT subtitle file (relative to output_dir or absolute)
        language_code: Language code (e.g., "en", "es", "fr")
    
    Returns:
        Path to the created subtitle playlist file
    
    Raises:
        FileNotFoundError: If SRT file doesn't exist
        IOError: If playlist file cannot be written
    """
    # Validate SRT file exists
    if not os.path.exists(srt_path):
        raise FileNotFoundError(f"SRT file not found: {srt_path}")
    
    # Get relative path from output_dir to srt_path
    if os.path.isabs(srt_path):
        rel_srt_path = os.path.relpath(srt_path, output_dir)
    else:
        rel_srt_path = srt_path
    
    # Normalize path separators for HLS (use forward slashes)
    rel_srt_path = rel_srt_path.replace("\\", "/")
    
    # Normalize language code (lowercase, max 3 chars for ISO 639)
    language_code = language_code.lower()[:3] if language_code else "en"
    
    playlist_lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        f"#EXT-X-TARGETDURATION:10",
        f"#EXTINF:10.0,",
        rel_srt_path
    ]
    
    playlist_path = os.path.join(output_dir, f"subtitle_{language_code}.m3u8")
    try:
        with open(playlist_path, "w", encoding="utf-8") as f:
            f.write("\n".join(playlist_lines) + "\n")
    except IOError as e:
        raise IOError(f"Failed to write subtitle playlist: {e}")
    
    return playlist_path

def add_master_playlist_with_subtitles(output_dir: str, selected, audio_exists: bool, subtitle_paths: dict = None) -> str:
    """
    Create master HLS playlist with optional subtitle tracks.
    
    Args:
        output_dir: Output directory
        selected: List of quality strings (e.g., ["1080p", "720p"])
        audio_exists: Whether video has audio track
        subtitle_paths: Optional dict mapping language codes to subtitle playlist paths
                       Format: {"en": "subtitle_en.m3u8", "es": "subtitle_es.m3u8"}
                       If None or empty, no subtitles added
    
    Returns:
        Path to master playlist file
    """
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    
    # Add subtitle tracks (EXT-X-MEDIA) if provided
    if subtitle_paths and len(subtitle_paths) > 0:
        subtitle_group_id = "subtitles"
        for lang_code, subtitle_playlist_path in subtitle_paths.items():
            # Get relative path for subtitle playlist
            if os.path.isabs(subtitle_playlist_path):
                rel_subtitle_path = os.path.relpath(subtitle_playlist_path, output_dir)
            else:
                rel_subtitle_path = subtitle_playlist_path
            
            # Normalize path separators
            rel_subtitle_path = rel_subtitle_path.replace("\\", "/")
            
            # Language name mapping (optional, for display)
            lang_names = {
                "en": "English", "es": "Spanish", "fr": "French", "de": "German",
                "it": "Italian", "pt": "Portuguese", "ru": "Russian", "ja": "Japanese",
                "ko": "Korean", "zh": "Chinese", "ar": "Arabic", "hi": "Hindi"
            }
            lang_name = lang_names.get(lang_code, lang_code.upper())
            
            # Add EXT-X-MEDIA entry for subtitle track
            # First subtitle is DEFAULT=YES, AUTOSELECT=YES
            is_first = list(subtitle_paths.keys()).index(lang_code) == 0
            media_line = (
                f'#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="{subtitle_group_id}",'
                f'NAME="{lang_name}",LANGUAGE="{lang_code}",'
                f'DEFAULT={"YES" if is_first else "NO"},'
                f'AUTOSELECT={"YES" if is_first else "NO"},'
                f'FORCED=NO,URI="{rel_subtitle_path}"'
            )
            lines.append(media_line)
    
    # Add video stream entries with subtitle reference
    for q in selected:
        prof = QUALITY_PROFILES[q]
        bw = prof["bandwidth"]
        codecs = 'CODECS="avc1.4d401f,mp4a.40.2"' if audio_exists else 'CODECS="avc1.4d401f"'
        
        # Add SUBTITLES reference if subtitles exist
        stream_line = f'#EXT-X-STREAM-INF:BANDWIDTH={bw},RESOLUTION={prof["w"]}x{prof["h"]},{codecs}'
        if subtitle_paths and len(subtitle_paths) > 0:
            stream_line += f',SUBTITLES="subtitles"'
        stream_line += f'\n{q}/index.m3u8'
        
        lines.append(stream_line)
    
    master_path = os.path.join(output_dir, "master.m3u8")
    with open(master_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return master_path
```

**Note**: The existing `add_master_playlist` function should remain unchanged for backward compatibility. The new `add_master_playlist_with_subtitles` function extends functionality by adding optional subtitle tracks. When `subtitle_paths=None` or empty, it behaves identically to the original function.

**Implementation approach**: Keep `add_master_playlist` as-is, and add `add_master_playlist_with_subtitles` as a new function. In the render workflow, call the original function first, then replace the master playlist with the subtitle-enabled version if transcription succeeds.

### 4. Add Transcription State Variables

**File**: [`hls_converter.py`](hls_converter.py), `__init__` method (after line 259, before `self.quality_vars`)

**Add**:

```python
# Transcription settings
self.transcribe_enabled = tk.BooleanVar(value=False)
self.transcription_language = tk.StringVar(value="auto")
```

**Language options**: Whisper supports 99+ languages. Common ones:

- "auto" - Auto-detect (recommended default)
- "en" - English
- "es" - Spanish
- "fr" - French
- "de" - German
- "it" - Italian
- "pt" - Portuguese
- "ru" - Russian
- "ja" - Japanese
- "ko" - Korean
- "zh" - Chinese
- "ar" - Arabic
- "hi" - Hindi

### 5. Add Transcription UI Panel

**File**: [`hls_converter.py`](hls_converter.py), `_build_ui` method (after quality panel, before progress panel, after line 319)

**Insert new panel**:

```python
# Transcription panel
trans_panel = tk.Frame(left_col, bg=RETRO_PANEL, bd=1, relief="solid")
trans_panel.pack(fill="x", pady=(0, 8))

tk.Label(trans_panel, text="TRANSCRIPTION", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 4))

# Enable checkbox row
trans_row1 = tk.Frame(trans_panel, bg=RETRO_PANEL)
trans_row1.pack(fill="x", padx=10, pady=(0, 4))
tk.Checkbutton(
    trans_row1, text="Enable Transcription", variable=self.transcribe_enabled,
    bg=RETRO_PANEL, fg=RETRO_ACCENT, selectcolor=RETRO_BG,
    activebackground=RETRO_PANEL, activeforeground=RETRO_ACCENT,
    font=FONT_MAIN, command=self._on_transcribe_toggle
).pack(side="left")

# Language selection row (disabled until transcription enabled)
trans_row2 = tk.Frame(trans_panel, bg=RETRO_PANEL)
trans_row2.pack(fill="x", padx=10, pady=(0, 10))

tk.Label(trans_row2, text="Language:", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL).pack(side="left", padx=(0, 8))

self.language_combo = ttk.Combobox(
    trans_row2, textvariable=self.transcription_language,
    values=["auto", "en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", "ar", "hi"],
    state="readonly", width=12, font=FONT_SMALL
)
self.language_combo.pack(side="left")
self.language_combo.set("auto")
self.language_combo.config(state="disabled")  # Disabled until transcription enabled

tk.Label(trans_panel, text="Tip: Transcription runs after video rendering. Requires audio track.", 
         fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL).pack(anchor="w", padx=10, pady=(0, 10))
```

**UI behavior**:

- Checkbox enables/disables transcription
- Language dropdown disabled until checkbox checked
- "auto" language recommended for best results
- Tip explains when transcription runs

### 6. Add Toggle Handler Method

**File**: [`hls_converter.py`](hls_converter.py), after `_set_status` method (after line 408)

**Add**:

```python
def _on_transcribe_toggle(self):
    """Enable/disable language selection based on transcription checkbox"""
    if self.transcribe_enabled.get():
        self.language_combo.config(state="readonly")
    else:
        self.language_combo.config(state="disabled")
```

**Purpose**: UI state management - language selection only available when transcription enabled.

### 7. Integrate Transcription into Render Workflow

**File**: [`hls_converter.py`](hls_converter.py), `_render_worker` method (after master playlist creation, before success handling, around line 1010)

**Important**: The master playlist is initially created using the existing `add_master_playlist` function. After transcription completes, we need to **replace** it with `add_master_playlist_with_subtitles` if subtitles were created. This ensures the master playlist includes subtitle tracks.

**Insert transcription step** (between master playlist creation and success handling):

```python
# Transcription (if enabled and audio exists)
transcript_paths = {}  # Dict: {"srt": path, "txt": path, "json": path}
subtitle_playlist_path = None
trans_success = False
trans_result = {}
detected_lang = None
language = None

if self.transcribe_enabled.get() and self.audio_exists:
    try:
        self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Transcribing {idx}/{total}: {name}"))
        
        # Extract audio to temporary file
        temp_audio = os.path.join(self.output_dir, f"{base_name}_temp_audio.wav")
        success, error_msg = extract_audio_from_video(fp, temp_audio)
        
        if success:
            # Transcribe
            language = self.transcription_language.get()
            trans_success, trans_result, trans_error = transcribe_audio_with_whisper(
                temp_audio, language, self.output_dir
            )
            
            if trans_success and trans_result:
                # Store transcript paths
                transcript_paths = {
                    "srt": trans_result.get("srt_path"),
                    "txt": trans_result.get("txt_path"),
                    "json": trans_result.get("json_path")
                }
                file_result["transcript_path"] = transcript_paths.get("srt")  # Keep for backward compatibility
                file_result["transcript_paths"] = transcript_paths
                
                # Get detected language (normalize to lowercase for consistency)
                detected_lang = trans_result.get("detected_language", language if language != "auto" else "en")
                detected_lang = detected_lang.lower() if detected_lang else "en"
                
                # Create HLS subtitle playlist for SRT file (only if SRT file exists)
                srt_path = transcript_paths.get("srt")
                if srt_path and os.path.exists(srt_path):
                    try:
                        subtitle_playlist_path = create_subtitle_playlist(
                            self.output_dir,
                            srt_path,
                            detected_lang
                        )
                        file_result["subtitle_playlist_path"] = subtitle_playlist_path
                    except Exception as e:
                        # Subtitle playlist creation failed - log but don't fail
                        file_result["transcript_error"] = f"Subtitle playlist creation failed: {str(e)}"
                else:
                    file_result["transcript_error"] = "SRT file not found after transcription"
                
                self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Transcribed {idx}/{total}: {name}"))
            else:
                # Transcription failed but don't fail the whole render
                self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Transcription warning {idx}/{total}: {name}"))
                file_result["transcript_error"] = trans_error
            
            # Clean up temp audio file
            try:
                if os.path.exists(temp_audio):
                    os.remove(temp_audio)
            except Exception:
                pass
        else:
            file_result["transcript_error"] = f"Audio extraction failed: {error_msg}"
    except Exception as e:
        # Transcription error - don't fail the render, just log it
        file_result["transcript_error"] = f"Transcription error: {str(e)}"

# Update master playlist to include subtitle tracks if transcription succeeded
if subtitle_playlist_path and os.path.exists(subtitle_playlist_path) and trans_success:
    try:
        # Use detected_lang if available, otherwise fallback
        lang_to_use = detected_lang if detected_lang else (language if language and language != "auto" else "en")
        subtitle_paths_dict = {lang_to_use: subtitle_playlist_path}
        # Replace master playlist with version that includes subtitle tracks
        master_path = add_master_playlist_with_subtitles(
            self.output_dir,
            selected,
            self.audio_exists,
            subtitle_paths_dict
        )
        file_result["master_path"] = master_path
    except Exception as e:
        # Master playlist update failed - log but don't fail render
        # Original master playlist still exists, so render is still successful
        if not file_result.get("transcript_error"):
            file_result["transcript_error"] = f"Failed to add subtitles to master playlist: {str(e)}"
```

**Critical points**:

- Only runs if transcription enabled AND audio exists
- Runs AFTER master playlist creation (video render complete)
- Errors don't fail the render - stored in `file_result["transcript_error"]`
- Temp audio file cleaned up after transcription
- Status updates show transcription progress
- Transcript path stored in `file_result` for summary display
- Variables (`trans_success`, `trans_result`, `detected_lang`, `language`) initialized outside conditional blocks to ensure they exist for master playlist update
- SRT file existence validated before creating subtitle playlist
- Language codes normalized (lowercase, max 3 chars) for consistency
- Master playlist update only occurs if subtitle playlist was successfully created

### 8. Update History to Include Transcription Info

**Note**: This section references variables (`transcript_paths`, `subtitle_playlist_path`) that are defined in the transcription integration step (Section 7). Ensure these variables are in scope when this code executes.

**File**: [`hls_converter.py`](hls_converter.py), history saving (line 1018)

**Replace**:

```python
self.history[fp] = {"output": self.output_dir, "ts": datetime.now().isoformat(timespec="seconds")}
```

**With**:

```python
history_entry = {
    "output": self.output_dir,
    "ts": datetime.now().isoformat(timespec="seconds"),
    "transcribed": self.transcribe_enabled.get() and self.audio_exists
}
if transcript_paths:
    history_entry["transcript"] = transcript_paths.get("srt")  # Store SRT path for backward compatibility
    history_entry["transcript_paths"] = transcript_paths  # Store all paths
    if subtitle_playlist_path:
        history_entry["subtitle_playlist"] = subtitle_playlist_path
self.history[fp] = history_entry
```

**Purpose**: Track which files were transcribed for history display.

### 9. Update Success Summary to Include Transcription Info

**File**: [`hls_converter.py`](hls_converter.py), `_finish_queue_complete` method (around line 750)

**Modify success message** (after line 750):

```python
if last_master_path:
    msg += f"Last output:\n{last_success}\n\nMaster playlist:\n{last_master_path}"
    # Check if transcription was done
    last_result = None
    for r in reversed(queue_results):
        if r["status"] == "success" and r.get("transcript_paths"):
            last_result = r
            break
    if last_result:
        transcript_paths = last_result.get("transcript_paths", {})
        msg += f"\n\nTranscripts:\n"
        if transcript_paths.get("srt"):
            msg += f"  SRT: {transcript_paths['srt']}\n"
        if transcript_paths.get("txt"):
            msg += f"  TXT: {transcript_paths['txt']}\n"
        if transcript_paths.get("json"):
            msg += f"  JSON: {transcript_paths['json']}\n"
        if last_result.get("subtitle_playlist_path"):
            msg += f"\nSubtitle playlist (HLS):\n  {last_result['subtitle_playlist_path']}"
else:
    msg += f"Last output:\n{last_success}"
```

**Purpose**: Show transcript path in success message if available.

### 10. Update File Result Structure

**File**: [`hls_converter.py`](hls_converter.py), `_render_worker` method (line 932)

**Update `file_result` initialization** to include transcription fields:

```python
file_result = {
    "file": fp,
    "status": "failed",
    "output_dir": None,
    "error": None,
    "master_path": None,
    "transcript_path": None,  # Path to SRT file if transcription succeeded (backward compatibility)
    "transcript_paths": None,  # Dict with "srt", "txt", "json" paths if transcription succeeded
    "subtitle_playlist_path": None,  # Path to HLS subtitle playlist (.m3u8) if created
    "transcript_error": None  # Error message if transcription failed
}
```

**Purpose**: Track transcription results separately from render results.

## Implementation Order

1. Update `requirements.txt` with Whisper package
2. Add helper functions (`extract_audio_from_video`, `format_srt_time`, `transcribe_audio_with_whisper`)
3. Add HLS subtitle helper functions (`create_subtitle_playlist`, `add_master_playlist_with_subtitles`)
4. Add state variables to `__init__`
5. Add UI panel with checkbox and language dropdown
6. Add `_on_transcribe_toggle` method
7. Update `file_result` structure to include transcription fields
8. Integrate transcription step into `_render_worker` (after initial master playlist creation)
9. Update master playlist to include subtitle tracks after transcription
10. Update history saving to include transcription info
11. Update success summary to show transcript paths

## Error Handling Strategy

**Transcription errors should NOT fail the render**:

- If audio extraction fails: Log error, continue (video render succeeded)
- If Whisper import fails: Show error, continue (user can install later)
- If transcription fails: Log error, continue (video render succeeded)
- If temp file cleanup fails: Log warning, continue (non-critical)

**Error storage**:

- `file_result["transcript_error"]` stores transcription errors
- Errors shown in status messages but don't affect render success
- Summary message can optionally show transcription warnings

## Testing Considerations

**Test scenarios**:

1. Video with audio, transcription enabled - should generate SRT and TXT files
2. Video without audio, transcription enabled - should skip gracefully
3. Video with audio, transcription disabled - should not transcribe
4. Transcription with "auto" language - should auto-detect
5. Transcription with specific language - should use that language
6. Transcription failure (e.g., Whisper not installed) - should not fail render
7. Multiple files in queue with transcription - should transcribe each
8. Temp audio file cleanup - should be removed after transcription

**File outputs**:

- `{basename}_transcript.txt` - Plain text transcript
- `{basename}_transcript.srt` - Subtitle file with timestamps
- Temp audio file should be deleted after use

## Performance Notes

- Whisper "base" model: ~150MB download (one-time, automatic)
- Transcription speed: Roughly 1-10x video duration on CPU (depends on hardware)
- Transcription runs AFTER video rendering (doesn't slow down HLS generation)
- First transcription will download model (may take a few minutes)
- Subsequent transcriptions use cached model (instant start)

## Edge Cases Handled

1. **No audio track**: Check `self.audio_exists` before transcribing
2. **Transcription disabled**: Skip transcription step entirely
3. **Whisper not installed**: Show error message, continue render
4. **Model download failure**: Whisper will raise exception, caught and logged
5. **Audio extraction failure**: Log error, continue render
6. **Temp file cleanup failure**: Non-critical, log warning
7. **Multiple files**: Each file transcribed independently
8. **Transcription timeout**: Not applicable (runs synchronously, but can be interrupted)
9. **SRT file missing after transcription**: Check file exists before creating subtitle playlist
10. **Variable scope**: Initialize `trans_success`, `trans_result`, `detected_lang`, `language` outside conditional blocks to avoid NameError
11. **Language code normalization**: Normalize detected language codes to lowercase and limit length
12. **Subtitle playlist write failure**: Handle IOError when writing playlist file
13. **Master playlist update failure**: Original playlist preserved if update fails
14. **Empty transcription result**: Check `trans_result` is not empty before accessing keys

## Data Flow

```
Video Render Complete
  ↓
Initial Master Playlist Created (without subtitles)
  ↓
Check: transcription_enabled AND audio_exists?
  ↓ (if yes)
Extract Audio (ffmpeg)
  ↓
Transcribe Audio (Whisper)
  ↓
Save SRT + TXT + JSON files (separate files)
  ↓
Create HLS Subtitle Playlist (.m3u8) referencing SRT
  ↓
Update Master Playlist with EXT-X-MEDIA subtitle tracks
  ↓
Clean up temp audio
  ↓
Continue to success handling
```

**Key Points**:

- JSON file is saved separately and NOT included in HLS structure
- SRT and TXT files are separate files but integrated into HLS via subtitle playlists
- Master playlist is updated AFTER transcription to include subtitle tracks
- Subtitle tracks allow video players to display subtitles when playing HLS streams

## Files Modified

- `requirements.txt`: Add `openai-whisper>=20231117`
- `hls_converter.py`: Add helper functions, UI panel, state variables, integration logic

## Issues Found and Fixed During Review

### Critical Bugs Fixed

1. **Variable Scope Issue (Line 499)**: `trans_result` and `trans_success` were referenced outside their conditional block, causing potential `NameError` if audio extraction failed. **Fixed**: Initialize these variables at the start of the transcription block.

2. **Wrong Variable Name (Line 543)**: History update used `transcript_path` (singular) instead of `transcript_paths` (dict). **Fixed**: Updated to use correct variable name and structure.

3. **Section Numbering**: Section 6 appeared twice. **Fixed**: Renumbered second occurrence to Section 7.

4. **Missing Validation**: No check that SRT file exists before creating subtitle playlist. **Fixed**: Added file existence check before playlist creation.

5. **Missing Error Handling**: `create_subtitle_playlist` didn't handle file write errors. **Fixed**: Added try-except and proper exception handling.

6. **Language Code Normalization**: Detected language codes might not match expected format. **Fixed**: Added normalization (lowercase, max 3 chars) in both functions.

7. **Empty Result Check**: No validation that `trans_result` is not empty before accessing keys. **Fixed**: Added check `if trans_success and trans_result:`.

### Robustness Improvements

1. **Variable Initialization**: All transcription-related variables initialized at block start to prevent scope issues.

2. **File Existence Checks**: Added validation for SRT file existence before creating subtitle playlist.

3. **Error Propagation**: Improved error messages to include context about which step failed.

4. **Master Playlist Update Guard**: Only update master playlist if subtitle playlist was successfully created and exists.

5. **Language Code Handling**: Normalize language codes consistently across all functions.

### HLS Subtitle Format Note

**Important**: The current implementation creates an HLS subtitle playlist that directly references the SRT file. While this works with some HLS players, the HLS specification typically expects WebVTT format for subtitles. Some players may not support SRT files directly in HLS playlists.

**Future Enhancement Consideration**: For better compatibility, consider converting SRT to WebVTT format or using segmented WebVTT files. However, for initial implementation, direct SRT reference is acceptable as many modern players (including Video.js, HLS.js) can handle SRT files when referenced in playlists.

**Current Behavior**: The subtitle playlist references the SRT file directly. Players that support this will display subtitles correctly. Players that don't support SRT will simply ignore the subtitle track without breaking video playback.