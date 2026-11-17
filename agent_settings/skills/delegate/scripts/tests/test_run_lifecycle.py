"""End-to-end run.py lifecycle against the fake codex in tests/fakes."""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
RUN_PY = SCRIPTS / "run.py"
FAKES = Path(__file__).resolve().parent / "fakes"
COMMAND_TIMEOUT_S = 60


class RunLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.TemporaryDirectory()
        self.addCleanup(self.base.cleanup)
        self.workdir = Path(self.base.name) / "work"
        self.workdir.mkdir()
        self.env = {**os.environ, "PATH": f"{FAKES}{os.pathsep}{os.environ['PATH']}"}

    def run_py(self, *args, env=None):
        return subprocess.run(
            [sys.executable, str(RUN_PY), *args],
            capture_output=True, text=True, timeout=COMMAND_TIMEOUT_S, env=env or self.env,
        )

    def prepare(self, prompt="hello"):
        result = self.run_py("prepare", "--base", self.base.name)
        self.assertEqual(result.returncode, 0, result.stderr)
        run_dir = result.stdout.strip()
        self.assertEqual(os.stat(run_dir).st_mode & 0o777, 0o700)
        Path(run_dir, "prompt.txt").write_text(prompt, encoding="utf-8")
        return run_dir

    def launch(self, run_dir, model="gpt-test", effort="high", env=None):
        return self.run_py(
            "launch", "--run-dir", run_dir, "--cli", "codex", "--mode", "review",
            "--model", model, "--effort", effort, "--workdir", str(self.workdir), env=env,
        )

    def poll(self, run_dir, wait=30):
        result = self.run_py("poll", "--run-dir", run_dir, "--wait", str(wait))
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_success_result_and_cleanup(self):
        run_dir = self.prepare("hello")
        launched = self.launch(run_dir)
        self.assertEqual(launched.returncode, 0, launched.stderr)

        report = self.poll(run_dir)
        self.assertEqual((report["state"], report["exit_code"], report["advice"]), ("exited", 0, "done"))
        self.assertIn("-s read-only", report["log_tail"])

        result = self.run_py("result", "--run-dir", run_dir)
        self.assertEqual((result.returncode, result.stdout), (0, "echo:hello"))

        cleaned = self.run_py("cleanup", "--run-dir", run_dir)
        self.assertEqual(cleaned.returncode, 0, cleaned.stderr)
        self.assertFalse(Path(run_dir).exists())

    def test_failure_is_reported(self):
        run_dir = self.prepare()
        self.launch(run_dir, env={**self.env, "FAKE_EXIT": "3"})
        self.assertEqual(self.poll(run_dir)["exit_code"], 3)
        result = self.run_py("result", "--run-dir", run_dir)
        self.assertEqual(result.returncode, 1)
        self.assertIn("exit 3", result.stderr)

    def test_running_then_stop(self):
        run_dir = self.prepare()
        self.launch(run_dir, env={**self.env, "FAKE_SLEEP": "60"})
        report = self.poll(run_dir, wait=1)
        self.assertEqual((report["state"], report["advice"]), ("running", "wait"))

        refused = self.run_py("cleanup", "--run-dir", run_dir)
        self.assertEqual(refused.returncode, 1)
        self.assertIn("still running", refused.stderr)

        stopped = json.loads(self.run_py("stop", "--run-dir", run_dir).stdout)
        self.assertNotEqual(stopped["state"], "running")
        self.assertTrue(stopped["stopped_by_user"])
        result = self.run_py("result", "--run-dir", run_dir)
        self.assertEqual(result.returncode, 1)
        self.assertIn("stopped by user", result.stderr)
        self.assertEqual(self.run_py("cleanup", "--run-dir", run_dir).returncode, 0)

    def test_rejections_before_launch(self):
        run_dir = self.prepare()
        cases = {
            ("no-such-model", "high"): "not usable",
            ("gpt-test", "max"): "not supported",
        }
        for (model, effort), message in cases.items():
            with self.subTest(model=model, effort=effort):
                result = self.launch(run_dir, model=model, effort=effort)
                self.assertEqual(result.returncode, 1)
                self.assertIn(message, result.stderr)

        empty_dir = self.prepare(prompt="  \n")
        result = self.launch(empty_dir)
        self.assertEqual(result.returncode, 1)
        self.assertIn("prompt is missing or empty", result.stderr)

    def test_second_launch_is_refused(self):
        run_dir = self.prepare()
        self.assertEqual(self.launch(run_dir).returncode, 0)
        again = self.launch(run_dir)
        self.assertEqual(again.returncode, 1)
        self.assertIn("already launched", again.stderr)
        self.poll(run_dir)


if __name__ == "__main__":
    unittest.main()
