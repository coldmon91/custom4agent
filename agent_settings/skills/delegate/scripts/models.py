#!/usr/bin/env python3
"""List the models a delegate CLI can currently use: `models.py <codex|pi|claude> [options]`."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Sibling imports must work even under `python3 -I`, which drops the script directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from model_sources import SOURCES  # noqa: E402
from model_sources.common import ModelSourceError  # noqa: E402

COMMON_COLUMNS = (
    ("MODEL", lambda row: row["model"]),
    ("EFFORTS", lambda row: ",".join(row["efforts"]) or "-"),
)
COLUMN_GAP = "  "


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="cli", required=True, metavar="CLI")
    for name, source in SOURCES.items():
        sub = subparsers.add_parser(name, help=f"models usable through `{name}`")
        output = sub.add_mutually_exclusive_group()
        output.add_argument("--json", action="store_true", help="emit the model list as JSON")
        output.add_argument("--slugs", action="store_true", help="print bare model names")
        sub.add_argument(
            "--from-file",
            metavar="PATH",
            help=f"read {source.SOURCE_DESCRIPTION} from PATH instead of running {name}",
        )
        sub.add_argument(
            "--timeout",
            type=float,
            default=source.DEFAULT_TIMEOUT,
            metavar="SECONDS",
            help=f"timeout for the listing command (default: {source.DEFAULT_TIMEOUT:g})",
        )
        source.add_arguments(sub)
    return parser


def load_rows(cli: str) -> list[dict]:
    """Rows for `cli` with default options; raises ModelSourceError."""
    options = build_parser().parse_args([cli])
    return SOURCES[cli].list_models(options)


def format_table(rows: list[dict], columns: list[tuple]) -> str:
    """Fixed-width columns; free text such as DESCRIPTION stays last because it contains spaces."""
    lines = [[header for header, _ in columns]]
    lines += [[cell(row) for _, cell in columns] for row in rows]
    widths = [max(len(line[i]) for line in lines) for i in range(len(columns))]
    return "\n".join(
        COLUMN_GAP.join(text.ljust(widths[i]) for i, text in enumerate(line)).rstrip()
        for line in lines
    )


def main() -> int:
    options = build_parser().parse_args()
    source = SOURCES[options.cli]
    try:
        rows = source.list_models(options)
    except ModelSourceError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if options.json:
        print(json.dumps(rows, indent=2))
    elif options.slugs:
        print("\n".join(row["model"] for row in rows))
    else:
        print(format_table(rows, [*COMMON_COLUMNS, *source.table_columns(rows)]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # Silence the interpreter's flush-on-exit error when stdout is a closed pipe.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
