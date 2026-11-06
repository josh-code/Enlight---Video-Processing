"""Tests for the supported-language-codes robustness fix.

Root cause being fixed: the Auto scanner's language whitelist came solely from a
live backend fetch captured at startup; when the backend was unreachable that
fetch silently fell back to 11 languages, so videos in other languages were
mis-classified and the run found "no videos". The fix unions the live fetch with
the persisted transcription_config.json languages, and surfaces whether the
backend fetch actually succeeded.
"""
import config
from transcription_config import union_supported_codes
from config import fetch_supported_languages, fetch_supported_languages_status


def test_union_merges_and_dedupes():
    assert union_supported_codes(["en", "fr"], ["fr", "da", "th"]) == ["en", "fr", "da", "th"]


def test_union_lowercases_and_strips():
    assert union_supported_codes([" EN ", "Fr"], ["DA"]) == ["en", "fr", "da"]


def test_union_fetched_first_then_config_extras():
    # Order: fetched codes (in order) first, then config-only codes.
    assert union_supported_codes(["en"], ["zu", "en", "am"]) == ["en", "zu", "am"]


def test_union_accepts_dict_for_config_codes():
    # transcription_config languages is a {code: bool} dict; list(dict) -> keys.
    assert union_supported_codes(["en"], {"da": False, "th": True}) == ["en", "da", "th"]


def test_union_empty_inputs():
    assert union_supported_codes([], []) == []
    assert union_supported_codes(None, None) == []


def test_status_reports_not_ok_when_no_backend_url(monkeypatch):
    # With no reachable URL, the status variant must report ok=False and still
    # return the hardcoded fallback list.
    monkeypatch.setattr(config.Config, "BACKEND_URL", "")
    langs, default, ok = fetch_supported_languages_status()
    assert ok is False
    assert default == "en"
    assert langs == config.DEFAULT_SUPPORTED_LANGUAGES
    assert langs is not config.DEFAULT_SUPPORTED_LANGUAGES  # a copy, not the shared list


def test_plain_fetch_still_returns_two_tuple(monkeypatch):
    # Backwards-compatible contract: (languages, default_code), no ok flag.
    monkeypatch.setattr(config.Config, "BACKEND_URL", "")
    result = fetch_supported_languages()
    assert isinstance(result, tuple) and len(result) == 2
    langs, default = result
    assert default == "en"
    assert langs == config.DEFAULT_SUPPORTED_LANGUAGES
