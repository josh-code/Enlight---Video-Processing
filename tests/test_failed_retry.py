import os

from failed_retry import find_failed_videos, restore_failed_video, FailedVideo

VALID_ID = "a" * 24


def _make_failed(tmp_path, name="video.mp4", with_error=True):
    failed_dir = tmp_path / VALID_ID / "hi" / "_failed"
    failed_dir.mkdir(parents=True)
    vid = failed_dir / name
    vid.write_text("data")
    if with_error:
        (failed_dir / (os.path.splitext(name)[0] + ".error.txt")).write_text("boom")
    return vid


def test_find_returns_failed_video_with_restore_path(tmp_path):
    vid = _make_failed(tmp_path)
    found = find_failed_videos(str(tmp_path))
    assert len(found) == 1
    assert found[0].failed_path == str(vid)
    assert found[0].restore_path == str(tmp_path / VALID_ID / "hi" / "video.mp4")


def test_find_ignores_error_txt_and_non_videos(tmp_path):
    failed_dir = tmp_path / VALID_ID / "hi" / "_failed"
    failed_dir.mkdir(parents=True)
    (failed_dir / "note.txt").write_text("x")
    (failed_dir / "clip.error.txt").write_text("x")
    assert find_failed_videos(str(tmp_path)) == []


def test_find_ignores_videos_not_in_failed(tmp_path):
    d = tmp_path / VALID_ID / "hi"
    d.mkdir(parents=True)
    (d / "normal.mp4").write_text("x")
    assert find_failed_videos(str(tmp_path)) == []


def test_find_missing_root(tmp_path):
    assert find_failed_videos(str(tmp_path / "nope")) == []


def test_restore_moves_file_and_deletes_error(tmp_path):
    vid = _make_failed(tmp_path)
    err = vid.parent / "video.error.txt"
    dest = restore_failed_video(str(vid))
    assert dest == str(tmp_path / VALID_ID / "hi" / "video.mp4")
    assert os.path.isfile(dest)
    assert not vid.exists()            # moved out of _failed
    assert not err.exists()            # error file removed


def test_restore_skips_when_dest_exists(tmp_path):
    vid = _make_failed(tmp_path, with_error=False)
    # A current video already occupies the restore target.
    existing = tmp_path / VALID_ID / "hi" / "video.mp4"
    existing.write_text("current")
    assert restore_failed_video(str(vid)) is None
    assert vid.exists()                # left in place, not clobbered
    assert existing.read_text() == "current"


def test_restore_missing_source(tmp_path):
    assert restore_failed_video(str(tmp_path / "ghost.mp4")) is None
