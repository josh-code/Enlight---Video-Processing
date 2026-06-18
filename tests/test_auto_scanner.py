import os
from pathlib import Path
from auto_scanner import (
    FAILED_DIR_NAME,
    VideoCandidate,
    is_valid_course_id,
    is_stable,
    scan_root,
    move_to_failed,
)

VALID_ID = "699d28a50692dfb70e5c7e65"
SUPPORTED = ["hi", "en", "ur"]


def _make_video(root: Path, course: str, lang: str, name: str, old=True):
    d = root / course / lang
    d.mkdir(parents=True, exist_ok=True)
    f = d / name
    f.write_bytes(b"x")
    if old:
        old_ts = os.path.getmtime(f) - 3600
        os.utime(f, (old_ts, old_ts))
    return f


def test_is_valid_course_id():
    assert is_valid_course_id(VALID_ID) is True
    assert is_valid_course_id("not-an-id") is False
    assert is_valid_course_id("") is False


def test_is_stable_true_for_old_file(tmp_path):
    f = tmp_path / "a.mp4"
    f.write_bytes(b"x")
    old_ts = os.path.getmtime(f) - 100
    os.utime(f, (old_ts, old_ts))
    assert is_stable(str(f), now_ts=os.path.getmtime(f) + 100, min_age_s=15) is True


def test_is_stable_false_for_fresh_file(tmp_path):
    f = tmp_path / "a.mp4"
    f.write_bytes(b"x")
    mtime = os.path.getmtime(f)
    assert is_stable(str(f), now_ts=mtime + 1, min_age_s=15) is False


def test_scan_returns_valid_candidate(tmp_path):
    f = _make_video(tmp_path, VALID_ID, "hi", "lec1.mp4")
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert len(cands) == 1
    c = cands[0]
    assert c.valid is True
    assert c.course_id == VALID_ID
    assert c.language == "hi"


def test_scan_flags_invalid_course_id(tmp_path):
    f = _make_video(tmp_path, "bad-course", "hi", "lec1.mp4")
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert len(cands) == 1
    assert cands[0].valid is False
    assert "courseId" in cands[0].reason


def test_scan_flags_unsupported_language(tmp_path):
    f = _make_video(tmp_path, VALID_ID, "zz", "lec1.mp4")
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert cands[0].valid is False
    assert "language" in cands[0].reason.lower()


def test_scan_skips_failed_dir(tmp_path):
    d = tmp_path / VALID_ID / "hi" / FAILED_DIR_NAME
    d.mkdir(parents=True)
    f = d / "broken.mp4"
    f.write_bytes(b"x")
    old_ts = os.path.getmtime(f) - 3600
    os.utime(f, (old_ts, old_ts))
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert cands == []


def test_scan_skips_fresh_file(tmp_path):
    f = _make_video(tmp_path, VALID_ID, "hi", "lec1.mp4", old=False)
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 1)
    assert cands == []


def test_scan_ignores_non_video(tmp_path):
    d = tmp_path / VALID_ID / "hi"
    d.mkdir(parents=True)
    (d / "notes.txt").write_text("hi", encoding="utf-8")
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=9_999_999_999)
    assert cands == []


def test_scan_flags_wrong_depth(tmp_path):
    # video directly under courseId (missing language folder)
    d = tmp_path / VALID_ID
    d.mkdir(parents=True)
    f = d / "lec1.mp4"
    f.write_bytes(b"x")
    old_ts = os.path.getmtime(f) - 3600
    os.utime(f, (old_ts, old_ts))
    cands = scan_root(str(tmp_path), SUPPORTED, now_ts=os.path.getmtime(f) + 100)
    assert len(cands) == 1
    assert cands[0].valid is False
    assert cands[0].reason is not None


def test_move_to_failed(tmp_path):
    f = _make_video(tmp_path, VALID_ID, "hi", "lec1.mp4")
    dest = move_to_failed(str(f), "Encode failed", "2026-06-18_142305")
    assert os.path.isfile(dest)
    assert FAILED_DIR_NAME in dest
    assert not os.path.isfile(str(f))
    err = Path(dest).parent / (Path(dest).stem + ".error.txt")
    assert err.is_file()
    assert "Encode failed" in err.read_text(encoding="utf-8")


def test_move_to_failed_handles_repeat_collision(tmp_path):
    f1 = _make_video(tmp_path, VALID_ID, "hi", "lec1.mp4")
    d1 = move_to_failed(str(f1), "first", "2026-06-18_142305")
    f2 = _make_video(tmp_path, VALID_ID, "hi", "lec1.mp4")
    d2 = move_to_failed(str(f2), "second", "2026-06-18_142305")
    assert d1 != d2
    assert os.path.isfile(d1)
    assert os.path.isfile(d2)
