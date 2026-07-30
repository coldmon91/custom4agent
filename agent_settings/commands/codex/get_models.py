#!/usr/bin/env python3
"""Resolve Codex tiers to (model, reasoning effort) from `codex debug models`."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from math import inf
from pathlib import Path
from typing import NoReturn

EFFORT_ORDER = ("low", "medium", "high", "xhigh", "max", "ultra")

# Ordered strongest to weakest. Role names are stable even when model names are not.
ROLES = ("deep", "balanced", "fast")

# Layer 1 signals: provider-authored naming and prose. Cheap to extend, and the
# description keywords keep working for models that carry no variant suffix
# (e.g. `gpt-5.5`), which a suffix-only match would silently drop.
ROLE_SUFFIXES = {"sol": "deep", "terra": "balanced", "luna": "fast"}
ROLE_KEYWORDS = {
    "deep": ("frontier", "flagship", "hardest", "complex", "reasoning"),
    "balanced": ("balanced", "everyday", "general"),
    "fast": ("fast", "affordable", "cost-efficient", "throughput", "simple", "lightweight"),
}
SUFFIX_WEIGHT = 3

# Layer 3: when even capability ranking runs out of models, borrow from a neighbour
# role so every tier stays answerable on a single-model account.
ROLE_BORROW_ORDER = {
    "deep": ("balanced", "fast"),
    "balanced": ("deep", "fast"),
    "fast": ("balanced", "deep"),
}

# Tier -> (role, requested effort). The effort is a ceiling, clamped down to what
# the resolved model actually supports.
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

VERSION_PATTERN = re.compile(r"(\d+(?:\.\d+)?)")


def die(message: str) -> NoReturn:
    sys.exit(f"error: {message}")


def warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


def run_codex(timeout: float) -> str:
    try:
        return subprocess.run(
            ["codex", "debug", "models"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=True,
        ).stdout
    except FileNotFoundError:
        die("`codex` executable not found in PATH")
    except subprocess.TimeoutExpired:
        die(f"`codex debug models` timed out after {timeout:g}s")
    except subprocess.CalledProcessError as exc:
        die(f"`codex debug models` failed (exit {exc.returncode}): {exc.stderr.strip()}")


def load_models(source: str | None, timeout: float) -> list[dict]:
    if source is None:
        raw = run_codex(timeout)
    else:
        try:
            raw = Path(source).read_text(encoding="utf-8")
        except OSError as exc:
            die(f"cannot read {source}: {exc}")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        die(f"failed to parse model JSON: {exc}")

    if not isinstance(data, dict) or not isinstance(data.get("models"), list):
        die("unexpected schema: expected an object holding a `models` array")
    return [model for model in data["models"] if isinstance(model, dict)]


def is_usable(model: dict) -> bool:
    return model.get("visibility") == "list" and model.get("supported_in_api") is True


def is_current(model: dict) -> bool:
    return model.get("upgrade") is None


def priority_of(model: dict) -> float:
    priority = model.get("priority")
    return float(priority) if isinstance(priority, (int, float)) else inf


def version_of(model: dict) -> float:
    match = VERSION_PATTERN.search(model.get("slug", ""))
    return float(match.group(1)) if match else 0.0


def supported_efforts(model: dict) -> list[str]:
    levels = model.get("supported_reasoning_levels")
    found = (
        {level.get("effort") for level in levels if isinstance(level, dict)}
        if isinstance(levels, list)
        else set()
    )
    return [effort for effort in EFFORT_ORDER if effort in found]


def role_score(model: dict, role: str) -> int:
    slug = model.get("slug", "").lower()
    description = model.get("description", "").lower()
    suffix = slug.rsplit("-", 1)[-1]
    score = SUFFIX_WEIGHT if ROLE_SUFFIXES.get(suffix) == role else 0
    return score + sum(keyword in description for keyword in ROLE_KEYWORDS[role])


def capability_rank(model: dict) -> tuple[int, float, float]:
    """Name-independent strength proxy: reasoning headroom, then version, then priority."""
    supported = supported_efforts(model)
    ceiling = EFFORT_ORDER.index(supported[-1]) if supported else -1
    return (ceiling, version_of(model), -priority_of(model))


def assign_roles(candidates: list[dict]) -> tuple[dict[str, dict], list[str]]:
    """Bind every role to a model through three layers, degrading instead of failing.

    1. Naming and description signals, greedily and one model per role.
    2. Capability ranking for roles no signal matched, so unknown model names still land.
    3. Borrowing from a neighbouring role when models simply run out.
    """
    ranked = [
        (score, -priority_of(model), role, index)
        for role in ROLES
        for index, model in enumerate(candidates)
        if (score := role_score(model, role)) > 0
    ]
    ranked.sort(reverse=True)

    assigned: dict[str, dict] = {}
    taken: set[int] = set()
    for _, _, role, index in ranked:
        if role not in assigned and index not in taken:
            assigned[role] = candidates[index]
            taken.add(index)

    notes: list[str] = []
    leftovers = [model for index, model in enumerate(candidates) if index not in taken]
    leftovers.sort(key=capability_rank, reverse=True)

    for role in ROLES:
        if role in assigned or not leftovers:
            continue
        # `fast` wants the weakest leftover; the stronger roles want the strongest.
        model = leftovers.pop(-1 if role == "fast" else 0)
        assigned[role] = model
        notes.append(
            f"role `{role}` matched no naming or description signal; "
            f"fell back to capability ranking -> {model.get('slug', '')}"
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


def clamp_effort(requested: str, supported: list[str]) -> str | None:
    ceiling = EFFORT_ORDER.index(requested)
    return next(
        (effort for effort in reversed(supported) if EFFORT_ORDER.index(effort) <= ceiling),
        None,
    )


def resolve_tiers(assigned: dict[str, dict], policy: tuple) -> list[dict]:
    tiers = []
    for number, (role, requested) in enumerate(policy, start=1):
        model = assigned.get(role)
        if model is None:
            die(f"tier{number}: no available model could be bound to the `{role}` role")

        slug = model.get("slug", "")
        supported = supported_efforts(model)
        if not supported:
            die(f"tier{number}: {slug} reports no supported reasoning levels")

        effort = clamp_effort(requested, supported)
        if effort is None:
            die(f"tier{number}: {slug} supports no reasoning level at or below `{requested}`")

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
    parser = argparse.ArgumentParser(
        description="Resolve Codex tier models and reasoning efforts.",
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
        help="list usable model slugs instead of the tier table",
    )
    parser.add_argument(
        "--include-deprecated",
        action="store_true",
        help="with --all, also list models scheduled for upgrade",
    )
    parser.add_argument(
        "--from-file",
        metavar="PATH",
        help="read `codex debug models` JSON from PATH instead of running codex",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        metavar="SECONDS",
        help="timeout for `codex debug models` (default: 30)",
    )
    args = parser.parse_args()

    usable = [model for model in load_models(args.from_file, args.timeout) if is_usable(model)]
    if not usable:
        die("`codex debug models` reported no usable models")

    if args.all:
        pool = usable if args.include_deprecated else [m for m in usable if is_current(m)]
        for model in sorted(pool, key=priority_of):
            if slug := model.get("slug"):
                print(slug)
        return

    candidates = [model for model in usable if is_current(model) and model.get("slug")]
    if not candidates:
        die("every usable model is scheduled for upgrade; no current model to resolve")

    assigned, notes = assign_roles(candidates)
    for note in notes:
        warn(note)

    tiers = resolve_tiers(assigned, TIER_POLICY[args.profile])
    print(json.dumps(tiers, indent=2) if args.json else format_tiers(tiers))


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        # Silence the interpreter's flush-on-exit error when stdout is a closed pipe.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
