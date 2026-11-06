import os

from hls_output import has_required_qualities, auto_output_dirname

REQUIRED = ["1080p", "720p", "480p"]


def test_auto_output_dirname_deterministic():
    name = "a really long video filename " * 10
    assert auto_output_dirname("cid", "da", name) == auto_output_dirname("cid", "da", name)


def test_auto_output_dirname_bounded_length():
    # A 300-char source name must not produce a path component near MAX_PATH.
    name = auto_output_dirname("6" * 24, "da", "x" * 300)
    assert len(name) <= 80


def test_auto_output_dirname_distinct_for_distinct_base_same_prefix():
    # Two names sharing the first 30 chars must still map to different dirs
    # (the hash of the full name disambiguates them).
    long1 = "Z" * 40 + "_one"
    long2 = "Z" * 40 + "_two"
    assert auto_output_dirname("cid", "en", long1) != auto_output_dirname("cid", "en", long2)


def test_auto_output_dirname_shape():
    name = auto_output_dirname("CID123", "fr", "video")
    assert name.startswith("CID123_fr_")
    assert name.endswith("_hls")


def _make_output(tmp_path, qualities, with_master=True):
    out = tmp_path / "out_hls"
    out.mkdir()
    if with_master:
        (out / "master.m3u8").write_text("#EXTM3U")
    for q in qualities:
        qd = out / q
        qd.mkdir()
        (qd / "index.m3u8").write_text("#EXTM3U")
    return out


def test_true_when_master_and_all_qualities_present(tmp_path):
    out = _make_output(tmp_path, REQUIRED)
    assert has_required_qualities(str(out), REQUIRED) is True


def test_false_when_master_missing(tmp_path):
    out = _make_output(tmp_path, REQUIRED, with_master=False)
    assert has_required_qualities(str(out), REQUIRED) is False


def test_false_when_a_quality_missing(tmp_path):
    out = _make_output(tmp_path, ["1080p", "720p"])  # missing 480p
    assert has_required_qualities(str(out), REQUIRED) is False


def test_false_when_dir_missing(tmp_path):
    assert has_required_qualities(str(tmp_path / "nope"), REQUIRED) is False


def test_false_when_required_empty(tmp_path):
    out = _make_output(tmp_path, REQUIRED)
    assert has_required_qualities(str(out), []) is False
