#!/usr/bin/env python3
"""Resolve pi tiers to (provider/model, thinking level) from the pi model catalog."""

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

# pi's own level ladder, weakest to strongest (see `getSupportedThinkingLevels` in pi-ai).
THINKING_LEVELS = ("off", "minimal", "low", "medium", "high", "xhigh", "max")

# Ordered strongest to weakest. Role names stay stable even when model names do not.
ROLES = ("deep", "balanced", "fast")

# Tier -> (role, requested thinking level). The level is a ceiling, clamped down to
# what the resolved model actually supports so pi's own upward clamp never fires.
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

SIZE_PATTERN = re.compile(r"^([\d.]+)([KM]?)$", re.IGNORECASE)
SIZE_UNITS = {"": 1, "K": 1_000, "M": 1_000_000}


def die(message: str) -> NoReturn:
    sys.exit(f"error: {message}")


def warn(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


def config_dir() -> Path:
    override = os.environ.get("PI_CODING_AGENT_DIR", "").strip()
    return Path(override).expanduser() if override else Path.home() / ".pi" / "agent"


def read_json(path: Path, label: str) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError) as exc:
        warn(f"cannot read {label} ({path}): {exc}")
        return None


def run_pi_list(timeout: float) -> str:
    try:
        return subprocess.run(
            ["pi", "--list-models"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=True,
        ).stdout
    except FileNotFoundError:
        die("`pi` executable not found in PATH")
    except subprocess.TimeoutExpired:
        die(f"`pi --list-models` timed out after {timeout:g}s")
    except subprocess.CalledProcessError as exc:
        die(f"`pi --list-models` failed (exit {exc.returncode}): {exc.stderr.strip()}")


def parse_size(token: str) -> float:
    match = SIZE_PATTERN.match(token)
    if not match:
        return 0.0
    return float(match.group(1)) * SIZE_UNITS[match.group(2).upper()]


def parse_listing(raw: str) -> list[dict]:
    """Parse `pi --list-models` rows. This listing is the availability gate: it only
    shows models the current credentials can actually reach."""
    available = []
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) < 6 or parts[0] == "provider":
            continue
        provider, model_id, context, _max_out, thinking, _images = parts[:6]
        available.append({
            "provider": provider,
            "id": model_id,
            "listed_context": parse_size(context),
            "listed_reasoning": thinking.lower() == "yes",
        })
    if not available:
        die("`pi --list-models` reported no usable models")
    return available


def supported_thinking(model: dict) -> list[str]:
    """Mirror of pi's `getSupportedThinkingLevels`: a null entry in `thinkingLevelMap`
    marks the level unsupported, and `xhigh`/`max` need an explicit entry to count."""
    if not model.get("reasoning"):
        return ["off"]
    level_map = model.get("thinkingLevelMap") or {}
    supported = []
    for level in THINKING_LEVELS:
        if level in level_map and level_map[level] is None:
            continue
        if level in ("xhigh", "max") and level not in level_map:
            continue
        supported.append(level)
    return supported


def clamp_thinking(requested: str, supported: list[str]) -> str | None:
    """Clamp down to the strongest supported level at or below `requested`.

    pi clamps upward first, which would silently raise cost, so the ceiling is
    enforced here instead and pi receives a level it already supports.
    """
    ceiling = THINKING_LEVELS.index(requested)
    return next(
        (level for level in reversed(supported) if THINKING_LEVELS.index(level) <= ceiling),
        None,
    )


def output_cost(model: dict) -> float:
    cost = model.get("cost")
    value = cost.get("output") if isinstance(cost, dict) else None
    return float(value) if isinstance(value, (int, float)) else -1.0


def input_cost(model: dict) -> float:
    cost = model.get("cost")
    value = cost.get("input") if isinstance(cost, dict) else None
    return float(value) if isinstance(value, (int, float)) else -1.0


def strength(model: dict) -> tuple[float, float, float, int]:
    """Provider pricing is the most reliable capability proxy available here; context
    window and reasoning headroom only break ties."""
    supported = supported_thinking(model)
    ceiling = THINKING_LEVELS.index(supported[-1]) if supported else -1
    return (output_cost(model), input_cost(model), float(model.get("contextWindow") or 0), ceiling)


def build_catalog(available: list[dict], store: dict | None) -> list[dict]:
    """Join the availability listing with the persisted catalog, which carries the
    pricing and thinking metadata the listing omits."""
    by_key = {}
    for provider, entry in (store or {}).items():
        if not isinstance(entry, dict):
            continue
        for model in entry.get("models") or []:
            if isinstance(model, dict) and model.get("id"):
                by_key[(provider, model["id"])] = model

    catalog = []
    missing = []
    for row in available:
        key = (row["provider"], row["id"])
        model = dict(by_key.get(key) or {})
        if not model:
            missing.append(f"{key[0]}/{key[1]}")
            model = {"reasoning": row["listed_reasoning"], "contextWindow": row["listed_context"]}
        model["provider"] = row["provider"]
        model["id"] = row["id"]
        model["slug"] = f"{row['provider']}/{row['id']}"
        catalog.append(model)

    if missing:
        warn(
            "no cached metadata for "
            + ", ".join(missing[:5])
            + (" ..." if len(missing) > 5 else "")
            + "; ranked as lowest cost. Run `pi update` to refresh the catalog."
        )
    return catalog


