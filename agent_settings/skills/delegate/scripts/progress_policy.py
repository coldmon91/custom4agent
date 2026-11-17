"""When a still-running delegate should be put to the user: keep waiting, or stop?

The run is never stopped automatically; long reasoning can be silent for minutes.
"""

from __future__ import annotations

from cli_profiles import ProgressSignal

# A streaming log that stops growing this long looks stalled.
STALL_AFTER_S = 600
# A silent CLI gives no stall signal, so check in on elapsed time alone.
CHECK_IN_EVERY_S = 1800

ADVICE_WAIT = "wait"
ADVICE_ASK_USER = "ask_user"


def advise(signal: ProgressSignal, state: dict, now: float, log_bytes: int) -> tuple[str, dict]:
    """Return (advice, updated state) for one poll of a running delegate.

    `state` keys: `reference_time` (last log growth or last check-in) and `log_bytes`.
    """
    reference = state.get("reference_time", now)
    if signal is ProgressSignal.STREAMING_LOG and log_bytes != state.get("log_bytes"):
        reference = now
    threshold = STALL_AFTER_S if signal is ProgressSignal.STREAMING_LOG else CHECK_IN_EVERY_S

    advice = ADVICE_WAIT
    if now - reference >= threshold:
        advice = ADVICE_ASK_USER
        # The user answers once per window; the next prompt waits a full window again.
        reference = now
    return advice, {"reference_time": reference, "log_bytes": log_bytes}
