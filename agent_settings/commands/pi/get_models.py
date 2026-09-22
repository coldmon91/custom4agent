#!/usr/bin/env python3
"""List the models pi can actually reach, with pricing, context, and thinking levels."""

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


def format_size(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.2f}".rstrip("0").rstrip(".") + "M"
    if value >= 1_000:
        return f"{round(value / 1_000):g}K"
    return f"{value:g}" if value else "-"


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
            + "; listed with unknown pricing. Run `pi update` to refresh the catalog."
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


def favorite_keys(config: Path) -> set[tuple[str, str]]:
    store = read_json(config / "favorite-models.json", "favorite-models.json") or {}
    return {
        (item.get("provider"), item.get("modelId"))
        for item in store.get("items") or []
        if isinstance(item, dict)
    }


def describe(model: dict, favorites: set[tuple[str, str]]) -> dict:
    out = output_cost(model)
    inp = input_cost(model)
    return {
        "model": model["slug"],
        "input_cost": inp if inp >= 0 else None,
        "output_cost": out if out >= 0 else None,
        "context": int(model.get("contextWindow") or 0),
        "thinking": supported_thinking(model),
        "favorite": (model["provider"], model["id"]) in favorites,
    }


def format_table(rows: list[dict]) -> str:
    """Fixed-width columns so a caller can read a row without splitting on whitespace
    that also appears inside the thinking list."""
    header = ("MODEL", "IN$/M", "OUT$/M", "CONTEXT", "FAV", "THINKING")

    def cost(value: float | None) -> str:
        return f"{value:g}" if value is not None else "-"

    cells = [header] + [
        (
            row["model"],
            cost(row["input_cost"]),
            cost(row["output_cost"]),
            format_size(row["context"]),
            "*" if row["favorite"] else "",
            ",".join(row["thinking"]),
        )
        for row in rows
    ]
    widths = [max(len(row[i]) for row in cells) for i in range(len(header))]
    return "\n".join(
        "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(row)).rstrip() for row in cells
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="List the models pi can currently use.")
    parser.add_argument("--json", action="store_true", help="emit the model list as JSON")
    parser.add_argument(
        "--favorites",
        action="store_true",
        help="list only the models in favorite-models.json",
    )
    parser.add_argument(
        "--slugs",
        action="store_true",
        help="print bare `provider/model` slugs, one per line",
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

    favorites = favorite_keys(config)
    rows = [describe(model, favorites) for model in sorted(catalog, key=strength, reverse=True)]
    if args.favorites:
        rows = [row for row in rows if row["favorite"]]
        if not rows:
            die("no favorite model is currently reachable; drop --favorites or run `pi auth check`")

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
