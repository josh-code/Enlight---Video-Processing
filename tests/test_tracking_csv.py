import csv
from datetime import datetime
from tracking_csv import (
    TRACKING_COLUMNS,
    tracking_filename,
    create_tracking_csv,
    append_tracking_row,
    build_tracking_row,
)


def test_tracking_filename_includes_timestamp():
    assert tracking_filename("2026-06-18_142305") == "upload_tracking_2026-06-18_142305.csv"


def test_create_writes_header(tmp_path):
    path = create_tracking_csv(str(tmp_path), "2026-06-18_142305")
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    assert rows[0] == TRACKING_COLUMNS


def test_append_row_roundtrip(tmp_path):
    path = create_tracking_csv(str(tmp_path), "2026-06-18_142305")
    append_tracking_row(path, {
        "timestamp": "2026-06-18 14:23:05",
        "courseId": "699d28a50692dfb70e5c7e65",
        "language": "hi",
        "filename": "lecture1.mp4",
        "duration_s": 642,
        "transcribed": "yes",
        "s3_master_key": "courses/699d/hi/lecture1/master.m3u8",
    })
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert rows[0]["language"] == "hi"
    assert rows[0]["filename"] == "lecture1.mp4"


def test_build_tracking_row_from_job():
    job = {
        "course_id": "699d28a50692dfb70e5c7e65",
        "language": "hi",
        "source_path": "/root/699d28a50692dfb70e5c7e65/hi/lecture1.mp4",
        "duration_s": 642.4,
        "transcribed": True,
    }
    now = datetime(2026, 6, 18, 14, 23, 5)
    row = build_tracking_row(job, "courses/699d/hi/lecture1/master.m3u8", now)
    assert row["timestamp"] == "2026-06-18 14:23:05"
    assert row["courseId"] == "699d28a50692dfb70e5c7e65"
    assert row["filename"] == "lecture1.mp4"
    assert row["duration_s"] == 642
    assert row["transcribed"] == "yes"
    assert row["s3_master_key"] == "courses/699d/hi/lecture1/master.m3u8"


def test_build_tracking_row_not_transcribed():
    job = {"course_id": "c", "language": "en", "source_path": "x/a.mp4", "duration_s": 0, "transcribed": False}
    row = build_tracking_row(job, "k", datetime(2026, 1, 1, 0, 0, 0))
    assert row["transcribed"] == "no"
