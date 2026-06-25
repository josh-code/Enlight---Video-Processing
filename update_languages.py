r"""Fetch supported languages from the backend and merge them into
transcription_config.json, PRESERVING any existing on/off settings.

Usage:
    python update_languages.py          (or: .\.venv\Scripts\python.exe update_languages.py)

Reads BACKEND_URL / endpoints from .env via config.py. Languages already present
in transcription_config.json keep their exact true/false value; languages newly
returned by the backend are added as false. Nothing is turned on or off
automatically, and existing entries (even ones the backend no longer returns)
are left untouched. The top-level "default" is preserved as-is.
"""
import io
import json
import os
import sys

from config import fetch_supported_languages

CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "transcription_config.json"
)


def load_existing():
    """Return the current config as {"default": bool, "languages": {code: bool}}."""
    if not os.path.isfile(CONFIG_FILE):
        return {"default": False, "languages": {}}
    try:
        with io.open(CONFIG_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"default": False, "languages": {}}
    if not isinstance(data, dict):
        return {"default": False, "languages": {}}
    data.setdefault("default", False)
    if not isinstance(data.get("languages"), dict):
        data["languages"] = {}
    return data


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    langs, _default_code = fetch_supported_languages()
    existing = load_existing()

    # Preserve every existing setting (value AND any extra codes), then add
    # backend languages that aren't present yet as false.
    merged = dict(existing["languages"])
    added = []
    for l in langs:
        code = l["code"]
        if code not in merged:
            merged[code] = False
            added.append(code)

    out = {"default": existing.get("default", False), "languages": merged}
    with io.open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    on = [c for c, v in merged.items() if v]
    print(f"Backend languages: {len(langs)} | total in config: {len(merged)}")
    print(f"Newly added (off): {', '.join(added) if added else '(none)'}")
    print(f"Currently ON:      {', '.join(on) if on else '(none)'}")
    print(f"Wrote {CONFIG_FILE}")


if __name__ == "__main__":
    main()
