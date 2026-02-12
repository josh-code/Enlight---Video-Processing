import os
import json
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
from tkinter import ttk
import queue
import time
import re
from datetime import datetime
from pathlib import Path
from typing import Tuple

try:
    from config import Config as S3Config
    from s3_uploader import S3UploadManager
    _S3_AVAILABLE = True
except ImportError:
    S3Config = None
    S3UploadManager = None
    _S3_AVAILABLE = False

S3_CONFIG_FILE = "s3_config.json"

# ----------------------------
# Retro theme
# ----------------------------
RETRO_BG = "#111111"
RETRO_PANEL = "#151515"
RETRO_FG = "#33ff66"
RETRO_ACCENT = "#ffcc66"
RETRO_MUTED = "#6fe89a"
FONT_TITLE = ("Courier New", 14, "bold")
FONT_MAIN = ("Courier New", 10)
FONT_SMALL = ("Courier New", 9)

# Parse: time=00:00:12.34 (from ffmpeg -stats output)
_FFMPEG_TIME_RE = re.compile(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)")
HISTORY_FILE = "output_history.json"

# ----------------------------
# Helpers
# ----------------------------
def run_cmd(cmd):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

def check_ffmpeg_available() -> Tuple[bool, str]:
    """
    Check if ffmpeg and ffprobe are available in PATH.
    Returns (is_available, error_message)
    """
    try:
        result = run_cmd(["ffmpeg", "-version"])
        if result.returncode != 0:
            return False, "ffmpeg command failed"
    except FileNotFoundError:
        return False, "ffmpeg not found in PATH"
    except Exception as e:
        return False, f"Error checking ffmpeg: {e}"

    try:
        result = run_cmd(["ffprobe", "-version"])
        if result.returncode != 0:
            return False, "ffprobe command failed"
    except FileNotFoundError:
        return False, "ffprobe not found in PATH"
    except Exception as e:
        return False, f"Error checking ffprobe: {e}"

    return True, ""

def get_available_ffmpeg_encoders() -> set:
    """
    Run ffmpeg -encoders and return a set of available H.264 encoder names
    (e.g. "h264_amf", "h264_nvenc", "h264_qsv"). libx264 is assumed available if ffmpeg runs.
    """
    result = set()
    try:
        proc = subprocess.run(
            ["ffmpeg", "-encoders"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
        )
        out = (proc.stdout or "") + (proc.stderr or "")
        for name in ("h264_amf", "h264_nvenc", "h264_qsv"):
            if name in out:
                result.add(name)
    except Exception:
        pass
    return result

def build_video_encode_args(encoder_key: str, prof: dict) -> list:
    """
    Build FFmpeg video encoding args for the given encoder and quality profile.
    Returns a list of args (e.g. -c:v, encoder name, -b:v, ...). Does not include -i, -vf, audio, or HLS args.
    encoder_key: "cpu" | "amd" | "nvidia" | "intel"
    prof: dict with "b", "maxrate", "buf" from QUALITY_PROFILES.
    """
    b, maxrate, buf = prof["b"], prof["maxrate"], prof["buf"]
    if encoder_key == "cpu":
        return [
            "-c:v", "libx264", "-profile:v", "main", "-crf", "20",
            "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
            "-b:v", b, "-maxrate", maxrate, "-bufsize", buf,
        ]
    if encoder_key == "amd":
        return [
            "-c:v", "h264_amf", "-rc", "vbr_peak", "-quality", "balanced",
            "-b:v", b, "-maxrate", maxrate, "-bufsize", buf,
            "-g", "48",
        ]
    if encoder_key == "nvidia":
        return [
            "-c:v", "h264_nvenc", "-rc", "vbr",
            "-b:v", b, "-maxrate", maxrate, "-bufsize", buf,
            "-g", "48",
        ]
    if encoder_key == "intel":
        return [
            "-c:v", "h264_qsv",
            "-b:v", b, "-maxrate", maxrate, "-bufsize", buf,
            "-g", "48",
        ]
    # Fallback to CPU
    return [
        "-c:v", "libx264", "-profile:v", "main", "-crf", "20",
        "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
        "-b:v", b, "-maxrate", maxrate, "-bufsize", buf,
    ]

def has_audio_stream(file_path: str) -> bool:
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=index",
        "-of", "csv=p=0",
        file_path
    ]
    r = run_cmd(cmd)
    return r.returncode == 0 and bool(r.stdout.strip())

def get_video_info(file_path: str):
    dur_cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path
    ]
    dur_res = run_cmd(dur_cmd)
    duration_s = 0.0
    if dur_res.returncode == 0 and dur_res.stdout.strip():
        try:
            duration_s = float(dur_res.stdout.strip())
        except Exception:
            duration_s = 0.0

    wh_cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        file_path
    ]
    wh_res = run_cmd(wh_cmd)
    width, height = 0, 0
    if wh_res.returncode == 0 and wh_res.stdout.strip():
        try:
            parts = wh_res.stdout.strip().split(",")
            width = int(parts[0])
            height = int(parts[1])
        except Exception:
            width, height = 0, 0

    return {"duration_s": duration_s, "width": width, "height": height}

