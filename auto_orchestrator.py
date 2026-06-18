"""Pure control-flow loop for auto-folder mode (scan -> process -> re-scan -> stop)."""
from typing import Callable, List


def run_auto_loop(
    scan_fn: Callable[[], List],
    process_fn: Callable[[object], None],
    move_failed_fn: Callable[[object], None],
    stop_fn: Callable[[], bool],
    log_fn: Callable[[str], None],
) -> dict:
    processed = 0
    failed = 0
    passes = 0
    stopped = False
    while True:
        if stop_fn():
            stopped = True
            break
        candidates = scan_fn()
        if not candidates:
            break
        passes += 1
        log_fn(f"Scan pass {passes}: found {len(candidates)} video(s).")
        for c in candidates:
            if stop_fn():
                stopped = True
                break
            if not getattr(c, "valid", False):
                move_failed_fn(c)
                failed += 1
                continue
            process_fn(c)
            processed += 1
        if stopped:
            break
    return {"processed": processed, "failed": failed, "passes": passes, "stopped": stopped}
