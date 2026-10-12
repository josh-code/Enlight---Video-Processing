import os
import pytest
from bulk_rename import compute_new_name, plan_renames, apply_renames


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


def test_apply_renames_basic(tmp_path):
    (tmp_path / "a.mp4").write_text("data")
    plan = plan_renames(str(tmp_path), "p_", "")
    result = apply_renames(str(tmp_path), plan)
    assert ("a.mp4", "p_a.mp4") in result["renamed"]
    assert (tmp_path / "p_a.mp4").read_text() == "data"
    assert not (tmp_path / "a.mp4").exists()


def test_apply_skips_collision_and_unchanged(tmp_path):
    (tmp_path / "a.mp4").write_text("x")
    (tmp_path / "p_a.mp4").write_text("y")  # collision target
    (tmp_path / "b.mp4").write_text("z")
    plan = plan_renames(str(tmp_path), "p_", "")
    result = apply_renames(str(tmp_path), plan)
    skipped_olds = {old for old, _ in result["skipped"]}
    assert "a.mp4" in skipped_olds           # collision skipped
    assert ("p_a.mp4", "p_p_a.mp4") in result["renamed"]  # collision target itself can be renamed
    assert (tmp_path / "p_p_a.mp4").read_text() == "y"  # content preserved in its new location
    assert ("b.mp4", "p_b.mp4") in result["renamed"]


def test_apply_two_phase_swap(tmp_path):
    # Simulate a shift where a planned target equals another planned source.
    # Build the plan manually to force the swap scenario A->B, B->C etc.
    (tmp_path / "1.txt").write_text("one")
    (tmp_path / "2.txt").write_text("two")
    plan = [
        {"old": "1.txt", "new": "2.txt", "status": "rename", "reason": ""},
        {"old": "2.txt", "new": "3.txt", "status": "rename", "reason": ""},
    ]
    result = apply_renames(str(tmp_path), plan)
    assert (tmp_path / "2.txt").read_text() == "one"
    assert (tmp_path / "3.txt").read_text() == "two"
    assert not (tmp_path / "1.txt").exists()
    assert len(result["renamed"]) == 2
    assert result["errors"] == []
