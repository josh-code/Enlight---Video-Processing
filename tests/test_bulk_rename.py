import os
import pytest
from bulk_rename import compute_new_name


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
