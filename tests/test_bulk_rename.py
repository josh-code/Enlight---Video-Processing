import os
import pytest
from bulk_rename import compute_new_name, plan_renames


def test_prefix_and_suffix_before_extension():
    assert compute_new_name("video.mp4", "intro_", "_en") == "intro_video_en.mp4"


def test_prefix_only():
    assert compute_new_name("video.mp4", "intro_", "") == "intro_video.mp4"


def test_suffix_only():
    assert compute_new_name("video.mp4", "", "_en") == "video_en.mp4"


def test_no_extension_appends_suffix():
    assert compute_new_name("README", "x_", "_en") == "x_README_en"


def test_double_extension_uses_last_ext():
    # os.path.splitext treats only the final extension as the ext.
    assert compute_new_name("archive.tar.gz", "", "_bak") == "archive.tar_bak.gz"


def test_dotfile_ext_is_empty():
    # os.path.splitext(".env") -> (".env", ""); suffix appends to the end.
    assert compute_new_name(".env", "x_", "_y") == "x_.env_y"


def test_empty_affixes_identity():
    assert compute_new_name("video.mp4", "", "") == "video.mp4"


def _status_for(plan, old):
    return next(e["status"] for e in plan if e["old"] == old)


def test_plan_skips_subdirectories(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "nested.mp4").write_text("x")
    plan = plan_renames(str(tmp_path), "p_", "")
    olds = {e["old"] for e in plan}
    assert olds == {"a.mp4"}  # subdir and its contents excluded


def test_plan_marks_unchanged_for_empty_affixes(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    plan = plan_renames(str(tmp_path), "", "")
    assert _status_for(plan, "a.mp4") == "unchanged"


def test_plan_normal_rename(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    plan = plan_renames(str(tmp_path), "p_", "_s")
    entry = plan[0]
    assert entry["old"] == "a.mp4"
    assert entry["new"] == "p_a_s.mp4"
    assert entry["status"] == "rename"


def test_plan_collision_when_target_exists(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    (tmp_path / "p_a.mp4").write_text("y")  # target already present
    plan = plan_renames(str(tmp_path), "p_", "")
    assert _status_for(plan, "a.mp4") == "collision"
