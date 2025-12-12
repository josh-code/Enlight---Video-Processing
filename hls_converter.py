import os
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox
from tkinter import ttk
import queue
import time
import re

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

# ----------------------------
# Helpers
# ----------------------------
def run_cmd(cmd):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

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

# ----------------------------
# UI App
# ----------------------------
class RetroHlsApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("Enlight — Retro HLS Renderer")
        self.root.configure(bg=RETRO_BG)
        self.root.resizable(False, False)

        self.file_path = None
        self.output_dir = None
        self.duration_s = 0.0
        self.audio_exists = False
        self.is_running = False
        self.per_quality_progress = {}
        self.current_selected = []

        self.quality_vars = {
            "1080p": tk.BooleanVar(value=False),
            "720p": tk.BooleanVar(value=True),
            "480p": tk.BooleanVar(value=True),
            "360p": tk.BooleanVar(value=False),
        }

        self._build_ui()

    def _build_ui(self):
        header = tk.Frame(self.root, bg=RETRO_BG)
        header.pack(fill="x", padx=12, pady=(12, 6))

        tk.Label(header, text="ENLIGHT — HLS RENDERER", fg=RETRO_ACCENT, bg=RETRO_BG, font=FONT_TITLE).pack(anchor="w")
        tk.Label(header, text="MP4 → Adaptive HLS (Retro mode)", fg=RETRO_MUTED, bg=RETRO_BG, font=FONT_SMALL).pack(anchor="w", pady=(2, 0))

        file_panel = tk.Frame(self.root, bg=RETRO_PANEL, bd=1, relief="solid")
        file_panel.pack(fill="x", padx=12, pady=8)

        tk.Label(file_panel, text="SELECTED VIDEO", fg=RETRO_FG, bg=RETRO_PANEL, font=FONT_MAIN).pack(anchor="w", padx=10, pady=(8, 2))
        self.file_label = tk.Label(file_panel, text="(none)", fg=RETRO_ACCENT, bg=RETRO_PANEL, font=FONT_SMALL, wraplength=520, justify="left")
        self.file_label.pack(anchor="w", padx=10)

        self.meta_label = tk.Label(file_panel, text="Duration: - | Resolution: - | Audio: -", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL)
        self.meta_label.pack(anchor="w", padx=10, pady=(4, 8))

        btn_row = tk.Frame(file_panel, bg=RETRO_PANEL)
        btn_row.pack(fill="x", padx=10, pady=(0, 10))

        self.pick_btn = tk.Button(btn_row, text="CHOOSE MP4", command=self.on_choose_file,
                                  bg=RETRO_ACCENT, fg="black", font=FONT_MAIN, bd=0, padx=12, pady=6)
        self.pick_btn.pack(side="left")

        q_panel = tk.Frame(self.root, bg=RETRO_PANEL, bd=1, relief="solid")
        q_panel.pack(fill="x", padx=12, pady=8)

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
            .pack(anchor="w", padx=10, pady=(0, 10))

        p_panel = tk.Frame(self.root, bg=RETRO_PANEL, bd=1, relief="solid")
        p_panel.pack(fill="x", padx=12, pady=8)

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
        self.overall_bar = ttk.Progressbar(p_panel, length=520, mode="determinate", style="Retro.Horizontal.TProgressbar")
        self.overall_bar.pack(anchor="w", padx=10, pady=(0, 10))

        self.per_quality_bars = {}
        self.per_quality_labels = {}
        for q in QUALITY_ORDER:
            row = tk.Frame(p_panel, bg=RETRO_PANEL)
            row.pack(fill="x", padx=10, pady=(0, 6))

            tk.Label(row, text=q, fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=8, anchor="w").pack(side="left")
            bar = ttk.Progressbar(row, length=440, mode="determinate", style="Retro.Horizontal.TProgressbar")
            bar.pack(side="left", padx=(6, 0))
            pct = tk.Label(row, text="0%", fg=RETRO_MUTED, bg=RETRO_PANEL, font=FONT_SMALL, width=6, anchor="e")
            pct.pack(side="right")

            self.per_quality_bars[q] = bar
            self.per_quality_labels[q] = pct

        a_panel = tk.Frame(self.root, bg=RETRO_BG)
        a_panel.pack(fill="x", padx=12, pady=(6, 12))

        self.start_btn = tk.Button(a_panel, text="START RENDER", command=self.on_start,
                                   bg=RETRO_FG, fg="black", font=FONT_MAIN, bd=0, padx=16, pady=8)
        self.start_btn.pack(side="left")

        self.open_btn = tk.Button(a_panel, text="OPEN HLS FOLDER", command=self.on_open_folder,
                                  bg=RETRO_ACCENT, fg="black", font=FONT_MAIN, bd=0, padx=12, pady=8, state="disabled")
        self.open_btn.pack(side="left", padx=(10, 0))

        tk.Button(a_panel, text="QUIT", command=self.root.destroy,
                  bg="#333333", fg=RETRO_ACCENT, font=FONT_MAIN, bd=0, padx=12, pady=8).pack(side="right")

    def _set_status(self, text: str):
        self.status_label.config(text=f"Status: {text}")

    def _reset_progress(self):
        self.per_quality_progress = {}
        self.overall_bar["value"] = 0
        for q in QUALITY_ORDER:
            self.per_quality_bars[q]["value"] = 0
            self.per_quality_labels[q].config(text="0%")

    def _update_overall(self, percent: float):
        self.overall_bar["value"] = percent

    def _update_quality_progress(self, quality: str, percent: float, selected):
        self.per_quality_progress[quality] = percent
        if quality in self.per_quality_bars:
            self.per_quality_bars[quality]["value"] = percent
        if quality in self.per_quality_labels:
            self.per_quality_labels[quality].config(text=f"{int(percent)}%")

        if selected:
            avg = sum(self.per_quality_progress.get(q, 0.0) for q in selected) / len(selected)
            self._update_overall(avg)

    def on_choose_file(self):
        if self.is_running:
            messagebox.showinfo("Busy", "Rendering is in progress.")
            return

        fp = filedialog.askopenfilename(title="Select MP4 video", filetypes=[("MP4 files", "*.mp4"), ("All files", "*.*")])
        if not fp:
            return

        self.file_path = fp
        self.output_dir = os.path.splitext(fp)[0] + "_hls"
        safe_mkdir(self.output_dir)

        info = get_video_info(fp)
        self.duration_s = float(info.get("duration_s", 0.0) or 0.0)
        self.audio_exists = has_audio_stream(fp)

        self.file_label.config(text=self.file_path)
        self.meta_label.config(
            text=f"Duration: {format_seconds(self.duration_s)} | "
                 f"Resolution: {info.get('width',0)}x{info.get('height',0)} | "
                 f"Audio: {'yes' if self.audio_exists else 'no'}"
        )

        self._reset_progress()
        self.open_btn.config(state="disabled")
        self._set_status("idle (ready)")

    def on_open_folder(self):
        if not self.output_dir or not os.path.isdir(self.output_dir):
            messagebox.showwarning("Missing", "Output folder not found.")
            return
        os.startfile(self.output_dir)

    def on_start(self):
        if self.is_running:
            messagebox.showinfo("Busy", "Rendering is already running.")
            return
        if not self.file_path:
            messagebox.showwarning("No file", "Please choose a video first.")
            return

        selected = [q for q in QUALITY_ORDER if self.quality_vars[q].get()]
        if not selected:
            messagebox.showwarning("No quality", "Select at least one quality.")
            return

        self.current_selected = selected

        self.is_running = True
        self.start_btn.config(state="disabled")
        self.pick_btn.config(state="disabled")
        self.open_btn.config(state="disabled")
        self._set_status("starting...")

        threading.Thread(target=self._render_worker, args=(selected,), daemon=True).start()

    def _finish_success(self, master_path: str):
        for q in self.current_selected:
            self._update_quality_progress(q, 100.0, self.current_selected)
        self._update_overall(100.0)
        self._set_status("done ✅")
        self.is_running = False
        self.start_btn.config(state="normal")
        self.pick_btn.config(state="normal")
        self.open_btn.config(state="normal")
        messagebox.showinfo("Success", f"HLS generated!\n\nFolder:\n{self.output_dir}\n\nMaster:\n{master_path}")

    def _finish_with_error(self, msg: str):
        self._set_status("failed ❌")
        self.is_running = False
        self.start_btn.config(state="normal")
        self.pick_btn.config(state="normal")
        self.open_btn.config(state="disabled")
        messagebox.showerror("Error", msg)

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

        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "warning",
            "-nostdin",
            "-stats",
            "-y", "-i", self.file_path,
            "-vf", f"scale=w={w}:h={h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
            "-c:v", "libx264", "-profile:v", "main", "-crf", "20", "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
            "-b:v", prof["b"], "-maxrate", prof["maxrate"], "-bufsize", prof["buf"],
        ]

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
            return False, f"Failed to start ffmpeg for {quality}: {e}"

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
                except Exception:
                    pass
                self.root.after(0, lambda: self._finish_with_error(
                    f"FFmpeg appears stuck while rendering {quality} (no output for 30s).\n\n"
                    f"Partial log saved:\n{log_path}"
                ))
                return False, None

            time.sleep(0.05)

        proc.wait()

        stderr_text = "".join(stderr_lines)

        if proc.returncode != 0:
            log_path = write_log(self.output_dir, f"ffmpeg_error_{quality}.log", stderr_text)
            return False, f"FFmpeg failed for {quality}.\n\nError log:\n{log_path}"

        self.root.after(0, lambda: self._update_quality_progress(quality, 100.0, selected))
        return True, None

    def _render_worker(self, selected):
        self.root.after(0, self._reset_progress)
        self.root.after(0, lambda: self._set_status("rendering..."))

        self.per_quality_progress = {q: 0.0 for q in selected}

        total_s = max(float(self.duration_s), 0.001)

        for idx, q in enumerate(selected, 1):
            self.root.after(0, lambda q=q, idx=idx: self._set_status(f"rendering {q} ({idx}/{len(selected)})"))
            ok, err = self._render_single_quality(q, total_s, selected)
            if not ok:
                if err is None:
                    return
                self.root.after(0, lambda e=err: self._finish_with_error(e))
                return

        try:
            master_path = add_master_playlist(self.output_dir, selected, self.audio_exists)
        except Exception as e:
            self.root.after(0, lambda: self._finish_with_error(f"Master playlist write failed: {e}"))
            return

        self.root.after(0, lambda: self._finish_success(master_path))

# ----------------------------
# Main
# ----------------------------
def main():
    root = tk.Tk()
    RetroHlsApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
