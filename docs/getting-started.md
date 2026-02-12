# Getting Started — Enlight Video Processing

How to set up and run the Python HLS encoder on your machine.

## Prerequisites

- **Python 3** (3.8+)
- **FFmpeg** (including `ffprobe`) on your PATH — required for encoding
- (Optional) **Whisper** is installed automatically via `requirements.txt` for transcription

---

## Windows (PowerShell)

1. Open PowerShell and go to the project folder:

   ```powershell
   cd path\to\Enlight---Video-Processing
   ```

2. One-time setup (creates venv, installs dependencies, checks FFmpeg):

   ```powershell
   .\init.ps1
   ```

3. Run the encoder:
   ```powershell
   .\run.ps1
   ```

If FFmpeg is not found, install it and add its `bin` folder to your system PATH (e.g. `C:\ffmpeg\bin`).

---

## macOS / Linux (bash or zsh)

1. Open Terminal and go to the project folder:

   ```bash
   cd /path/to/Enlight---Video-Processing
   ```

2. Create a virtual environment (one-time):

   ```bash
   python3 -m venv .venv
   ```

   If `python3` is not available, try `python`.

3. Activate the virtual environment and install dependencies:

   ```bash
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. Install FFmpeg (required):
   - **macOS (Homebrew):**
     ```bash
     brew install ffmpeg
     ```
   - **Linux (apt):**
     ```bash
     sudo apt update && sudo apt install -y ffmpeg
     ```

5. Run the encoder:
   ```bash
   python hls_converter.py
   ```
   Or without activating the venv first:
   ```bash
   .venv/bin/python hls_converter.py
   ```

---

## Quick reference (macOS / Linux)

| Step           | Command                                  |
| -------------- | ---------------------------------------- |
| Go to project  | `cd /path/to/Enlight---Video-Processing` |
| Create venv    | `python3 -m venv .venv`                  |
| Activate venv  | `source .venv/bin/activate`              |
| Install deps   | `pip install -r requirements.txt`        |
| Install FFmpeg | `brew install ffmpeg` (macOS)            |
| Run app        | `python hls_converter.py`                |

---

## After startup

- The **Enlight — Retro HLS Renderer** GUI window opens.
- Use **Queue** to add MP4 files, choose qualities and encoder, then **START RENDER**.
- Outputs are written under the configured output base (default: `hls_outputs/` in the project folder).
- For S3/backend integration, see [File/Folder System — Python Encoder Integration](file-folder-system/04-python-encoder-integration.md).
