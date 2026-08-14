#!/usr/bin/env python3
"""Resolve agy (Antigravity CLI) tiers to (model slug, reasoning effort) from `agy models`."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

# agy exposes reasoning effort two ways: baked into the slug (`...-high`) and as a
# separate `--effort` flag. Only the slug suffix is observable here, so it is the
# source of truth; a model without one is reported as `default`.
EFFORT_ORDER = ("low", "medium", "high")
NO_EFFORT = "default"

# Ordered strongest to weakest. Role names stay stable even when model names do not.
ROLES = ("deep", "balanced", "fast")

# Slug keywords, since `agy models` carries no capability metadata to rank on.
ROLE_KEYWORDS = {
    "deep": ("pro", "opus", "ultra", "max"),
    "balanced": ("sonnet", "balanced"),
    "fast": ("flash", "mini", "lite", "small", "haiku", "oss", "turbo"),
}

# When a role has no model of its own, borrow from the nearest neighbour so every
# tier stays answerable on a thin model lineup.
ROLE_BORROW_ORDER = {
    "deep": ("balanced", "fast"),
    "balanced": ("deep", "fast"),
    "fast": ("balanced", "deep"),
}

# Tier -> (role, requested effort). The effort is a ceiling, clamped down to what
# the resolved model family actually offers.
TIER_POLICY = {
    "review": (
        ("fast", "medium"),
        ("balanced", "medium"),
        ("deep", "medium"),
        ("deep", "high"),
    ),
}

# Matched in order; the first hit wins. `gpt-oss-120b` deliberately matches none
# of these, so a parameter count never masquerades as a version number.
VERSION_PATTERNS = (
    re.compile(r"(\d+)\.(\d+)"),
    re.compile(r"-(\d+)-(\d+)(?:-|$)"),
)


def die(message: str) -> NoReturn:
    sys.exit(f"error: {message}")


def warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


def run_agy(timeout: float) -> str:
    try:
        return subprocess.run(
            ["agy", "models"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=True,
        ).stdout
    except FileNotFoundError:
        die("`agy` executable not found in PATH")
    except subprocess.TimeoutExpired:
        die(f"`agy models` timed out after {timeout:g}s")
    except subprocess.CalledProcessError as exc:
        die(f"`agy models` failed (exit {exc.returncode}): {exc.stderr.strip()}")


def load_slugs(source: str | None, timeout: float) -> list[str]:
    if source is None:
        raw = run_agy(timeout)
    else:
        try:
            raw = Path(source).read_text(encoding="utf-8")
        except OSError as exc:
            die(f"cannot read {source}: {exc}")

    slugs = [
        line.split("\t", 1)[0].strip()
        for line in raw.splitlines()
        if "\t" in line and line.split("\t", 1)[0].strip()
    ]
    if not slugs:
        die("`agy models` produced no `<slug>\\t<label>` lines")
    return slugs


def split_effort(slug: str) -> tuple[str, str]:
    """Return (family base, effort). Effort is NO_EFFORT when the slug carries none."""
    base, _, tail = slug.rpartition("-")
    return (base, tail) if base and tail in EFFORT_ORDER else (slug, NO_EFFORT)


def version_of(base: str) -> float:
    for pattern in VERSION_PATTERNS:
        if match := pattern.search(base):
            return float(f"{match.group(1)}.{match.group(2)}")
    return 0.0


def role_of(base: str) -> str | None:
    lowered = base.lower()
    return next(
        (role for role in ROLES if any(word in lowered for word in ROLE_KEYWORDS[role])),
        None,
    )


def build_families(slugs: list[str]) -> list[dict]:
    """Group slugs into model families, keeping each family's effort variants together."""
    families: dict[str, dict] = {}
    for order, slug in enumerate(slugs):
        base, effort = split_effort(slug)
        family = families.setdefault(
            base,
            {"base": base, "order": order, "version": version_of(base), "variants": {}},
        )
        family["variants"].setdefault(effort, slug)
    return list(families.values())


