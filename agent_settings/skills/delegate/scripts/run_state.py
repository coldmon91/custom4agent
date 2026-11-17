"""Files inside one delegated run's directory, and atomic reads and writes of them."""

from __future__ import annotations

import json
import os
from pathlib import Path

PROMPT_FILE = "prompt.txt"
OUTPUT_FILE = "output.txt"
LOG_FILE = "log.txt"
EXIT_CODE_FILE = "exit-code"
LAUNCH_FILE = "launch.json"
STATE_FILE = "state.json"
TMP_SUFFIX = ".tmp"

KNOWN_FILES = (PROMPT_FILE, OUTPUT_FILE, LOG_FILE, EXIT_CODE_FILE, LAUNCH_FILE, STATE_FILE)


class RunDirError(Exception):
    """The run directory is missing, incomplete, or in the wrong state for the request."""


def write_text_atomic(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + TMP_SUFFIX)
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


class RunDir:
    def __init__(self, path: str | Path):
        self.path = Path(path).resolve()
        if not self.path.is_dir():
            raise RunDirError(f"run directory not found: {self.path}")

    def file(self, name: str) -> Path:
        return self.path / name

    @property
    def prompt(self) -> Path:
        return self.file(PROMPT_FILE)

    @property
    def output(self) -> Path:
        return self.file(OUTPUT_FILE)

    @property
    def log(self) -> Path:
        return self.file(LOG_FILE)

    def size_of(self, name: str) -> int:
        try:
            return self.file(name).stat().st_size
        except FileNotFoundError:
            return 0

    def is_launched(self) -> bool:
        return self.file(LAUNCH_FILE).exists()

    def read_launch(self) -> dict:
        if not self.is_launched():
            raise RunDirError(f"no run has been launched in {self.path}")
        return json.loads(self.file(LAUNCH_FILE).read_text(encoding="utf-8"))

    def write_launch(self, data: dict) -> None:
        write_text_atomic(self.file(LAUNCH_FILE), json.dumps(data, indent=2))

    def read_state(self) -> dict:
        try:
            return json.loads(self.file(STATE_FILE).read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}

    def write_state(self, data: dict) -> None:
        write_text_atomic(self.file(STATE_FILE), json.dumps(data, indent=2))

    def read_exit_code(self) -> int | None:
        try:
            return int(self.file(EXIT_CODE_FILE).read_text(encoding="utf-8").strip())
        except FileNotFoundError:
            return None

    def write_exit_code(self, code: int) -> None:
        write_text_atomic(self.file(EXIT_CODE_FILE), f"{code}\n")

    def tail_log(self, lines: int) -> str:
        try:
            text = self.log.read_text(encoding="utf-8", errors="replace")
        except FileNotFoundError:
            return ""
        return "\n".join(text.splitlines()[-lines:])