def format_seconds(s: float) -> str:
    if s <= 0:
        return "unknown"
    m = int(s // 60)
    sec = int(round(s - m * 60))
    return f"{sec}s" if m <= 0 else f"{m}m {sec}s"

def safe_mkdir(path: str):
    os.makedirs(path, exist_ok=True)

def sanitize_folder_name(name: str) -> str:
    """
    Sanitize a string for use as a folder or file name: replace spaces with underscores,
    remove or replace characters that are problematic on common filesystems.
    """
    if not name:
        return name
    # Replace spaces with underscores and strip leading/trailing
    s = name.strip().replace(" ", "_")
    # Collapse multiple underscores
    while "__" in s:
        s = s.replace("__", "_")
    # Remove chars that are invalid in folder names on Windows: \ / : * ? " < > |
    for ch in ('\\', '/', ':', '*', '?', '"', '<', '>', '|'):
        s = s.replace(ch, "_")
    return s.strip("_") or name.strip()

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
    # Use round() instead of int() to prevent duplicate timestamps when fractional milliseconds
    # truncate to the same value. Clamp to 999 since SRT format only supports 0-999 milliseconds.
    millis = min(round((seconds % 1) * 1000), 999)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def format_vtt_time(seconds: float) -> str:
    """
    Convert seconds to WebVTT time format: HH:MM:SS.mmm
    (Same as SRT but with dot for milliseconds; HLS/browsers expect WebVTT.)
    """
    srt_fmt = format_srt_time(seconds)
    return srt_fmt.replace(",", ".")

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
        # Use certifi's CA bundle for Whisper model download (fixes SSL_CERTIFICATE_VERIFY_FAILED on macOS)
        try:
            import certifi
            os.environ["SSL_CERT_FILE"] = certifi.where()
            os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
        except ImportError:
            pass
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

            # Save as .vtt (WebVTT – required by HLS for subtitle tracks; browsers don't render SRT from HLS)
            vtt_path = os.path.join(output_dir, f"{base_name}_transcript.vtt")
            with open(vtt_path, "w", encoding="utf-8") as f:
                f.write("WEBVTT\n\n")
                for segment in segments:
                    start = segment["start"]
                    end = segment["end"]
                    text = segment["text"].strip()
                    start_time = format_vtt_time(start)
                    end_time = format_vtt_time(end)
                    f.write(f"{start_time} --> {end_time}\n")
                    f.write(f"{text}\n\n")
            result_dict["vtt_path"] = vtt_path
            
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

def load_history():
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_history(history):
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception:
        pass

def write_log(output_dir: str, name: str, text: str):
    log_path = os.path.join(output_dir, name)
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(text or "")
    return log_path

def windows_no_window_flags():
    """
    Prevents ffmpeg from popping a console window when packaged as a GUI exe.
    """
    creationflags = 0
    startupinfo = None
    if os.name == "nt":
        creationflags = subprocess.CREATE_NO_WINDOW
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return creationflags, startupinfo

def _drain_stream_to_queue(stream, q: "queue.Queue[str]"):
    try:
        for line in iter(stream.readline, ""):
            if not line:
                break
            q.put(line)
    except Exception:
        pass

def parse_hhmmss_to_us(ts: str) -> int:
    """
    Parses "HH:MM:SS.microseconds" into microseconds.
    Example: "00:01:23.456789"
    """
    try:
        parts = ts.strip().split(".", 1)
        hms = parts[0]
        frac = parts[1] if len(parts) > 1 else "0"
        h, m, s = [int(x) for x in hms.split(":")]
        frac = (frac + "000000")[:6]  # pad/truncate to 6 digits
        us = int(frac)
        return ((h * 3600 + m * 60 + s) * 1_000_000) + us
    except Exception:
        return 0

def parse_stats_time_to_seconds(line: str) -> float:
    """
    Parses ffmpeg -stats stderr lines and extracts time=HH:MM:SS.xx
    Returns seconds, or None.
    """
    m = _FFMPEG_TIME_RE.search(line)
    if not m:
        return None
    try:
        hh = int(m.group(1))
        mm = int(m.group(2))
        ss = float(m.group(3))
        return hh * 3600 + mm * 60 + ss
    except Exception:
        return None

# ----------------------------
# ABR settings
# ----------------------------
QUALITY_PROFILES = {
    "1080p": {"w": 1920, "h": 1080, "b": "5000k", "maxrate": "5350k", "buf": "7500k", "bandwidth": 5200000},
    "720p":  {"w": 1280, "h": 720,  "b": "2800k", "maxrate": "3000k", "buf": "4200k", "bandwidth": 3000000},
    "480p":  {"w": 854,  "h": 480,  "b": "1400k", "maxrate": "1500k", "buf": "2100k", "bandwidth": 1500000},
    "360p":  {"w": 640,  "h": 360,  "b": "800k",  "maxrate": "900k",  "buf": "1200k", "bandwidth": 900000},
}
QUALITY_ORDER = ["1080p", "720p", "480p", "360p"]

def build_filter_complex(selected):
    n = len(selected)
    split_labels = [f"v{i}" for i in range(n)]
    out_labels = [f"v{i}out" for i in range(n)]

    fc = [f"[0:v]split={n}" + "".join([f"[{x}]" for x in split_labels]) + ";"]
    for i, q in enumerate(selected):
        prof = QUALITY_PROFILES[q]
        w, h = prof["w"], prof["h"]
        fc.append(
            f"[{split_labels[i]}]"
            f"scale=w={w}:h={h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2"
            f"[{out_labels[i]}];"
        )
    return "".join(fc).rstrip(";"), out_labels

def add_master_playlist(output_dir: str, selected, audio_exists: bool):
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    for q in selected:
        prof = QUALITY_PROFILES[q]
        bw = prof["bandwidth"]
        codecs = 'CODECS="avc1.4d401f,mp4a.40.2"' if audio_exists else 'CODECS="avc1.4d401f"'
        lines.append(f'#EXT-X-STREAM-INF:BANDWIDTH={bw},RESOLUTION={prof["w"]}x{prof["h"]},{codecs}')
        lines.append(f"{q}/index.m3u8")
    master_path = os.path.join(output_dir, "master.m3u8")
    with open(master_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return master_path

def create_subtitle_playlist(output_dir: str, subtitle_path: str, language_code: str = "en") -> str:
    """
    Create an HLS subtitle playlist (.m3u8) that references a subtitle file.
    Prefer WebVTT (.vtt): HLS expects WebVTT for subtitles; SRT in the playlist often won't render in players.
    
    Args:
        output_dir: Directory where playlist will be saved
        subtitle_path: Path to the subtitle file – use .vtt (WebVTT) for HLS compatibility
        language_code: Language code (e.g., "en", "es", "fr")
    
    Returns:
        Path to the created subtitle playlist file
    
    Raises:
        FileNotFoundError: If subtitle file doesn't exist
        IOError: If playlist file cannot be written
    """
    # Validate subtitle file exists
    if not os.path.exists(subtitle_path):
        raise FileNotFoundError(f"Subtitle file not found: {subtitle_path}")
    
    # Get relative path from output_dir to subtitle_path
    if os.path.isabs(subtitle_path):
        rel_subtitle_path = os.path.relpath(subtitle_path, output_dir)
    else:
        rel_subtitle_path = subtitle_path
    
    # Normalize path separators for HLS (use forward slashes)
    rel_subtitle_path = rel_subtitle_path.replace("\\", "/")
    
    # Normalize language code (lowercase, max 3 chars for ISO 639)
    language_code = language_code.lower()[:3] if language_code else "en"
    
    playlist_lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        f"#EXT-X-TARGETDURATION:10",
        f"#EXTINF:10.0,",
        rel_subtitle_path
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

# ----------------------------
# UI App
# ----------------------------
class RetroHlsApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Enlight — Retro HLS Renderer")
        self.root.configure(bg=RETRO_BG)
        self.root.resizable(True, True)

        self.file_path = None
        self.output_dir = None
        self.duration_s = 0.0
        self.audio_exists = False
        self.is_running = False
        self.per_quality_progress = {}
        self.current_selected = []
        self.render_queue = []
        self.output_base_dir = os.path.join(os.getcwd(), "hls_outputs")
        self.history = load_history()
        self.current_job_percent = 0.0
        self.jobs_total = 0
        self.jobs_done = 0
        self.last_output_dir = None
        self.history_order = []

        # Queue processing tracking
        self.queue_results = []  # List of dicts: {"file": str, "status": "success"|"failed", "output_dir": str|None, "error": str|None, "master_path": str|None}
        self.render_mode = "all"  # "all" or "selected"

        # Transcription settings
        self.transcribe_enabled = tk.BooleanVar(value=False)
        self.transcription_language = tk.StringVar(value="auto")

        self.quality_vars = {
            "1080p": tk.BooleanVar(value=False),
            "720p": tk.BooleanVar(value=True),
            "480p": tk.BooleanVar(value=True),
            "360p": tk.BooleanVar(value=False),
        }

        self.encoder_var = tk.StringVar()
        self.available_encoders = get_available_ffmpeg_encoders()

        # Simulated transcript progress (Whisper has no callback; we tick the bar during transcription)
        self._transcript_progress_after_id = None
        self._transcript_simulated_pct = 0.0

        # S3 upload
        self.s3_enabled = tk.BooleanVar(value=False)
        self.s3_course_id = tk.StringVar(value="")
        self.s3_video_name = tk.StringVar(value="")
        self.s3_language = tk.StringVar(value="en")
        self.s3_delete_local = tk.BooleanVar(value=False)
        self.s3_upload_cancel = False  # set True to cancel upload
        self._load_s3_config()

        self._build_ui()

    def _build_ui(self):
        header = tk.Frame(self.root, bg=RETRO_BG)
        header.pack(fill="x", padx=12, pady=(12, 6))

        tk.Label(header, text="ENLIGHT RETRO HLS RENDERER", fg=RETRO_ACCENT, bg=RETRO_BG, font=FONT_TITLE).pack(anchor="w")
        tk.Label(header, text="MP4 Adaptive HLS (Retro mode)", fg=RETRO_MUTED, bg=RETRO_BG, font=FONT_SMALL).pack(anchor="w", pady=(2, 0))

        main = tk.Frame(self.root, bg=RETRO_BG)
        main.pack(fill="both", expand=True, padx=12, pady=(0, 6))

        left_col = tk.Frame(main, bg=RETRO_BG)
        left_col.pack(side="left", fill="both", expand=True, padx=(0, 6))

        right_col = tk.Frame(main, bg=RETRO_BG)
        right_col.pack(side="right", fill="both", expand=True, padx=(6, 0))

        # Left: info, output, qualities, progress
        info_panel = tk.Frame(left_col, bg=RETRO_PANEL, bd=1, relief="solid")
        info_panel.pack(fill="x", pady=(0, 8))

        tk.Label(info_panel, text="CURRENT SELECTION", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 2))
        self.file_label = tk.Label(info_panel, text="Selected: (none)", fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=420, justify="left")
        self.file_label.pack(anchor="w", padx=10)
        self.meta_label = tk.Label(info_panel, text="Duration: - | Resolution: - | Audio: -", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.meta_label.pack(anchor="w", padx=10, pady=(2, 2))
        self.history_label = tk.Label(info_panel, text="History: none", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=420, justify="left")
        self.history_label.pack(anchor="w", padx=10, pady=(0, 6))

        out_row = tk.Frame(info_panel, bg=RETRO_PANEL)
        out_row.pack(fill="x", padx=10, pady=(0, 10))
        tk.Label(out_row, text="OUTPUT BASE", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(side="left")
        self.output_label = tk.Label(out_row, text=self.output_base_dir, fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=260, justify="left")
        self.output_label.pack(side="left", padx=(8, 8))
        tk.Button(out_row, text="CHANGE", command=self.on_choose_output_dir,
                  bg=RETRO_ACCENT, fg="black", font=FONT_SMALL, bd=0, padx=10, pady=4).pack(side="left")

        q_panel = tk.Frame(left_col, bg=RETRO_PANEL, bd=1, relief="solid")
        q_panel.pack(fill="x", pady=(0, 8))
        tk.Label(q_panel, text="RENDER QUALITIES", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 4))
        q_grid = tk.Frame(q_panel, bg=RETRO_PANEL)
        q_grid.pack(fill="x", padx=10, pady=(0, 8))
        for i, q in enumerate(QUALITY_ORDER):
            tk.Checkbutton(
                q_grid, text=q, variable=self.quality_vars[q],
                bg=RETRO_PANEL, fg=RETRO_ACCENT, selectcolor=RETRO_BG,
                activebackground=RETRO_PANEL, activeforeground=RETRO_ACCENT,
                font=FONT_MAIN
            ).grid(row=0, column=i, padx=8, sticky="w")
        tk.Label(q_panel, text="Tip: 1080p is heavier on CPU. Start with 720p+480p.", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)\
            .pack(anchor="w", padx=10, pady=(0, 4))

        # Encoder selection (CPU vs GPU)
        enc_row = tk.Frame(q_panel, bg=RETRO_PANEL)
        enc_row.pack(fill="x", padx=10, pady=(0, 10))
        tk.Label(enc_row, text="Encoder:", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL).pack(side="left", padx=(0, 8))
        self.encoder_display = {"cpu": "CPU (libx264)", "amd": "AMD GPU (AMF)", "nvidia": "NVIDIA GPU (NVENC)", "intel": "Intel GPU (QSV)"}
        encoder_values = list(self.encoder_display.values())
        self.encoder_var.set(self.encoder_display["cpu"])
        self.encoder_combo = ttk.Combobox(
            enc_row,
            textvariable=self.encoder_var,
            values=encoder_values,
            state="readonly",
            width=22,
            font=FONT_SMALL,
        )
        self.encoder_combo.pack(side="left")

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

        # S3 Upload panel
        s3_panel = tk.Frame(left_col, bg=RETRO_PANEL, bd=1, relief="solid")
        s3_panel.pack(fill="x", pady=(0, 8))
        tk.Label(s3_panel, text="S3 UPLOAD", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 4))
        s3_row1 = tk.Frame(s3_panel, bg=RETRO_PANEL)
        s3_row1.pack(fill="x", padx=10, pady=(0, 4))
        tk.Checkbutton(
            s3_row1, text="Enable S3 Upload", variable=self.s3_enabled,
            bg=RETRO_PANEL, fg=RETRO_ACCENT, selectcolor=RETRO_BG,
            activebackground=RETRO_PANEL, activeforeground=RETRO_ACCENT,
            font=FONT_MAIN, command=self._on_s3_toggle
        ).pack(side="left")
        self.s3_backend_label = tk.Label(s3_panel, text="Backend: not configured", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.s3_backend_label.pack(anchor="w", padx=10, pady=(0, 2))
        s3_row2 = tk.Frame(s3_panel, bg=RETRO_PANEL)
        s3_row2.pack(fill="x", padx=10, pady=(0, 4))
        tk.Label(s3_row2, text="Course ID", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=12, anchor="w").pack(side="left", padx=(0, 4))
        self.s3_course_entry = tk.Entry(s3_row2, textvariable=self.s3_course_id, width=28, font=FONT_SMALL, bg=RETRO_BG, fg=RETRO_ACCENT, insertbackground=RETRO_ACCENT)
        self.s3_course_entry.pack(side="left")
        s3_row3 = tk.Frame(s3_panel, bg=RETRO_PANEL)
        s3_row3.pack(fill="x", padx=10, pady=(0, 4))
        tk.Label(s3_row3, text="Video Name", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=12, anchor="w").pack(side="left", padx=(0, 4))
        self.s3_video_entry = tk.Entry(s3_row3, textvariable=self.s3_video_name, width=28, font=FONT_SMALL, bg=RETRO_BG, fg=RETRO_ACCENT, insertbackground=RETRO_ACCENT)
        self.s3_video_entry.pack(side="left")
        s3_row4 = tk.Frame(s3_panel, bg=RETRO_PANEL)
        s3_row4.pack(fill="x", padx=10, pady=(0, 4))
        tk.Label(s3_row4, text="Language", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=12, anchor="w").pack(side="left", padx=(0, 4))
        self.s3_lang_combo = ttk.Combobox(s3_row4, textvariable=self.s3_language, values=(S3Config.SUPPORTED_LANGUAGES if _S3_AVAILABLE and S3Config else ["en"]), state="readonly", width=10, font=FONT_SMALL)
        self.s3_lang_combo.pack(side="left")
        if _S3_AVAILABLE and S3Config:
            self.s3_lang_combo.set(S3Config.DEFAULT_LANGUAGE)
        self.s3_prefix_label = tk.Label(s3_panel, text="S3 Prefix: (set Course ID + Video Name)", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=400, justify="left")
        self.s3_prefix_label.pack(anchor="w", padx=10, pady=(4, 2))
        s3_row5 = tk.Frame(s3_panel, bg=RETRO_PANEL)
        s3_row5.pack(fill="x", padx=10, pady=(0, 4))
        tk.Checkbutton(
            s3_row5, text="Delete local files after upload", variable=self.s3_delete_local,
            bg=RETRO_PANEL, fg=RETRO_ACCENT, selectcolor=RETRO_BG,
            activebackground=RETRO_PANEL, activeforeground=RETRO_ACCENT,
            font=FONT_SMALL
        ).pack(side="left")
        s3_btn_row = tk.Frame(s3_panel, bg=RETRO_PANEL)
        s3_btn_row.pack(fill="x", padx=10, pady=(6, 10))
        self.s3_test_btn = tk.Button(s3_btn_row, text="Test Connection", command=self._on_s3_test, bg=RETRO_ACCENT, fg="black", font=FONT_SMALL, bd=0, padx=10, pady=4)
        self.s3_test_btn.pack(side="left")
        self.s3_cancel_btn = tk.Button(s3_btn_row, text="Cancel Upload", command=self._on_s3_cancel, bg="#333333", fg=RETRO_ACCENT, font=FONT_SMALL, bd=0, padx=10, pady=4, state="disabled")
        self.s3_cancel_btn.pack(side="left", padx=(8, 0))
        self.s3_course_id.trace_add("write", lambda *a: self._update_s3_prefix_label())
        self.s3_video_name.trace_add("write", lambda *a: self._update_s3_prefix_label())
        self.s3_language.trace_add("write", lambda *a: self._update_s3_prefix_label())
        self._on_s3_toggle()

        p_panel = tk.Frame(left_col, bg=RETRO_PANEL, bd=1, relief="solid")
        p_panel.pack(fill="x", pady=(0, 8))
        tk.Label(p_panel, text="PROGRESS", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 4))
        self.status_label = tk.Label(p_panel, text="Status: idle", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.status_label.pack(anchor="w", padx=10, pady=(0, 6))

        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("Retro.Horizontal.TProgressbar", troughcolor=RETRO_BG, background=RETRO_FG)

        tk.Label(p_panel, text="Overall", fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_SMALL).pack(anchor="w", padx=10)
        self.overall_bar = ttk.Progressbar(p_panel, length=420, mode="determinate", style="Retro.Horizontal.TProgressbar")
        self.overall_bar.pack(anchor="w", padx=10, pady=(0, 10))

        self.per_quality_bars = {}
        self.per_quality_labels = {}
        for q in QUALITY_ORDER:
            row = tk.Frame(p_panel, bg=RETRO_PANEL)
            row.pack(fill="x", padx=10, pady=(0, 6))
            tk.Label(row, text=q, fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=8, anchor="w").pack(side="left")
            bar = ttk.Progressbar(row, length=340, mode="determinate", style="Retro.Horizontal.TProgressbar")
            bar.pack(side="left", padx=(6, 0))
            pct = tk.Label(row, text="0%", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=6, anchor="e")
            pct.pack(side="right")
            self.per_quality_bars[q] = bar
            self.per_quality_labels[q] = pct

        # Transcript progress row (encoding + transcript)
        trans_row = tk.Frame(p_panel, bg=RETRO_PANEL)
        trans_row.pack(fill="x", padx=10, pady=(0, 6))
        tk.Label(trans_row, text="Transcript", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=8, anchor="w").pack(side="left")
        self.transcript_bar = ttk.Progressbar(trans_row, length=340, mode="determinate", style="Retro.Horizontal.TProgressbar")
        self.transcript_bar.pack(side="left", padx=(6, 0))
        self.transcript_label = tk.Label(trans_row, text="0%", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=6, anchor="e")
        self.transcript_label.pack(side="right")

        # Upload progress row (S3)
        upload_row = tk.Frame(p_panel, bg=RETRO_PANEL)
        upload_row.pack(fill="x", padx=10, pady=(0, 6))
        tk.Label(upload_row, text="Upload", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=8, anchor="w").pack(side="left")
        self.upload_bar = ttk.Progressbar(upload_row, length=340, mode="determinate", style="Retro.Horizontal.TProgressbar")
        self.upload_bar.pack(side="left", padx=(6, 0))
        self.upload_label = tk.Label(upload_row, text="-", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=6, anchor="e")
        self.upload_label.pack(side="right")
        self.upload_status_label = tk.Label(p_panel, text="", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.upload_status_label.pack(anchor="w", padx=10, pady=(0, 4))

        a_panel = tk.Frame(left_col, bg=RETRO_BG)
        a_panel.pack(fill="x", pady=(6, 0))
        self.start_btn = tk.Button(a_panel, text="START RENDER", command=self.on_start,
                                   bg=RETRO_FG, fg="black", font=FONT_MAIN, bd=0, padx=16, pady=8)
        self.start_btn.pack(side="left")
        self.open_btn = tk.Button(a_panel, text="OPEN LAST OUTPUT", command=self.on_open_folder,
                                  bg=RETRO_ACCENT, fg="black", font=FONT_MAIN, bd=0, padx=12, pady=8, state="disabled")
        self.open_btn.pack(side="left", padx=(10, 0))
        tk.Button(a_panel, text="QUIT", command=self.root.destroy,
                  bg="#333333", fg=RETRO_ACCENT, font=FONT_MAIN, bd=0, padx=12, pady=8).pack(side="right")

        # Right: tabs (queue/history)
        tabs_panel = tk.Frame(right_col, bg=RETRO_BG)
        tabs_panel.pack(fill="both", expand=True)
        self.notebook = ttk.Notebook(tabs_panel)
        self.notebook.pack(fill="both", expand=True)

        queue_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
        history_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
        logs_tab = tk.Frame(self.notebook, bg=RETRO_PANEL)
        self.notebook.add(queue_tab, text="Queue")
        self.notebook.add(history_tab, text="History")
        self.notebook.add(logs_tab, text="Logs")

        tk.Label(queue_tab, text="RENDER QUEUE", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 2))
        list_frame = tk.Frame(queue_tab, bg=RETRO_PANEL)
        list_frame.pack(fill="both", expand=True, padx=10, pady=(0, 6))
        self.queue_list = tk.Listbox(list_frame, bg=RETRO_BG, fg=RETRO_ACCENT, selectmode=tk.BROWSE)
        self.queue_list.pack(side="left", fill="both", expand=True)
        sbq = tk.Scrollbar(list_frame, orient="vertical", command=self.queue_list.yview)
        sbq.pack(side="right", fill="y")
        self.queue_list.config(yscrollcommand=sbq.set)
        self.queue_list.bind("<<ListboxSelect>>", self.on_select_queue)

        btn_row = tk.Frame(queue_tab, bg=RETRO_PANEL)
        btn_row.pack(fill="x", padx=10, pady=(0, 10))
        self.pick_btn = tk.Button(btn_row, text="ADD VIDEOS", command=self.on_add_files,
                                  bg=RETRO_ACCENT, fg="black", font=FONT_MAIN, bd=0, padx=12, pady=6)
        self.pick_btn.pack(side="left")
        self.remove_btn = tk.Button(btn_row, text="REMOVE SELECTED", command=self.on_remove_selected,
                                    bg="#333333", fg=RETRO_ACCENT, font=FONT_MAIN, bd=0, padx=12, pady=6)
        self.remove_btn.pack(side="left", padx=(8, 0))
        self.clear_btn = tk.Button(btn_row, text="CLEAR LIST", command=self.on_clear_list,
                                   bg="#333333", fg=RETRO_ACCENT, font=FONT_MAIN, bd=0, padx=12, pady=6)
        self.clear_btn.pack(side="left", padx=(8, 0))

        tk.Label(history_tab, text="OUTPUT HISTORY", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 2))
        hist_frame = tk.Frame(history_tab, bg=RETRO_PANEL)
        hist_frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        self.history_list = tk.Listbox(hist_frame, bg=RETRO_BG, fg=RETRO_ACCENT, selectmode=tk.BROWSE)
        self.history_list.pack(side="left", fill="both", expand=True)
        sbh = tk.Scrollbar(hist_frame, orient="vertical", command=self.history_list.yview)
        sbh.pack(side="right", fill="y")
        self.history_list.config(yscrollcommand=sbh.set)
        self.history_list.bind("<<ListboxSelect>>", self.on_select_history)

        tk.Label(logs_tab, text="LOGS", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 2))
        log_frame = tk.Frame(logs_tab, bg=RETRO_PANEL)
        log_frame.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        self.log_text = tk.Text(log_frame, bg=RETRO_BG, fg=RETRO_ACCENT, font=("Courier New", 9), wrap=tk.WORD, state="disabled")
        self.log_text.pack(side="left", fill="both", expand=True)
        self.log_text.tag_configure("error", foreground="#ff6666")
        self.log_text.tag_configure("success", foreground=RETRO_FG)
        slog = tk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        slog.pack(side="right", fill="y")
        self.log_text.config(yscrollcommand=slog.set)

        self._refresh_history_ui()

    def _log(self, msg: str, is_error: bool = False):
        """Append a line to the Logs tab (thread-safe; schedules on main thread)."""
        tag = "error" if is_error else "success" if "success" in msg.lower() or "done" in msg.lower() or "complete" in msg.lower() else None
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}\n"
        def _append():
            self.log_text.config(state="normal")
            if tag:
                self.log_text.insert(tk.END, line, tag)
            else:
                self.log_text.insert(tk.END, line)
            self.log_text.see(tk.END)
            self.log_text.config(state="disabled")
        self.root.after(0, _append)

    def _set_status(self, text: str):
        self.status_label.config(text=f"Status: {text}")

    def _load_s3_config(self):
        """Load non-sensitive S3 settings from s3_config.json."""
        if not os.path.isfile(S3_CONFIG_FILE):
            return
        try:
            with open(S3_CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("last_course_id") is not None:
                self.s3_course_id.set(data["last_course_id"])
            if data.get("last_video_name") is not None:
                self.s3_video_name.set(data["last_video_name"])
            if data.get("language") is not None:
                self.s3_language.set(data["language"])
            if data.get("delete_local_after_upload") is not None:
                self.s3_delete_local.set(data["delete_local_after_upload"])
        except (json.JSONDecodeError, OSError):
            pass

    def _save_s3_config(self):
        """Save non-sensitive S3 settings to s3_config.json."""
        try:
            data = {
                "last_course_id": self.s3_course_id.get(),
                "last_video_name": self.s3_video_name.get(),
                "language": self.s3_language.get(),
                "delete_local_after_upload": self.s3_delete_local.get(),
            }
            with open(S3_CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except OSError:
            pass

    def _update_s3_prefix_label(self):
        """Update S3 prefix display from course ID + language + sanitized video name."""
        cid = (self.s3_course_id.get() or "").strip()
        vid = (self.s3_video_name.get() or "").strip()
        lang = (self.s3_language.get() or "en").strip()
        if not cid or not vid:
            self.s3_prefix_label.config(text="S3 Prefix: (set Course ID + Video Name)")
            return
        safe_name = sanitize_folder_name(vid)
        prefix = f"courses/{cid}/{lang}/{safe_name}/"
        if len(prefix) > 50:
            display = prefix[:47] + "..."
        else:
            display = prefix
        self.s3_prefix_label.config(text=f"S3 Prefix: {display}")

    def _on_s3_toggle(self):
        """Enable/disable S3 panel fields and update backend label."""
        enabled = self.s3_enabled.get()
        state = "normal" if enabled else "disabled"
        self.s3_course_entry.config(state=state)
        self.s3_video_entry.config(state=state)
        self.s3_lang_combo.config(state="readonly" if enabled else "disabled")
        if _S3_AVAILABLE and S3Config and S3Config.is_configured():
            self.s3_backend_label.config(text="Backend: ✓ Configured from .env", fg=RETRO_FG)
        else:
            self.s3_backend_label.config(text="Backend: not configured (set .env)", fg=RETRO_MUTED)
        self._update_s3_prefix_label()

    def _on_s3_test(self):
        """Test backend connection and token."""
        if not _S3_AVAILABLE:
            messagebox.showwarning("S3", "s3_uploader not available. Install requests and python-dotenv.")
            return
        mgr = S3UploadManager()
        ok, msg = mgr.validate_connection()
        if ok:
            messagebox.showinfo("S3", "Connection successful.")
        else:
            messagebox.showerror("S3", f"Connection failed: {msg}")

    def _on_s3_cancel(self):
        """Set flag to cancel upload (worker checks this)."""
        self.s3_upload_cancel = True

    def _on_transcribe_toggle(self):
        """Enable/disable language selection based on transcription checkbox"""
        if self.transcribe_enabled.get():
            self.language_combo.config(state="readonly")
        else:
            self.language_combo.config(state="disabled")

    def _reset_progress(self, reset_overall: bool = True):
        self._cancel_transcript_progress_timer()
        self.per_quality_progress = {}
        self.current_job_percent = 0.0
        if reset_overall:
            self.overall_bar["value"] = 0
        for q in QUALITY_ORDER:
            self.per_quality_bars[q]["value"] = 0
            self.per_quality_labels[q].config(text="0%")
        self.transcript_bar["value"] = 0
        self.transcript_label.config(text="-" if not self.transcribe_enabled.get() else "0%")

    def _update_overall(self, percent: float):
        self.overall_bar["value"] = percent

    def _cancel_transcript_progress_timer(self):
        """Cancel the simulated transcript progress timer if running."""
        if self._transcript_progress_after_id is not None:
            try:
                self.root.after_cancel(self._transcript_progress_after_id)
            except Exception:
                pass
            self._transcript_progress_after_id = None

    def _tick_transcript_progress(self):
        """
        Called periodically while transcription runs. Increments simulated transcript
        progress (Whisper has no progress callback) and updates overall bar.
        """
        self._transcript_simulated_pct = min(90.0, self._transcript_simulated_pct + 4.0)
        pct = int(self._transcript_simulated_pct)
        self.transcript_bar["value"] = pct
        self.transcript_label.config(text=f"{pct}%")
        # Nudge overall bar: 85% + 15% * (simulated/100) for this file
        if self.jobs_total > 0:
            effective = 0.85 + 0.15 * (self._transcript_simulated_pct / 100.0)
            queue_percent = ((self.jobs_done + effective) / self.jobs_total) * 100.0
            self._update_overall(queue_percent)
        if self._transcript_simulated_pct < 90.0:
            self._transcript_progress_after_id = self.root.after(300, self._tick_transcript_progress)
        else:
            self._transcript_progress_after_id = None

    def _set_transcript_progress(self, state: str):
        """Update transcript row: idle (0% or -), running (incremental sim), or done (100%)."""
        self._cancel_transcript_progress_timer()
        if state == "idle":
            self.transcript_bar["value"] = 0
            self.transcript_label.config(text="-" if not self.transcribe_enabled.get() else "0%")
        elif state == "running":
            self._transcript_simulated_pct = 0.0
            self.transcript_bar["value"] = 0
            self.transcript_label.config(text="0%")
            self._transcript_progress_after_id = self.root.after(300, self._tick_transcript_progress)
        elif state == "done":
            self.transcript_bar["value"] = 100
            self.transcript_label.config(text="100%")
            # Advance overall bar to reflect completed file (encoding + transcript); worker will set jobs_done next
            if self.jobs_total > 0:
                self._update_overall(((self.jobs_done + 1) / self.jobs_total) * 100.0)

    def _update_quality_progress(self, quality: str, percent: float, selected):
        self.per_quality_progress[quality] = percent
        if quality in self.per_quality_bars:
            self.per_quality_bars[quality]["value"] = percent
        if quality in self.per_quality_labels:
            self.per_quality_labels[quality].config(text=f"{int(percent)}%")

        avg = 0.0
        if selected:
            avg = sum(self.per_quality_progress.get(q, 0.0) for q in selected) / len(selected)
            self.current_job_percent = avg

        if self.jobs_total > 0:
            # When all qualities complete and transcription is enabled for this file, reserve 15% for transcript phase
            if avg >= 100.0 and self.transcribe_enabled.get() and self.audio_exists:
                effective = 0.85
            else:
                effective = avg / 100.0
            queue_percent = ((self.jobs_done + effective) / self.jobs_total) * 100.0
            self._update_overall(queue_percent)
        else:
            self._update_overall(avg)

    def _refresh_queue_ui(self):
        self.queue_list.delete(0, tk.END)
        for fp in self.render_queue:
            self.queue_list.insert(tk.END, fp)

    def _refresh_history_ui(self):
        self.history_list.delete(0, tk.END)
        self.history_order = []
        items = list(self.history.items())
        try:
            items.sort(key=lambda x: x[1].get("ts", ""))
        except Exception:
            pass
        for fp, rec in items:
            out = rec.get("output", "?")
            ts = rec.get("ts", "?")
            self.history_order.append(fp)
            self.history_list.insert(tk.END, f"{ts} | {fp} -> {out}")

    def _show_history_for(self, fp: str):
        rec = self.history.get(fp)
        if rec:
            out = rec.get("output", "?")
            ts = rec.get("ts", "?")
            self.history_label.config(text=f"History: {out} (at {ts})")
        else:
            self.history_label.config(text="History: none")

    def _update_selected_file_info(self, fp: str):
        if not fp:
            self.file_label.config(text="Selected: (none)")
            self.meta_label.config(text="Duration: - | Resolution: - | Audio: -")
            self.history_label.config(text="History: none")
            return

        self.file_label.config(text=f"Selected: {fp}")
        info = get_video_info(fp)
        dur = float(info.get("duration_s", 0.0) or 0.0)
        width = info.get("width", 0)
        height = info.get("height", 0)
        audio_flag = has_audio_stream(fp)
        self.meta_label.config(
            text=f"Duration: {format_seconds(dur)} | Resolution: {width}x{height} | Audio: {'yes' if audio_flag else 'no'}"
        )
        self._show_history_for(fp)

    def on_add_files(self):
        if self.is_running:
            messagebox.showinfo("Busy", "Rendering is in progress.")
            return
        fps = filedialog.askopenfilenames(title="Select MP4 videos", filetypes=[("MP4 files", "*.mp4"), ("All files", "*.*")])
        if not fps:
            return
        added = False
        for fp in fps:
            if fp not in self.render_queue:
                self.render_queue.append(fp)
                added = True
        if added:
            self._refresh_queue_ui()
            self.queue_list.selection_clear(0, tk.END)
            self.queue_list.selection_set(tk.END)
            self.queue_list.see(tk.END)
            self._update_selected_file_info(self.render_queue[-1])

    def on_remove_selected(self):
        if self.is_running:
            messagebox.showinfo("Busy", "Rendering is in progress.")
            return
        sel = self.queue_list.curselection()
        if not sel:
            return
        idx = sel[0]
        if 0 <= idx < len(self.render_queue):
            del self.render_queue[idx]
            self._refresh_queue_ui()
            if self.render_queue:
                new_idx = min(idx, len(self.render_queue) - 1)
                self.queue_list.selection_set(new_idx)
                self.queue_list.see(new_idx)
                self._update_selected_file_info(self.render_queue[new_idx])
            else:
                self._update_selected_file_info(None)

    def on_clear_list(self):
        if self.is_running:
            messagebox.showinfo("Busy", "Rendering is in progress.")
            return
        self.render_queue = []
        self._refresh_queue_ui()
        self._update_selected_file_info(None)

    def on_select_queue(self, event=None):
        sel = self.queue_list.curselection()
        if not sel:
            return
        idx = sel[0]
        if 0 <= idx < len(self.render_queue):
            self._update_selected_file_info(self.render_queue[idx])

    def on_select_history(self, event=None):
        sel = self.history_list.curselection()
        if not sel:
            return
        idx = sel[0]
        if hasattr(self, "history_order") and 0 <= idx < len(self.history_order):
            fp = self.history_order[idx]
            self._update_selected_file_info(fp)
            self.notebook.select(0)

    def on_choose_output_dir(self):
        if self.is_running:
            messagebox.showinfo("Busy", "Rendering is in progress.")
            return
        folder = filedialog.askdirectory(title="Select output base folder", initialdir=self.output_base_dir)
        if folder:
            self.output_base_dir = folder
            self.output_label.config(text=self.output_base_dir)

    def on_open_folder(self):
        target = self.last_output_dir or self.output_dir
        if not target or not os.path.isdir(target):
            messagebox.showwarning("Missing", "Output folder not found.")
            return
        try:
            os.startfile(target)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to open folder: {e}")

    def on_start(self):
        if self.is_running:
            messagebox.showinfo("Busy", "Rendering is already running.")
            return
        if not self.render_queue:
            messagebox.showwarning("No files", "Please add at least one video.")
            return

        selected = [q for q in QUALITY_ORDER if self.quality_vars[q].get()]
        if not selected:
            messagebox.showwarning("No quality", "Select at least one quality.")
            return

        # S3 validation (if enabled)
        if self.s3_enabled.get():
            if not _S3_AVAILABLE or not S3Config or not S3Config.is_configured():
                messagebox.showerror("S3", "S3 upload enabled but backend not configured. Set BACKEND_URL and AUTH_TOKEN in .env")
                return
            cid = (self.s3_course_id.get() or "").strip()
            vid = (self.s3_video_name.get() or "").strip()
            lang = (self.s3_language.get() or "").strip()
            if len(cid) != 24 or not re.match(r"^[a-fA-F0-9]{24}$", cid):
                messagebox.showerror("S3", "Course ID must be 24 hex characters (MongoDB ObjectId).")
                return
            if not vid:
                messagebox.showerror("S3", "Video Name is required.")
                return
            if len(vid) > 200:
                messagebox.showerror("S3", "Video Name must be at most 200 characters.")
                return
            if lang not in (S3Config.SUPPORTED_LANGUAGES if S3Config else []):
                messagebox.showerror("S3", f"Language must be one of: {S3Config.SUPPORTED_LANGUAGES if S3Config else []}")
                return

        # Check FFmpeg availability
        is_available, error_msg = check_ffmpeg_available()
        if not is_available:
            messagebox.showerror("FFmpeg Not Found", 
                f"FFmpeg or ffprobe is not available.\n\n{error_msg}\n\n"
                "Please install FFmpeg and ensure it's in your PATH.")
            return

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

        self.current_selected = selected
        self.jobs_total = len(files_to_render)  # Use files_to_render count, not entire queue
        self.jobs_done = 0
        self.last_output_dir = None
        self.is_running = True
        self.start_btn.config(state="disabled")
        self.pick_btn.config(state="disabled")
        self.remove_btn.config(state="disabled")
        self.clear_btn.config(state="disabled")
        self.open_btn.config(state="disabled")
        self.output_label.config(text=self.output_base_dir)
        self._set_status("starting...")

        threading.Thread(target=self._render_worker, args=(files_to_render, selected), daemon=True).start()

    def _finish_success(self, master_path: str):
        for q in self.current_selected:
            self._update_quality_progress(q, 100.0, self.current_selected)
        self._update_overall(100.0)
        self._set_status("done ✅")
        self.is_running = False
        self.start_btn.config(state="normal")
        self.pick_btn.config(state="normal")
        self.remove_btn.config(state="normal")
        self.clear_btn.config(state="normal")
        self.open_btn.config(state="normal")
        messagebox.showinfo("Success", f"HLS generated!\n\nFolder:\n{self.output_dir}\n\nMaster:\n{master_path}")

    def _finish_with_error(self, msg: str):
        self._set_status("failed ❌")
        self.is_running = False
        self.start_btn.config(state="normal")
        self.pick_btn.config(state="normal")
        self.remove_btn.config(state="normal")
        self.clear_btn.config(state="normal")
        self.open_btn.config(state="disabled")
        messagebox.showerror("Error", msg)

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
                    if transcript_paths.get("vtt"):
                        msg += f"  VTT: {transcript_paths['vtt']}\n"
                    if transcript_paths.get("txt"):
                        msg += f"  TXT: {transcript_paths['txt']}\n"
                    if transcript_paths.get("json"):
                        msg += f"  JSON: {transcript_paths['json']}\n"
                    if last_result.get("subtitle_playlist_path"):
                        msg += f"\nSubtitle playlist (HLS):\n  {last_result['subtitle_playlist_path']}"
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

    def _render_single_quality(self, quality: str, total_s: float, selected):
        qdir = os.path.join(self.output_dir, quality)
        if os.path.isdir(qdir):
            try:
                shutil.rmtree(qdir)
            except Exception:
                pass
        os.makedirs(qdir, exist_ok=True)

        prof = QUALITY_PROFILES[quality]
        w, h = prof["w"], prof["h"]

        display = self.encoder_var.get()
        encoder_key = next((k for k, v in self.encoder_display.items() if v == display), "cpu")

        scale_pad_vf = f"scale=w={w}:h={h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2"
        video_args = build_video_encode_args(encoder_key, prof)

        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "warning",
            "-nostdin",
            "-stats",
            "-y", "-i", self.file_path,
            "-vf", scale_pad_vf,
        ] + video_args

        if self.audio_exists:
            cmd += ["-c:a", "aac", "-b:a", "128k", "-ac", "2"]

        cmd += [
            "-f", "hls",
            "-hls_time", "6",
            "-hls_playlist_type", "vod",
            "-hls_list_size", "0",
            "-hls_segment_filename", os.path.join(qdir, "seg_%03d.ts"),
            os.path.join(qdir, "index.m3u8"),
        ]

        creationflags, startupinfo = windows_no_window_flags()

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True,
                creationflags=creationflags,
                startupinfo=startupinfo
            )
        except Exception as e:
            err = f"Failed to start ffmpeg for {quality}: {e}"
            if encoder_key != "cpu":
                err += "\n\nTry CPU encoder or install FFmpeg with GPU support (--enable-amf / --enable-nvenc / --enable-libmfx)."
            return False, err

        out_q = queue.Queue()
        err_q = queue.Queue()

        t_out = threading.Thread(target=_drain_stream_to_queue, args=(proc.stdout, out_q), daemon=True)
        t_err = threading.Thread(target=_drain_stream_to_queue, args=(proc.stderr, err_q), daemon=True)
        t_out.start()
        t_err.start()

        last_percent = 0.0
        last_activity = time.time()
        stderr_lines = []

        while True:
            got_any = False
            try:
                while True:
                    e = err_q.get_nowait()
                    got_any = True
                    stderr_lines.append(e)
                    last_activity = time.time()

                    cur_s = parse_stats_time_to_seconds(e)
                    if cur_s is not None:
                        percent = min(max((cur_s / total_s) * 100.0, 0.0), 100.0)
                        if percent >= last_percent + 0.2:
                            last_percent = percent
                            self.root.after(0, lambda p=percent: self._update_quality_progress(quality, p, selected))
            except queue.Empty:
                pass

            try:
                while True:
                    _ = out_q.get_nowait()
                    got_any = True
                    last_activity = time.time()
            except queue.Empty:
                pass

            code = proc.poll()
            if code is not None:
                break

            if time.time() - last_activity > 30:
                log_path = write_log(self.output_dir, f"ffmpeg_error_{quality}.log", "".join(stderr_lines))
                try:
                    proc.kill()
                    # Wait a bit for process to terminate
                    try:
                        proc.wait(timeout=5)
                    except (subprocess.TimeoutExpired, AttributeError):
                        # timeout parameter not available in older Python versions
                        pass
                except Exception:
                    pass
                error_msg = (
                    f"FFmpeg appears stuck while rendering {quality} (no output for 30s).\n\n"
                    f"Partial log saved:\n{log_path}"
                )
                self.root.after(0, lambda msg=error_msg: self._finish_with_error(msg))
                return False, None

            time.sleep(0.05)

        proc.wait()

        stderr_text = "".join(stderr_lines)

        if proc.returncode != 0:
            log_path = write_log(self.output_dir, f"ffmpeg_error_{quality}.log", stderr_text)
            err = f"FFmpeg failed for {quality}.\n\nError log:\n{log_path}"
            if encoder_key != "cpu":
                err += "\n\nTry CPU encoder or install FFmpeg with GPU support (--enable-amf / --enable-nvenc / --enable-libmfx)."
            return False, err

        self.root.after(0, lambda: self._update_quality_progress(quality, 100.0, selected))
        return True, None

    def _render_worker(self, files, selected):
        self.root.after(0, lambda: self._reset_progress(reset_overall=True))
        self.root.after(0, lambda: self._set_status("rendering queue..."))
        self._log(f"Render started: {len(files)} file(s), qualities: {selected}")
        safe_mkdir(self.output_base_dir)

        queue_results = []  # Local list to track results
        master_path = None  # Track last successful master path
        
        for idx, fp in enumerate(files, 1):
            file_result = {
                "file": fp,
                "status": "failed",  # Default to failed, set to success if completes
                "output_dir": None,
                "error": None,
                "master_path": None,
                "transcript_path": None,  # Path to SRT file if transcription succeeded (backward compatibility)
                "transcript_paths": None,  # Dict with "srt", "txt", "json" paths if transcription succeeded
                "subtitle_playlist_path": None,  # Path to HLS subtitle playlist (.m3u8) if created
                "transcript_error": None  # Error message if transcription failed
            }
            
            try:
                # Validate file exists (re-check in case deleted)
                if not os.path.isfile(fp):
                    self._log(f"File missing: {fp}", is_error=True)
                    file_result["error"] = f"File missing: {fp}"
                    queue_results.append(file_result.copy())  # Append copy to avoid reference issues
                    self.root.after(0, lambda idx=idx, total=len(files), fp=fp: self._set_status(f"Failed {idx}/{total}: {os.path.basename(fp)} - file missing"))
                    self.jobs_done = idx
                    # Update overall progress for failed file
                    if self.jobs_total > 0:
                        queue_percent = (self.jobs_done / self.jobs_total) * 100.0
                        self.root.after(0, lambda p=queue_percent: self._update_overall(p))
                    continue
                
                # Set up file processing
                self.file_path = fp
                base_name = sanitize_folder_name(os.path.splitext(os.path.basename(fp))[0])
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
                self._log(f"File {idx}/{len(files)}: {base_name} — encoding {selected}...")
                
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
                    self._log(f"Encoding failed: {render_error}", is_error=True)
                    file_result["error"] = render_error
                    queue_results.append(file_result.copy())  # Append copy to avoid reference issues
                    self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Failed {idx}/{total}: {name}"))
                    self.jobs_done = idx
                    # Update overall progress for failed file
                    if self.jobs_total > 0:
                        queue_percent = (self.jobs_done / self.jobs_total) * 100.0
                        self.root.after(0, lambda p=queue_percent: self._update_overall(p))
                    continue
                
                # Create initial master playlist (without subtitles)
                try:
                    master_path = add_master_playlist(self.output_dir, selected, self.audio_exists)
                    file_result["master_path"] = master_path
                except Exception as e:
                    self._log(f"Master playlist write failed: {e}", is_error=True)
                    file_result["error"] = f"Master playlist write failed: {e}"
                    queue_results.append(file_result.copy())  # Append copy to avoid reference issues
                    self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Failed {idx}/{total}: {name} - playlist error"))
                    self.jobs_done = idx
                    if self.jobs_total > 0:
                        queue_percent = (self.jobs_done / self.jobs_total) * 100.0
                        self.root.after(0, lambda p=queue_percent: self._update_overall(p))
                    continue
                
                # Transcription (if enabled and audio exists)
                transcript_paths = {}  # Dict: {"srt": path, "txt": path, "json": path}
                subtitle_playlist_path = None
                trans_success = False
                trans_result = {}
                detected_lang = None
                language = None

                if self.transcribe_enabled.get() and self.audio_exists:
                    try:
                        self.root.after(0, lambda: self._set_transcript_progress("running"))
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
                                    "vtt": trans_result.get("vtt_path"),
                                    "txt": trans_result.get("txt_path"),
                                    "json": trans_result.get("json_path")
                                }
                                file_result["transcript_path"] = transcript_paths.get("srt")  # Keep for backward compatibility
                                file_result["transcript_paths"] = transcript_paths
                                
                                # Get detected language (normalize to lowercase for consistency)
                                detected_lang = trans_result.get("detected_language", language if language != "auto" else "en")
                                detected_lang = detected_lang.lower() if detected_lang else "en"
                                
                                # Create HLS subtitle playlist: use VTT so players show captions (HLS expects WebVTT)
                                subtitle_file = transcript_paths.get("vtt") or transcript_paths.get("srt")
                                if subtitle_file and os.path.exists(subtitle_file):
                                    try:
                                        subtitle_playlist_path = create_subtitle_playlist(
                                            self.output_dir,
                                            subtitle_file,
                                            detected_lang
                                        )
                                        file_result["subtitle_playlist_path"] = subtitle_playlist_path
                                    except Exception as e:
                                        # Subtitle playlist creation failed - log but don't fail
                                        file_result["transcript_error"] = f"Subtitle playlist creation failed: {str(e)}"
                                else:
                                    file_result["transcript_error"] = "Subtitle file (VTT/SRT) not found after transcription"
                                
                                self.root.after(0, lambda: self._set_transcript_progress("done"))
                                self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Transcribed {idx}/{total}: {name}"))
                                self._log("Transcription done.")
                            else:
                                # Transcription failed but don't fail the whole render
                                self.root.after(0, lambda: self._set_transcript_progress("idle"))
                                self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Transcription warning {idx}/{total}: {name}"))
                                file_result["transcript_error"] = trans_error
                            
                            # Clean up temp audio file
                            try:
                                if os.path.exists(temp_audio):
                                    os.remove(temp_audio)
                            except Exception:
                                pass
                        else:
                            self.root.after(0, lambda: self._set_transcript_progress("idle"))
                            file_result["transcript_error"] = f"Audio extraction failed: {error_msg}"
                    except Exception as e:
                        # Transcription error - don't fail the render, just log it
                        self.root.after(0, lambda: self._set_transcript_progress("idle"))
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
                
                # Success - save to history and update result
                file_result["status"] = "success"
                file_result["output_dir"] = self.output_dir
                file_result["master_path"] = master_path
                
                # Perform all operations that might fail before appending
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
                save_history(self.history)
                self.root.after(0, self._refresh_history_ui)
                self.last_output_dir = self.output_dir

                # S3 upload phase (if enabled)
                if self.s3_enabled.get() and _S3_AVAILABLE and S3Config and S3Config.is_configured():
                    cid = (self.s3_course_id.get() or "").strip()
                    vid_display = (self.s3_video_name.get() or "").strip()
                    lang = (self.s3_language.get() or "en").strip()
                    s3_video_name = sanitize_folder_name(vid_display)
                    s3_prefix = f"courses/{cid}/{lang}/{s3_video_name}"
                    self.s3_upload_cancel = False
                    self.root.after(0, lambda: self.s3_cancel_btn.config(state="normal"))
                    self.root.after(0, lambda: self.upload_bar.config(value=0))
                    self.root.after(0, lambda: self.upload_label.config(text="0%"))
                    if self.jobs_total > 0:
                        self.root.after(0, lambda: self._update_overall((self.jobs_done + 0.75) / self.jobs_total * 100.0))
                    try:
                        self._log("S3 upload starting...")
                        mgr = S3UploadManager()
                        total_files = sum(1 for _ in Path(self.output_dir).rglob("*") if _.is_file())
                        self._log(f"Uploading {total_files} files to S3 prefix: {s3_prefix}")
                        def on_progress(current, total, name):
                            pct_bar = (current / total * 100.0) if total else 0.0
                            jobs_done = self.jobs_done
                            jobs_total = self.jobs_total
                            p = 0.75 + 0.20 * (current / total) if total else 0.75
                            overall_pct = (jobs_done + p) / jobs_total * 100.0 if jobs_total > 0 else 0.0
                            def _update():
                                self.upload_bar["value"] = pct_bar
                                self.upload_label.config(text=f"{current}/{total}")
                                self.upload_status_label.config(text=f"Uploading {name[:40]}..." if len(name) > 40 else f"Uploading {name}")
                                if jobs_total > 0:
                                    self._update_overall(overall_pct)
                                self.root.update_idletasks()
                            self.root.after(0, _update)
                            self._log(f"Uploaded {current}/{total}: {name}")
                        def cancel_check():
                            return self.s3_upload_cancel
                        uploaded = mgr.upload_directory(
                            self.output_dir,
                            s3_prefix,
                            cancel_check=cancel_check,
                            progress_callback=on_progress,
                        )
                        if self.s3_upload_cancel:
                            self._log("Upload cancelled by user.", is_error=True)
                            self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Cancelled {idx}/{total}: {name} (upload)"))
                            file_result["error"] = "Upload cancelled"
                            queue_results.append(file_result.copy())
                            self.jobs_done = idx
                            if self.jobs_total > 0:
                                self.root.after(0, lambda p=(self.jobs_done / self.jobs_total) * 100.0: self._update_overall(p))
                            self.root.after(0, lambda: self.s3_cancel_btn.config(state="disabled"))
                            self.root.after(0, lambda: self.upload_status_label.config(text=""))
                            continue
                        if self.jobs_total > 0:
                            self.root.after(0, lambda: self._update_overall((self.jobs_done + 0.95) / self.jobs_total * 100.0))
                        # Build s3_keys for File record
                        master_key = None
                        for local_path, s3_key in uploaded:
                            if s3_key.endswith("master.m3u8") or "/master.m3u8" in s3_key.replace("\\", "/"):
                                master_key = s3_key
                                break
                        if not master_key:
                            master_key = f"{s3_prefix}/master.m3u8"
                        qualities_map = {}
                        for local_path, s3_key in uploaded:
                            for q in selected:
                                if f"/{q}/index.m3u8" in s3_key or s3_key.replace("\\", "/").endswith(f"{q}/index.m3u8"):
                                    qualities_map[q] = s3_key
                                    break
                        transcript_map = {}
                        for local_path, s3_key in uploaded:
                            if "_transcript.srt" in s3_key or s3_key.endswith("_transcript.srt"):
                                transcript_map["srt"] = s3_key
                            if "_transcript.vtt" in s3_key or s3_key.endswith("_transcript.vtt"):
                                transcript_map["vtt"] = s3_key
                            if "_transcript.txt" in s3_key or s3_key.endswith("_transcript.txt"):
                                transcript_map["txt"] = s3_key
                            if "_transcript.json" in s3_key or s3_key.endswith("_transcript.json"):
                                transcript_map["json"] = s3_key
                        s3_keys = {"master": master_key or "", "qualities": qualities_map, "transcript": transcript_map}
                        mgr.create_file_record(
                            name=vid_display,
                            course_id=cid,
                            language=lang,
                            s3_keys=s3_keys,
                            duration=self.duration_s,
                            qualities=selected,
                            uploaded_by="python-encoder",
                        )
                        self._log("File record created successfully.")
                        if self.jobs_total > 0:
                            self.root.after(0, lambda: self._update_overall((self.jobs_done + 0.98) / self.jobs_total * 100.0))
                        self._save_s3_config()
                        if self.s3_delete_local.get():
                            try:
                                shutil.rmtree(self.output_dir)
                            except OSError:
                                pass
                    except Exception as s3_err:
                        self._log(f"S3/File record error: {s3_err}", is_error=True)
                        file_result["error"] = f"S3/File record: {s3_err}"
                        queue_results.append(file_result.copy())
                        self.jobs_done = idx
                        self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Failed {idx}/{total}: {name} (upload)"))
                        if self.jobs_total > 0:
                            self.root.after(0, lambda p=(self.jobs_done / self.jobs_total) * 100.0: self._update_overall(p))
                        self.root.after(0, lambda: self.s3_cancel_btn.config(state="disabled"))
                        self.root.after(0, lambda: self.upload_status_label.config(text=""))
                        continue
                    self.root.after(0, lambda: self.s3_cancel_btn.config(state="disabled"))
                    self.root.after(0, lambda: self.upload_bar.config(value=100))
                    self.root.after(0, lambda: self.upload_label.config(text="100%"))
                    self.root.after(0, lambda: self.upload_status_label.config(text=""))
                    self._log("S3 upload complete.")

                self.jobs_done = idx
                self._log(f"Completed {idx}/{len(files)}: {base_name}")
                # Update status and progress
                self.root.after(0, lambda idx=idx, total=len(files), name=base_name: self._set_status(f"Completed {idx}/{total}: {name}"))
                if self.jobs_total > 0:
                    queue_percent = (self.jobs_done / self.jobs_total) * 100.0
                    self.root.after(0, lambda p=queue_percent: self._update_overall(p))
                
                # Append copy only after all operations succeed
                queue_results.append(file_result.copy())  # Append copy to avoid reference issues
                
                # Small delay to show completion status
                time.sleep(0.5)
            
            except Exception as e:
                # Catch any unexpected exceptions
                if file_result.get("status") != "success":
                    self._log(f"Unexpected error: {e}", is_error=True)
                    file_result["error"] = f"Unexpected error: {str(e)}"
                    queue_results.append(file_result.copy())  # Append copy to avoid reference issues
                    self.root.after(0, lambda idx=idx, total=len(files), fp=fp: self._set_status(f"Failed {idx}/{total}: {os.path.basename(fp)} - error"))
                else:
                    # File was successfully rendered and appended, but exception occurred in post-processing
                    # Don't add duplicate entry - the success entry is already in queue_results
                    # Just log the error but don't create a new entry
                    self.root.after(0, lambda idx=idx, total=len(files), fp=fp: self._set_status(f"Completed {idx}/{total}: {os.path.basename(fp)} (post-processing warning)"))
                
                self.jobs_done = idx
                if self.jobs_total > 0:
                    queue_percent = (self.jobs_done / self.jobs_total) * 100.0
                    self.root.after(0, lambda p=queue_percent: self._update_overall(p))
                continue

        # After loop completes, call finish method
        self.root.after(0, lambda results=queue_results: self._finish_queue_complete(results))

# ----------------------------
# Main
# ----------------------------
def main():
    root = tk.Tk()
    RetroHlsApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
