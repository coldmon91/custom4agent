"""Claude Code models currently selectable, with effort levels, from `claude --help`.

The `claude` CLI exposes no model enumeration command. What it does expose is stable:
`--model` accepts aliases that always point at the newest model of a family, and
`--help` documents both the alias examples and the effort ladder. The account's extra
model options (e.g. a `[1m]` variant) come from the CLI's own cache. This module joins
those signals instead of hardcoding dated slugs, and falls back to the built-in ladders
with a warning when the help text stops carrying them.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .common import load_raw, one_line, warn

NAME = "claude"
DEFAULT_TIMEOUT = 30.0
SOURCE_DESCRIPTION = "`claude --help` output"

# Fallback effort ladder, weakest to strongest. Parsed from `--help` when present.
DEFAULT_EFFORTS = ("low", "medium", "high", "xhigh", "max")

# Ordered strongest to weakest. Family aliases outlive individual model names,
# which is exactly why `--model` accepts them.
ALIAS_LADDER = ("fable", "opus", "sonnet", "haiku")

EFFORT_LINE = re.compile(r"--effort\s+<level>.*?\(([^)]*)\)", re.DOTALL)
MODEL_LINE = re.compile(r"--model\s+<model>(.*?)(?=\n\s{2}-{1,2}\w)", re.DOTALL)
QUOTED = re.compile(r"'([a-z0-9.\-]+)'")


def add_arguments(parser) -> None:
    """The claude listing has no source-specific options."""


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
        # ladder this module knows.
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
        warn("`--help` names no known model alias; using the built-in ladder " + ",".join(ALIAS_LADDER))
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


def family_rank(name: str) -> int:
    family = family_of(name)
    return ALIAS_LADDER.index(family) if family else len(ALIAS_LADDER)


def build_rows(aliases: list[str], options: list[dict], efforts: list[str]) -> list[dict]:
    """Aliases first within each family, then that family's extra options; families
    strongest first, unrecognised names last."""
    rows = [
        {
            "model": alias,
            "efforts": efforts,
            "description": f"Alias for the latest {alias.capitalize()} model"
            if alias in ALIAS_LADDER
            else "Named in `claude --help`",
        }
        for alias in aliases
    ]

    listed = {row["model"] for row in rows}
    for option in options:
        value = option["value"]
        if value in listed:
            continue
        listed.add(value)
        rows.append({
            "model": value,
            "efforts": efforts,
            "description": one_line(option.get("description") or option.get("label")),
        })

    # Stable sort keeps each alias ahead of the extra options of its family.
    rows.sort(key=lambda row: family_rank(row["model"]))
    return rows


def list_models(options) -> list[dict]:
    help_text = load_raw(options, ["claude", "--help"])
    return build_rows(parse_aliases(help_text), extra_options(), parse_efforts(help_text))


def table_columns(rows: list[dict]) -> list[tuple]:
    return [("DESCRIPTION", lambda row: row["description"] or "-")]
