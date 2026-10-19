import io
import json

from update_languages import merge_languages, save_config


def test_merge_preserves_existing_values():
    existing = {"en": True, "fr": False}
    backend = [{"code": "en", "name": "English"}, {"code": "fr", "name": "French"}]
    merged, added = merge_languages(existing, backend)
    assert merged == {"en": True, "fr": False}
    assert added == []


def test_merge_adds_new_backend_codes_as_false():
    existing = {"en": True}
    backend = [{"code": "en", "name": "English"}, {"code": "de", "name": "German"}]
    merged, added = merge_languages(existing, backend)
    assert merged == {"en": True, "de": False}
    assert added == ["de"]


def test_merge_keeps_codes_backend_no_longer_returns():
    existing = {"en": True, "xx": True}
    backend = [{"code": "en", "name": "English"}]
    merged, added = merge_languages(existing, backend)
    assert merged == {"en": True, "xx": True}
    assert added == []


def test_merge_empty_inputs():
    merged, added = merge_languages({}, [])
    assert merged == {}
    assert added == []


def test_merge_does_not_mutate_input():
    existing = {"en": True}
    merge_languages(existing, [{"code": "de", "name": "German"}])
    assert existing == {"en": True}  # original untouched


def test_save_config_roundtrips(tmp_path):
    path = str(tmp_path / "cfg.json")
    save_config(True, {"en": True, "fr": False}, path=path)
    with io.open(path, encoding="utf-8") as f:
        text = f.read()
    assert text.endswith("\n")  # trailing newline
    data = json.loads(text)
    assert data == {"default": True, "languages": {"en": True, "fr": False}}


def test_save_config_coerces_default_to_bool(tmp_path):
    path = str(tmp_path / "cfg.json")
    save_config(1, {}, path=path)
    with io.open(path, encoding="utf-8") as f:
        data = json.load(f)
    assert data["default"] is True
