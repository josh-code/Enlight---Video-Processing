import json
from transcription_config import TranscriptionConfig, load_transcription_config


def test_should_transcribe_known_language():
    cfg = TranscriptionConfig(default=False, languages={"hi": True, "en": False})
    assert cfg.should_transcribe("hi") is True
    assert cfg.should_transcribe("en") is False


def test_should_transcribe_unknown_falls_back_to_default():
    cfg = TranscriptionConfig(default=True, languages={"en": False})
    assert cfg.should_transcribe("ur") is True


def test_should_transcribe_is_case_insensitive():
    cfg = TranscriptionConfig(default=False, languages={"hi": True})
    assert cfg.should_transcribe("HI") is True


def test_load_missing_file_returns_default_off(tmp_path):
    cfg = load_transcription_config(str(tmp_path / "nope.json"))
    assert cfg.default is False
    assert cfg.should_transcribe("hi") is False


def test_load_malformed_file_returns_default_off(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{ not json", encoding="utf-8")
    cfg = load_transcription_config(str(p))
    assert cfg.default is False


def test_load_valid_file(tmp_path):
    p = tmp_path / "transcription_config.json"
    p.write_text(json.dumps({"default": False, "languages": {"hi": True, "ur": True}}), encoding="utf-8")
    cfg = load_transcription_config(str(p))
    assert cfg.should_transcribe("hi") is True
    assert cfg.should_transcribe("ur") is True
    assert cfg.should_transcribe("en") is False


def test_summary_mentions_languages():
    cfg = TranscriptionConfig(default=False, languages={"hi": True, "en": False})
    s = cfg.summary()
    assert "hi=on" in s and "en=off" in s