def strength_key(family: dict) -> tuple:
    """Rank families without trusting names: version first, then listing order."""
    return (family["version"], -family["order"])


def assign_roles(families: list[dict]) -> tuple[dict[str, dict], list[str]]:
    """Bind every role to a family: keyword match, then strength ranking, then borrowing."""
    assigned: dict[str, dict] = {}
    leftovers: list[dict] = []
    for family in families:
        role = role_of(family["base"])
        if role is None:
            leftovers.append(family)
        elif role not in assigned or strength_key(family) > strength_key(assigned[role]):
            if role in assigned:
                leftovers.append(assigned[role])
            assigned[role] = family
        else:
            leftovers.append(family)

    notes: list[str] = []
    leftovers.sort(key=strength_key, reverse=True)

    for role in ROLES:
        if role in assigned or not leftovers:
            continue
        # `fast` wants the weakest leftover; the stronger roles want the strongest.
        family = leftovers.pop(-1 if role == "fast" else 0)
        assigned[role] = family
        notes.append(
            f"role `{role}` matched no slug keyword; "
            f"fell back to strength ranking -> {family['base']}"
        )

    for role in ROLES:
        if role in assigned:
            continue
        source = next((other for other in ROLE_BORROW_ORDER[role] if other in assigned), None)
        if source is None:
            continue
        assigned[role] = assigned[source]
        notes.append(f"role `{role}` has no distinct model; reusing the `{source}` model")

    return assigned, notes


def supported_efforts(family: dict) -> list[str]:
    return [effort for effort in EFFORT_ORDER if effort in family["variants"]]


def clamp_effort(requested: str, supported: list[str]) -> str | None:
    ceiling = EFFORT_ORDER.index(requested)
    return next(
        (effort for effort in reversed(supported) if EFFORT_ORDER.index(effort) <= ceiling),
        None,
    )


def resolve_tiers(assigned: dict[str, dict], policy: tuple) -> list[dict]:
    tiers = []
    for number, (role, requested) in enumerate(policy, start=1):
        family = assigned.get(role)
        if family is None:
            die(f"tier{number}: no available model could be bound to the `{role}` role")

        variants = family["variants"]
        supported = supported_efforts(family)
        effort = clamp_effort(requested, supported) if supported else None

        if effort is None and NO_EFFORT in variants:
            # A family may mix a level-free slug with level variants; the level-free
            # one still answers the tier when nothing sits at or below the ceiling.
            effort = NO_EFFORT
        elif effort is None:
            # Every variant sits above the ceiling. Overshooting beats leaving the
            # tier unanswered, so take the cheapest one and say so.
            effort = supported[0]
            warn(
                f"tier{number}: {family['base']} offers no level at or below `{requested}`; "
                f"using `{effort}`"
            )

        slug = variants[effort]

        tiers.append({
            "tier": number,
            "role": role,
            "model": slug,
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
    parser = argparse.ArgumentParser(description="Resolve agy tier models and reasoning efforts.")
    parser.add_argument(
        "--profile",
        choices=sorted(TIER_POLICY),
        default="review",
        help="tier policy to apply (default: review)",
    )
    parser.add_argument("--json", action="store_true", help="emit the tier table as JSON")
    parser.add_argument("--all", action="store_true", help="list model slugs instead of tiers")
    parser.add_argument(
        "--from-file",
        metavar="PATH",
        help="read `agy models` output from PATH instead of running agy",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        metavar="SECONDS",
        help="timeout for `agy models` (default: 30)",
    )
    args = parser.parse_args()

    slugs = load_slugs(args.from_file, args.timeout)
    if args.all:
        print("\n".join(slugs))
        return

    assigned, notes = assign_roles(build_families(slugs))
    for note in notes:
        warn(note)

    tiers = resolve_tiers(assigned, TIER_POLICY[args.profile])
    if args.json:
        import json

        print(json.dumps(tiers, indent=2))
    else:
        print(format_tiers(tiers))


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        # Silence the interpreter's flush-on-exit error when stdout is a closed pipe.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
