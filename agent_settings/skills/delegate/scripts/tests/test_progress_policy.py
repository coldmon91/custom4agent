import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cli_profiles import ProgressSignal  # noqa: E402
from progress_policy import (  # noqa: E402
    ADVICE_ASK_USER, ADVICE_WAIT, CHECK_IN_EVERY_S, STALL_AFTER_S, advise,
)


class StreamingLogTest(unittest.TestCase):
    signal = ProgressSignal.STREAMING_LOG

    def test_growing_log_never_asks(self):
        state = {}
        for step in range(10):
            advice, state = advise(self.signal, state, step * STALL_AFTER_S, step)
            self.assertEqual(advice, ADVICE_WAIT)

    def test_stalled_log_asks_once_per_window(self):
        _, state = advise(self.signal, {}, 0, 100)
        advice, state = advise(self.signal, state, STALL_AFTER_S - 1, 100)
        self.assertEqual(advice, ADVICE_WAIT)
        advice, state = advise(self.signal, state, STALL_AFTER_S, 100)
        self.assertEqual(advice, ADVICE_ASK_USER)
        advice, state = advise(self.signal, state, STALL_AFTER_S + 1, 100)
        self.assertEqual(advice, ADVICE_WAIT)


class SilentTest(unittest.TestCase):
    signal = ProgressSignal.SILENT

    def test_checks_in_on_elapsed_time(self):
        _, state = advise(self.signal, {}, 0, 0)
        advice, state = advise(self.signal, state, CHECK_IN_EVERY_S - 1, 0)
        self.assertEqual(advice, ADVICE_WAIT)
        advice, state = advise(self.signal, state, CHECK_IN_EVERY_S, 0)
        self.assertEqual(advice, ADVICE_ASK_USER)
        advice, state = advise(self.signal, state, CHECK_IN_EVERY_S * 2 - 1, 0)
        self.assertEqual(advice, ADVICE_WAIT)


if __name__ == "__main__":
    unittest.main()
