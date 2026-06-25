from folder_builder import ensure_folder_structure

CIDS = ["699d28a50692dfb70e5c7e65", "69999fdfe8021e540b7ad59b"]


def test_creates_course_and_lang_folders(tmp_path):
    res = ensure_folder_structure(str(tmp_path), CIDS, ["hi", "ur"])
    for cid in CIDS:
        for lang in ["hi", "ur"]:
            assert (tmp_path / cid / lang).is_dir()
    assert len(res["created"]) == 4
    assert res["existing"] == []


def test_idempotent_skips_existing(tmp_path):
    ensure_folder_structure(str(tmp_path), CIDS, ["hi"])
    res = ensure_folder_structure(str(tmp_path), CIDS, ["hi"])
    assert res["created"] == []
    assert len(res["existing"]) == 2


def test_adds_only_missing(tmp_path):
    (tmp_path / CIDS[0] / "hi").mkdir(parents=True)
    res = ensure_folder_structure(str(tmp_path), CIDS, ["hi"])
    assert f"{CIDS[0]}/hi" in res["existing"]
    assert f"{CIDS[1]}/hi" in res["created"]
    assert len(res["created"]) == 1
    assert len(res["existing"]) == 1


def test_no_languages_creates_course_folders(tmp_path):
    res = ensure_folder_structure(str(tmp_path), CIDS, [])
    for cid in CIDS:
        assert (tmp_path / cid).is_dir()
    assert len(res["created"]) == 2
    assert res["existing"] == []
