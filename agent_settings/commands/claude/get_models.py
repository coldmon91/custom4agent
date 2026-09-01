#!/usr/bin/env python3
"""Resolve Claude Code tiers to (model alias, effort level) from `claude --help`.

Unlike `codex debug models` or `pi --list-models`, the `claude` CLI exposes no
model enumeration command. What it does expose is stable: `--model` accepts
aliases that always point at the newest model of a family, and `--help`
documents both the alias examples and the effort ladder. This script reads those
two signals instead of hardcoding dated slugs, and falls back to the documented
alias ladder with a warning when the help text stops carrying them.
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

# Ordered strongest to weakest. Role names stay stable even when model names do not.
ROLES = ("deep", "balanced", "fast")

# When a role has no alias of its own, borrow from the nearest neighbour so every
# tier stays answerable on a thin lineup.
ROLE_BORROW_ORDER = {
    "deep": ("balanced", "fast"),
    "balanced": ("deep", "fast"),
    "fast": ("balanced", "deep"),
}

# Tier -> (role, requested effort). The effort is a ceiling, clamped down to the
# strongest level the CLI actually advertises.
TIER_POLICY = {
    "agent": (
        ("fast", "medium"),
        ("balanced", "high"),
        ("deep", "high"),
        ("deep", "xhigh"),
    ),
    "review": (
        ("fast", "medium"),
        ("balanced", "medium"),
        ("deep", "high"),
        ("deep", "xhigh"),
    ),
}

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


def parse_efforts(help_text: str) -> tuple[list[str], list[str]]:
    """Read the `--effort` ladder out of the help text, ordered weakest first."""
    match = EFFORT_LINE.search(help_text)
    if not match:
        return list(DEFAULT_EFFORTS), [
            "`--help` no longer documents the `--effort` ladder; using the built-in ladder "
            + ",".join(DEFAULT_EFFORTS)
        ]

    found = {token.strip() for token in match.group(1).split(",") if token.strip()}
    ordered = [effort for effort in DEFAULT_EFFORTS if effort in found]
    unknown = sorted(found - set(DEFAULT_EFFORTS))

    notes = []
    if unknown:
        # Appended at the top: an unrecognised level can only be stronger than the
        # ladder this script knows, and clamping never selects it unless requested.
        ordered += unknown
        notes.append(f"`--help` advertises unknown effort level(s): {', '.join(unknown)}")
    if not ordered:
        return list(DEFAULT_EFFORTS), notes + ["parsed no usable effort level; using the built-in ladder"]
    return ordered, notes


def extra_aliases() -> set[str]:
    """Family names from the account's extra model options, e.g. a `[1m]` variant.

    This cache is written by the CLI itself, so it reflects entitlements the help
    text never mentions. Absent or unreadable, it simply contributes nothing.
    """
    path = Path.home() / ".claude.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()

    options = data.get("additionalModelOptionsCache")
    if not isinstance(options, list):
        return set()

    found = set()
    for option in options:
        value = option.get("value") if isinstance(option, dict) else None
        if isinstance(value, str):
            found.update(alias for alias in ALIAS_LADDER if alias in value.lower())
    return found


def parse_aliases(help_text: str) -> tuple[list[str], list[str]]:
    """Collect the model aliases the CLI names, strongest first."""
    section = MODEL_LINE.search(help_text)
    quoted = {token for token in QUOTED.findall(section.group(1))} if section else set()
    named = {alias for alias in ALIAS_LADDER if alias in quoted}

    notes = []
    if not named:
        # The account cache alone would leave a one-alias pool and collapse every
        # tier onto it, so widen to the documented ladder instead.
        notes.append(
            "`--help` names no known model alias; widened to the built-in ladder "
            + ",".join(ALIAS_LADDER)
        )
        named = set(ALIAS_LADDER)

    discovered = named | extra_aliases()
    return [alias for alias in ALIAS_LADDER if alias in discovered], notes


def assign_roles(aliases: list[str]) -> tuple[dict[str, str], list[str]]:
    """Bind the strongest, median, and weakest alias to the three roles."""
    if not aliases:
        die("no model alias could be resolved")

    assigned = {
        "deep": aliases[0],
        "balanced": aliases[(len(aliases) - 1) // 2],
        "fast": aliases[-1],
    }

    notes = []
    for role in ROLES:
        if role in assigned:
            continue
        source = next((other for other in ROLE_BORROW_ORDER[role] if other in assigned), None)
        if source is not None:
            assigned[role] = assigned[source]

    if len(aliases) < len(ROLES):
        collapsed = ", ".join(f"{role}={assigned[role]}" for role in ROLES)
        notes.append(f"only {len(aliases)} alias(es) to bind; roles overlap ({collapsed})")
    return assigned, notes


def clamp_effort(requested: str, supported: list[str]) -> str | None:
    """Clamp down to the strongest supported level at or below `requested`."""
    if requested not in supported:
        # The ladder shrank; fall back to the strongest level below the request.
        ceiling = DEFAULT_EFFORTS.index(requested) if requested in DEFAULT_EFFORTS else len(DEFAULT_EFFORTS)
        below = [e for e in supported if e in DEFAULT_EFFORTS and DEFAULT_EFFORTS.index(e) <= ceiling]
        return below[-1] if below else None
    return requested


def resolve_tiers(assigned: dict[str, str], policy: tuple, supported: list[str]) -> list[dict]:
    tiers = []
    for number, (role, requested) in enumerate(policy, start=1):
        alias = assigned.get(role)
        if alias is None:
            die(f"tier{number}: no alias could be bound to the `{role}` role")

        effort = clamp_effort(requested, supported)
        if effort is None:
            die(f"tier{number}: no advertised effort level at or below `{requested}`")

        tiers.append({
            "tier": number,
            "role": role,
            "model": alias,
            "effort": effort,
            "supported_efforts": supported,
        })
    return tiers


def format_tiers(tiers: list[dict]) -> str:
    return "\n".join(
        line
        for tier in tiers
        for line in (
            f"tier{tier['tier']}_model={tier['model']}",
            f"tier{tier['tier']}_effort={tier['effort']}",
            f"tier{tier['tier']}_supported_efforts={','.join(tier['supported_efforts'])}",
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Resolve Claude Code tier models and effort levels.",
    )
    parser.add_argument(
        "--profile",
        choices=sorted(TIER_POLICY),
        default="agent",
        help="tier policy to apply (default: agent)",
    )
    parser.add_argument("--json", action="store_true", help="emit the tier table as JSON")
    parser.add_argument(
        "--all",
        action="store_true",
        help="list resolved model aliases instead of the tier table",
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
    aliases, alias_notes = parse_aliases(help_text)

    if args.all:
        for alias in aliases:
            print(alias)
        return

    efforts, effort_notes = parse_efforts(help_text)
    assigned, role_notes = assign_roles(aliases)
    for note in alias_notes + effort_notes + role_notes:
        warn(note)

    tiers = resolve_tiers(assigned, TIER_POLICY[args.profile], efforts)
    print(json.dumps(tiers, indent=2) if args.json else format_tiers(tiers))


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        # Silence the interpreter's flush-on-exit error when stdout is a closed pipe.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
