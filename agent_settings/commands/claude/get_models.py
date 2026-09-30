#!/usr/bin/env python3
"""List the Claude Code models currently selectable, with effort levels, from `claude --help`.

Unlike `codex debug models` or `pi --list-models`, the `claude` CLI exposes no
model enumeration command. What it does expose is stable: `--model` accepts
aliases that always point at the newest model of a family, and `--help`
documents both the alias examples and the effort ladder. The account's extra
model options (e.g. a `[1m]` variant) come from the CLI's own cache. This script
joins those signals instead of hardcoding dated slugs, and falls back to the
documented ladders with a warning when the help text stops carrying them.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

# Fallback effort ladder, weakest to strongest. Parsed from `--help` when present.
DEFAULT_EFFORTS = ("low", "medium", "high", "xhigh", "max")

# Ordered strongest to weakest. Family aliases outlive individual model names,
# which is exactly why `--model` accepts them.
ALIAS_LADDER = ("fable", "opus", "sonnet", "haiku")

EFFORT_LINE = re.compile(r"--effort\s+<level>.*?\(([^)]*)\)", re.DOTALL)
MODEL_LINE = re.compile(r"--model\s+<model>(.*?)(?=\n\s{2}-{1,2}\w)", re.DOTALL)
QUOTED = re.compile(r"'([a-z0-9.\-]+)'")


def die(message: str) -> NoReturn:
    sys.exit(f"error: {message}")


def warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


def run_claude_help(timeout: float) -> str:
    try:
        return subprocess.run(
            ["claude", "--help"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=True,
        ).stdout
    except FileNotFoundError:
        die("`claude` executable not found in PATH")
    except subprocess.TimeoutExpired:
        die(f"`claude --help` timed out after {timeout:g}s")
    except subprocess.CalledProcessError as exc:
        die(f"`claude --help` failed (exit {exc.returncode}): {exc.stderr.strip()}")


def load_help(source: str | None, timeout: float) -> str:
    if source is None:
        return run_claude_help(timeout)
    try:
        return Path(source).read_text(encoding="utf-8")
    except OSError as exc:
        die(f"cannot read {source}: {exc}")


def parse_efforts(help_text: str) -> list[str]:
    """Read the `--effort` ladder out of the help text, ordered weakest first."""
    match = EFFORT_LINE.search(help_text)
    if not match:
        warn(
            "`--help` no longer documents the `--effort` ladder; using the built-in ladder "
            + ",".join(DEFAULT_EFFORTS)
        )
        return list(DEFAULT_EFFORTS)

    found = {token.strip() for token in match.group(1).split(",") if token.strip()}
    ordered = [effort for effort in DEFAULT_EFFORTS if effort in found]
    unknown = sorted(found - set(DEFAULT_EFFORTS))
    if unknown:
        # Appended at the top: an unrecognised level can only be stronger than the
        # ladder this script knows.
        ordered += unknown
        warn(f"`--help` advertises unknown effort level(s): {', '.join(unknown)}")
    if not ordered:
        warn("parsed no usable effort level; using the built-in ladder")
        return list(DEFAULT_EFFORTS)
    return ordered


def parse_aliases(help_text: str) -> list[str]:
    """Collect the model names `--help` quotes: known aliases strongest first, then any
    other quoted name in help order."""
    section = MODEL_LINE.search(help_text)
    quoted = list(dict.fromkeys(QUOTED.findall(section.group(1)))) if section else []
    known = [alias for alias in ALIAS_LADDER if alias in quoted]
    if not known:
        warn(
            "`--help` names no known model alias; using the built-in ladder "
            + ",".join(ALIAS_LADDER)
        )
        known = list(ALIAS_LADDER)
    return known + [name for name in quoted if name not in ALIAS_LADDER]


def extra_options() -> list[dict]:
    """The account's extra model options, e.g. a `[1m]` variant.

    This cache is written by the CLI itself, so it reflects entitlements the help
    text never mentions. Absent or unreadable, it simply contributes nothing.
    """
    path = Path.home() / ".claude.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []

    options = data.get("additionalModelOptionsCache")
    if not isinstance(options, list):
        return []
    return [
        option
        for option in options
        if isinstance(option, dict) and isinstance(option.get("value"), str) and option["value"]
    ]


def family_of(name: str) -> str | None:
    lowered = name.lower()
    return next((alias for alias in ALIAS_LADDER if alias in lowered), None)


def build_rows(aliases: list[str], options: list[dict], efforts: list[str]) -> list[dict]:
    """Aliases first within each family, then that family's extra options; families
    strongest first, unrecognised names last."""
    rows = []
    for alias in aliases:
        family = family_of(alias)
        rows.append({
            "model": alias,
            "family": family,
            "efforts": efforts,
            "description": f"Alias for the latest {alias.capitalize()} model"
            if alias in ALIAS_LADDER
            else "Named in `claude --help`",
        })

    listed = {row["model"] for row in rows}
    for option in options:
        value = option["value"]
        if value in listed:
            continue
        listed.add(value)
        rows.append({
            "model": value,
            "family": family_of(value),
            "efforts": efforts,
            "description": " ".join(
                str(option.get("description") or option.get("label") or "").split()
            ),
        })

    def rank(row: dict) -> int:
        family = row["family"]
        return ALIAS_LADDER.index(family) if family else len(ALIAS_LADDER)

    # Stable sort keeps each alias ahead of the extra options of its family.
    rows.sort(key=rank)
    return [{key: value for key, value in row.items() if key != "family"} for row in rows]


def format_table(rows: list[dict]) -> str:
    """Fixed-width columns; DESCRIPTION stays last because it contains spaces."""
    header = ("MODEL", "EFFORTS", "DESCRIPTION")
    cells = [header] + [
        (row["model"], ",".join(row["efforts"]) or "-", row["description"] or "-")
        for row in rows
    ]
    widths = [max(len(line[i]) for line in cells) for i in range(len(header))]
    return "\n".join(
        "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(line)).rstrip()
        for line in cells
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="List the Claude Code models currently selectable.")
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--json", action="store_true", help="emit the model list as JSON")
    output.add_argument(
        "--slugs",
        action="store_true",
        help="print bare model names, one per line",
    )
    parser.add_argument(
        "--from-file",
        metavar="PATH",
        help="read `claude --help` output from PATH instead of running claude",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        metavar="SECONDS",
        help="timeout for `claude --help` (default: 30)",
    )
    args = parser.parse_args()

    help_text = load_help(args.from_file, args.timeout)
    rows = build_rows(parse_aliases(help_text), extra_options(), parse_efforts(help_text))

    if args.json:
        print(json.dumps(rows, indent=2))
    elif args.slugs:
        print("\n".join(row["model"] for row in rows))
    else:
        print(format_table(rows))


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        # Silence the interpreter's flush-on-exit error when stdout is a closed pipe.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