def provider_preference(config: Path) -> dict[str, int]:
    """Rank providers by how recently the user chose them, so duplicated model ids
    (e.g. the regional `-cn` mirrors) collapse onto the one actually in use."""
    ranking: dict[str, int] = {}
    for name in ("favorite-models.json", "recent-models.json"):
        store = read_json(config / name, name) or {}
        for item in store.get("items") or []:
            provider = item.get("provider")
            if isinstance(provider, str):
                ranking.setdefault(provider, len(ranking))
    return ranking


def dedupe(catalog: list[dict], preference: dict[str, int]) -> list[dict]:
    best: dict[str, dict] = {}
    for model in catalog:
        rank = (preference.get(model["provider"], inf), model["provider"])
        current = best.get(model["id"])
        if current is None or rank < current["_rank"]:
            best[model["id"]] = {**model, "_rank": rank}
    return [{k: v for k, v in model.items() if k != "_rank"} for model in best.values()]


def favorite_pool(config: Path, catalog: list[dict]) -> list[dict]:
    store = read_json(config / "favorite-models.json", "favorite-models.json") or {}
    wanted = {
        (item.get("provider"), item.get("modelId"))
        for item in store.get("items") or []
        if isinstance(item, dict)
    }
    return [model for model in catalog if (model["provider"], model["id"]) in wanted]


def assign_roles(pool: list[dict]) -> tuple[dict[str, dict], list[str]]:
    """Bind the strongest, median, and weakest model of the pool to the three roles."""
    ranked = sorted(pool, key=strength, reverse=True)
    if not ranked:
        return {}, []

    assigned = {
        "deep": ranked[0],
        "balanced": ranked[(len(ranked) - 1) // 2],
        "fast": ranked[-1],
    }
    notes = []
    if len(ranked) < 3:
        collapsed = ", ".join(f"{role}={assigned[role]['slug']}" for role in ROLES)
        notes.append(f"only {len(ranked)} model(s) to bind; roles overlap ({collapsed})")
    return assigned, notes


def resolve_pool(config: Path, catalog: list[dict]) -> tuple[list[dict], list[str]]:
    favorites = favorite_pool(config, catalog)
    if len(favorites) >= len(ROLES):
        return favorites, []
    if favorites:
        note = (
            f"only {len(favorites)} favorite model(s) available; "
            "widened the pool to the full catalog"
        )
    else:
        note = "no favorite models available; using the full catalog"
    return catalog, [note]


def resolve_tiers(assigned: dict[str, dict], policy: tuple) -> list[dict]:
    tiers = []
    for number, (role, requested) in enumerate(policy, start=1):
        model = assigned.get(role)
        if model is None:
            die(f"tier{number}: no available model could be bound to the `{role}` role")

        supported = supported_thinking(model)
        level = clamp_thinking(requested, supported)
        if level is None:
            die(f"tier{number}: {model['slug']} supports no thinking level at or below `{requested}`")

        tiers.append({
            "tier": number,
            "role": role,
            "model": model["slug"],
            "thinking": level,
            "supported_thinking": supported,
        })
    return tiers


def format_tiers(tiers: list[dict]) -> str:
    return "\n".join(
        line
        for tier in tiers
        for line in (
            f"tier{tier['tier']}_model={tier['model']}",
            f"tier{tier['tier']}_thinking={tier['thinking']}",
            f"tier{tier['tier']}_supported_thinking={','.join(tier['supported_thinking'])}",
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Resolve pi tier models and thinking levels.")
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
        help="list available `provider/model` slugs instead of the tier table",
    )
    parser.add_argument(
        "--from-file",
        metavar="PATH",
        help="read `pi --list-models` output from PATH instead of running pi",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        metavar="SECONDS",
        help="timeout for `pi --list-models` (default: 60)",
    )
    args = parser.parse_args()

    if args.from_file:
        try:
            raw = Path(args.from_file).read_text(encoding="utf-8")
        except OSError as exc:
            die(f"cannot read {args.from_file}: {exc}")
    else:
        raw = run_pi_list(args.timeout)

    config = config_dir()
    store = read_json(config / "models-store.json", "models-store.json")
    catalog = dedupe(build_catalog(parse_listing(raw), store), provider_preference(config))
    if not catalog:
        die("no model survived the availability join; run `pi update` and check `pi auth check`")

    if args.all:
        for model in sorted(catalog, key=strength, reverse=True):
            print(model["slug"])
        return

    pool, notes = resolve_pool(config, catalog)
    assigned, role_notes = assign_roles(pool)
    for note in notes + role_notes:
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
