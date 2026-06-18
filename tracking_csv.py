"""Per-run upload tracking CSV for auto-folder mode."""
import csv
import os
from pathlib import Path

TRACKING_COLUMNS = [
    "timestamp",
    "courseId",
    "language",
    "filename",
    "duration_s",
    "transcribed",
    "s3_master_key",
]


def tracking_filename(ts_str: str) -> str:
    return f"upload_tracking_{ts_str}.csv"


def create_tracking_csv(root: str, ts_str: str) -> str:
    path = Path(root) / tracking_filename(ts_str)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=TRACKING_COLUMNS)
        writer.writeheader()
    return str(path)


def append_tracking_row(path: str, row: dict) -> None:
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=TRACKING_COLUMNS)
        writer.writerow({col: row.get(col, "") for col in TRACKING_COLUMNS})


def build_tracking_row(job: dict, master_key: str, now) -> dict:
    return {
        "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
        "courseId": job.get("course_id", ""),
        "language": job.get("language", ""),
        "filename": os.path.basename(job.get("source_path", "") or ""),
        "duration_s": int(round(float(job.get("duration_s", 0) or 0))),
        "transcribed": "yes" if job.get("transcribed") else "no",
        "s3_master_key": master_key or "",
    }
