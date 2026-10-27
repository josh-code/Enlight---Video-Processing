import os

from hls_output import has_required_qualities

REQUIRED = ["1080p", "720p", "480p"]


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
