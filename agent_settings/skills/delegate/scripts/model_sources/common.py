"""Helpers shared by the model listing sources."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


class ModelSourceError(Exception):
    """The listing cannot be produced; the message is shown to the user verbatim."""


def warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


def run_listing_command(argv: list[str], timeout: float) -> str:
    label = " ".join(argv)
    try:
        return subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=True,
            stdin=subprocess.DEVNULL,
        ).stdout
    except FileNotFoundError:
        raise ModelSourceError(f"`{argv[0]}` executable not found in PATH") from None
    except subprocess.TimeoutExpired:
        raise ModelSourceError(f"`{label}` timed out after {timeout:g}s") from None
    except subprocess.CalledProcessError as exc:
        raise ModelSourceError(
            f"`{label}` failed (exit {exc.returncode}): {exc.stderr.strip()}"
        ) from None


def read_source_file(path: str) -> str:
    try:
        return Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        raise ModelSourceError(f"cannot read {path}: {exc}") from None


def load_raw(options, argv: list[str]) -> str:
    """Listing text from `--from-file` when given, else from running the CLI."""
    if options.from_file:
        return read_source_file(options.from_file)
    return run_listing_command(argv, options.timeout)


def one_line(text) -> str:
    """Collapse embedded newlines so each model stays on one table row."""
    return " ".join(str(text or "").split())
