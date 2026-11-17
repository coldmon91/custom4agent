#!/usr/bin/env python3
"""Run a delegate CLI (codex, pi, claude) detached, then poll, stop, read, and clean up.

  run.py prepare [--base DIR]
  run.py launch  --run-dir D --cli CLI --mode agent|review --model M --effort E [--workdir W]
  run.py poll    --run-dir D [--wait SECONDS]
  run.py stop    --run-dir D
  run.py result  --run-dir D
  run.py cleanup --run-dir D
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Sibling imports must work even under `python3 -I`, which drops the script directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cli_profiles import PROFILES, Mode, StdoutTarget  # noqa: E402
from model_sources.common import ModelSourceError  # noqa: E402
from models import load_rows  # noqa: E402
from progress_policy import advise  # noqa: E402
from run_state import (  # noqa: E402
    KNOWN_FILES, LOG_FILE, OUTPUT_FILE, PROMPT_FILE, TMP_SUFFIX, RunDir, RunDirError,
)

RUN_DIR_PREFIX = "delegate-run-"
DEFAULT_WAIT_S = 120
POLL_INTERVAL_S = 2
STOP_GRACE_S = 10
LOG_TAIL_LINES = 20
EXIT_CODE_LAUNCH_FAILED = 127
SIGNAL_EXIT_BASE = 128

STATE_RUNNING = "running"
STATE_EXITED = "exited"
STATE_LOST = "lost"  # every process is gone but no exit code was recorded


class UsageError(Exception):
    """A request that must not run; reported as one `error:` line."""


def emit(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False))


def group_alive(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def run_status(run: RunDir) -> tuple[str, int | None]:
    code = run.read_exit_code()
    if code is not None:
        return STATE_EXITED, code
    pgid = run.read_launch().get("pgid")
    if pgid is not None and group_alive(pgid):
        return STATE_RUNNING, None
    return STATE_LOST, None


# --- prepare ---------------------------------------------------------------------------

def cmd_prepare(args) -> int:
    base = args.base
    if base is not None and not Path(base).is_dir():
        raise UsageError(f"base directory not found: {base}")
    # mkdtemp creates the directory with mode 0700.
    path = tempfile.mkdtemp(prefix=RUN_DIR_PREFIX, dir=base)
    if "'" in path:
        os.rmdir(path)
        raise UsageError(f"run directory path contains a single quote: {path}")
    print(path)
    return 0


# --- launch ----------------------------------------------------------------------------

def validate_model(cli: str, model: str, effort: str) -> None:
    try:
        rows = load_rows(cli)
    except ModelSourceError as exc:
        raise UsageError(f"cannot list {cli} models: {exc}") from None
    row = next((row for row in rows if row["model"] == model), None)
    if row is None:
        names = ", ".join(row["model"] for row in rows)
        raise UsageError(f"model `{model}` is not usable through {cli}; choose one of: {names}")
    if effort not in row["efforts"]:
        raise UsageError(
            f"effort `{effort}` is not supported by `{model}`; choose one of: {', '.join(row['efforts'])}"
        )


def cmd_launch(args) -> int:
    run = RunDir(args.run_dir)
    if run.is_launched():
        raise UsageError(f"a run was already launched in {run.path}; prepare a new directory")
    if run.size_of(PROMPT_FILE) == 0 or not run.prompt.read_text(encoding="utf-8").strip():
        raise UsageError(f"prompt is missing or empty: {run.prompt}")
    workdir = Path(args.workdir or os.getcwd()).resolve()
    if not workdir.is_dir():
        raise UsageError(f"workdir not found: {workdir}")

    profile = PROFILES[args.cli]
    if shutil.which(profile.executable) is None:
        raise UsageError(f"`{profile.executable}` executable not found in PATH")
    validate_model(args.cli, args.model, args.effort)

    spec = profile.build(Mode(args.mode), args.model, args.effort, run.output)
    launch = {
        "cli": args.cli,
        "mode": args.mode,
        "model": args.model,
        "effort": args.effort,
        "workdir": str(workdir),
        "argv": spec.argv,
        "stdout_target": spec.stdout_target.value,
        "started_at": time.time(),
    }
    run.write_launch(launch)

    # A new session makes the supervisor a process-group leader, so `stop` can signal
    # the supervisor, the CLI, and anything the CLI spawned in one call.
    supervisor = subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve()), "_supervise", "--run-dir", str(run.path)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    launch["pgid"] = supervisor.pid
    run.write_launch(launch)
    emit({"state": STATE_RUNNING, "run_dir": str(run.path), "pid": supervisor.pid,
          "cli": args.cli, "mode": args.mode, "model": args.model, "effort": args.effort})
    return 0


def cmd_supervise(args) -> int:
    """Detached child of `launch`: runs the CLI and records its exit code."""
    run = RunDir(args.run_dir)
    launch = run.read_launch()
    # A handler, not SIG_IGN: an ignored disposition would be inherited by the CLI.
    # The CLI receives the same group signal from `stop` and exits on its own.
    signal.signal(signal.SIGTERM, lambda signum, frame: None)

    with open(run.prompt, "rb") as stdin, open(run.log, "ab") as log:
        stdout = log
        output = None
        if launch["stdout_target"] == StdoutTarget.OUTPUT.value:
            output = open(run.output, "wb")
            stdout = output
        try:
            # CLIs resolve the workspace from $PWD as well as the real cwd; keep them equal.
            env = {**os.environ, "PWD": launch["workdir"]}
            child = subprocess.Popen(
                launch["argv"], cwd=launch["workdir"], env=env,
                stdin=stdin, stdout=stdout, stderr=log,
            )
            code = child.wait()
        except OSError as exc:
            log.write(f"delegate: failed to start {launch['argv'][0]}: {exc}\n".encode())
            code = EXIT_CODE_LAUNCH_FAILED
        finally:
            if output is not None:
                output.close()
    run.write_exit_code(SIGNAL_EXIT_BASE - code if code < 0 else code)
    return 0


# --- poll / stop -----------------------------------------------------------------------

def wait_for_end(run: RunDir, timeout_s: float) -> tuple[str, int | None]:
    deadline = time.monotonic() + timeout_s
    state, code = run_status(run)
    while state == STATE_RUNNING and time.monotonic() < deadline:
        time.sleep(POLL_INTERVAL_S)
        state, code = run_status(run)
    return state, code


def status_report(run: RunDir, state: str, code: int | None) -> dict:
    launch = run.read_launch()
    report = {
        "state": state,
        "exit_code": code,
        "elapsed_s": round(time.time() - launch["started_at"]),
        "output_bytes": run.size_of(OUTPUT_FILE),
        "log_bytes": run.size_of(LOG_FILE),
        "log_tail": run.tail_log(LOG_TAIL_LINES),
    }
    if run.read_state().get("stopped"):
        report["stopped_by_user"] = True
    return report


def cmd_poll(args) -> int:
    run = RunDir(args.run_dir)
    state, code = wait_for_end(run, args.wait)
    report = status_report(run, state, code)
    if state == STATE_RUNNING:
        stored = run.read_state()
        signal_kind = PROFILES[run.read_launch()["cli"]].progress
        advice, progress = advise(signal_kind, stored.get("progress", {}), time.time(),
                                  report["log_bytes"])
        run.write_state({**stored, "progress": progress})
        report["advice"] = advice
    else:
        report["advice"] = "done"
    emit(report)
    return 0


def cmd_stop(args) -> int:
    run = RunDir(args.run_dir)
    state, code = run_status(run)
    if state == STATE_RUNNING:
        run.write_state({**run.read_state(), "stopped": True})
        pgid = run.read_launch()["pgid"]
        try:
            os.killpg(pgid, signal.SIGTERM)
            state, code = wait_for_end(run, STOP_GRACE_S)
            if state == STATE_RUNNING:
                os.killpg(pgid, signal.SIGKILL)
                state, code = wait_for_end(run, POLL_INTERVAL_S)
        except ProcessLookupError:
            state, code = run_status(run)
    emit(status_report(run, state, code))
    return 0


# --- result / cleanup ------------------------------------------------------------------

def cmd_result(args) -> int:
    run = RunDir(args.run_dir)
    state, code = run_status(run)
    if state == STATE_RUNNING:
        raise UsageError("the run is still running; poll until it ends")
    output = run.output.read_text(encoding="utf-8", errors="replace") if run.output.exists() else ""
    if state == STATE_EXITED and code == 0:
        if not output.strip():
            print("warning: the run exited 0 but produced no output; the prompt may not have "
                  "arrived. Log tail:\n" + run.tail_log(LOG_TAIL_LINES), file=sys.stderr)
        print(output, end="")
        return 0

    stopped = " (stopped by user)" if run.read_state().get("stopped") else ""
    reason = f"exit {code}" if state == STATE_EXITED else "no exit code recorded"
    print(f"error: run failed: {reason}{stopped}", file=sys.stderr)
    print(f"--- log tail ---\n{run.tail_log(LOG_TAIL_LINES)}")
    if output.strip():
        print(f"--- output ---\n{output}", end="")
    return 1


def cmd_cleanup(args) -> int:
    run = RunDir(args.run_dir)
    if run.is_launched() and run_status(run)[0] == STATE_RUNNING:
        raise UsageError("the run is still running; stop it or wait before cleanup")
    for name in KNOWN_FILES:
        for candidate in (name, name + TMP_SUFFIX):
            run.file(candidate).unlink(missing_ok=True)
    try:
        run.path.rmdir()
    except OSError:
        leftovers = sorted(p.name for p in run.path.iterdir())
        raise UsageError(
            f"left {run.path} in place; unexpected files: {', '.join(leftovers)}"
        ) from None
    emit({"removed": str(run.path)})
    return 0


# --- entry -----------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)

    prepare = sub.add_parser("prepare", help="create a private run directory and print its path")
    prepare.add_argument("--base", help="parent directory (e.g. a session scratchpad)")
    prepare.set_defaults(handler=cmd_prepare)

    launch = sub.add_parser("launch", help="start the CLI detached")
    launch.add_argument("--run-dir", required=True)
    launch.add_argument("--cli", required=True, choices=sorted(PROFILES))
    launch.add_argument("--mode", required=True, choices=[mode.value for mode in Mode])
    launch.add_argument("--model", required=True)
    launch.add_argument("--effort", required=True)
    launch.add_argument("--workdir", help="workspace the CLI runs in (default: current directory)")
    launch.set_defaults(handler=cmd_launch)

    for name, handler, help_text in (
        ("poll", cmd_poll, "wait up to --wait seconds, then report state and advice"),
        ("stop", cmd_stop, "terminate the run (only on the user's request)"),
        ("result", cmd_result, "print the final output, or the error"),
        ("cleanup", cmd_cleanup, "delete the run directory's known files and the directory"),
        ("_supervise", cmd_supervise, argparse.SUPPRESS),
    ):
        command = sub.add_parser(name, help=help_text)
        command.add_argument("--run-dir", required=True)
        if name == "poll":
            command.add_argument("--wait", type=float, default=DEFAULT_WAIT_S)
        command.set_defaults(handler=handler)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.handler(args)
    except (UsageError, RunDirError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
