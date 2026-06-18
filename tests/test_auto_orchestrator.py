from auto_orchestrator import run_auto_loop


class FakeCand:
    def __init__(self, valid):
        self.valid = valid


def make_scan(passes):
    """passes: list of lists; each call pops the next pass, then [] forever."""
    state = {"i": 0}

    def scan_fn():
        if state["i"] < len(passes):
            out = passes[state["i"]]
            state["i"] += 1
            return out
        return []
    return scan_fn


def test_stops_on_empty_scan():
    log = []
    summary = run_auto_loop(
        scan_fn=make_scan([]),
        process_fn=lambda c: None,
        move_failed_fn=lambda c: None,
        stop_fn=lambda: False,
        log_fn=log.append,
    )
    assert summary["passes"] == 0
    assert summary["processed"] == 0


def test_processes_then_stops_when_empty():
    processed = []
    summary = run_auto_loop(
        scan_fn=make_scan([[FakeCand(True), FakeCand(True)]]),
        process_fn=processed.append,
        move_failed_fn=lambda c: None,
        stop_fn=lambda: False,
        log_fn=lambda m: None,
    )
    assert len(processed) == 2
    assert summary["processed"] == 2
    assert summary["passes"] == 1


def test_invalid_candidate_is_moved_not_processed():
    processed, moved = [], []
    summary = run_auto_loop(
        scan_fn=make_scan([[FakeCand(False), FakeCand(True)]]),
        process_fn=processed.append,
        move_failed_fn=moved.append,
        stop_fn=lambda: False,
        log_fn=lambda m: None,
    )
    assert len(processed) == 1
    assert len(moved) == 1
    assert summary["failed"] == 1


def test_rescans_to_catch_added_videos():
    # First pass has 1 video; second pass (simulating a newly added file) has 1; then empty.
    processed = []
    summary = run_auto_loop(
        scan_fn=make_scan([[FakeCand(True)], [FakeCand(True)]]),
        process_fn=processed.append,
        move_failed_fn=lambda c: None,
        stop_fn=lambda: False,
        log_fn=lambda m: None,
    )
    assert len(processed) == 2
    assert summary["passes"] == 2


def test_stop_flag_breaks_mid_pass():
    processed = []
    calls = {"n": 0}

    def stop_fn():
        calls["n"] += 1
        return calls["n"] > 1  # allow first check, then stop

    summary = run_auto_loop(
        scan_fn=make_scan([[FakeCand(True), FakeCand(True), FakeCand(True)]]),
        process_fn=processed.append,
        move_failed_fn=lambda c: None,
        stop_fn=stop_fn,
        log_fn=lambda m: None,
    )
    assert summary["stopped"] is True
    assert len(processed) < 3


def test_stop_flag_between_passes():
    # Stop requested only AFTER the first full pass completes (before the next scan).
    # Exercises the outer-loop pre-scan stop check: the loop must stop with stopped=True
    # rather than scanning again, and must not process a second candidate.
    processed = []

    def scan_fn():
        return [FakeCand(True)]  # always one valid candidate; infinite without the stop

    def stop_fn():
        return len(processed) >= 1  # False during first pass, True once one is processed

    summary = run_auto_loop(
        scan_fn=scan_fn,
        process_fn=processed.append,
        move_failed_fn=lambda c: None,
        stop_fn=stop_fn,
        log_fn=lambda m: None,
    )
    assert summary["stopped"] is True
    assert len(processed) == 1
