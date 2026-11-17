"""Models pi can actually reach, with pricing, context, and thinking levels."""

from __future__ import annotations

import json
import os
import re
from math import inf
from pathlib import Path

from .common import ModelSourceError, load_raw, warn

NAME = "pi"
DEFAULT_TIMEOUT = 60.0
SOURCE_DESCRIPTION = "`pi --list-models` output"

# pi's own level ladder, weakest to strongest (see `getSupportedThinkingLevels` in pi-ai).
THINKING_LEVELS = ("off", "minimal", "low", "medium", "high", "xhigh", "max")

LISTING_COLUMNS = 6
SIZE_PATTERN = re.compile(r"^([\d.]+)([KM]?)$", re.IGNORECASE)
SIZE_UNITS = {"": 1, "K": 1_000, "M": 1_000_000}

# A dotted number inside a model id. A number suffixed with `b` is a parameter count
# (`gpt-oss-120b`, `Llama-3.3-70B`), never a version.
VERSION_TOKEN = re.compile(r"(?<![\d.])\d+(?:\.\d+)*(?![\d.]|[bB](?![a-zA-Z]))")


def add_arguments(parser) -> None:
    parser.add_argument(
        "--favorites",
        action="store_true",
        help="list only the models in favorite-models.json",
    )
    parser.add_argument(
        "--sort",
        choices=("name", "strength"),
        default="name",
        help="row order: provider, then model lines and versions newest first; "
        "or most capable first by pricing (default: name)",
    )


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
        if len(parts) < LISTING_COLUMNS or parts[0] == "provider":
            continue
        provider, model_id, context, _max_out, thinking, _images = parts[:LISTING_COLUMNS]
        available.append({
            "provider": provider,
            "id": model_id,
            "listed_context": parse_size(context),
            "listed_reasoning": thinking.lower() == "yes",
        })
    if not available:
        raise ModelSourceError("`pi --list-models` reported no usable models")
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


def cost_of(model: dict, kind: str) -> float:
    cost = model.get("cost")
    value = cost.get(kind) if isinstance(cost, dict) else None
    return float(value) if isinstance(value, (int, float)) else -1.0


def strength(model: dict) -> tuple[float, float, float, int]:
    """Provider pricing is the most reliable capability proxy available here; context
    window and reasoning headroom only break ties."""
    supported = supported_thinking(model)
    ceiling = THINKING_LEVELS.index(supported[-1]) if supported else -1
    return (
        cost_of(model, "output"),
        cost_of(model, "input"),
        float(model.get("contextWindow") or 0),
        ceiling,
    )


def version_of(model: dict) -> tuple[int, ...]:
    """First version token of the model name as a numeric tuple, so `5.10` outranks `5.6`."""
    match = VERSION_TOKEN.search(model["slug"].rpartition("/")[2])
    return tuple(int(part) for part in match.group().split(".")) if match else ()


def line_of(model: dict) -> tuple[str, str]:
    """(namespace, name with its version masked), so `gpt-6-sol` and `gpt-5.6-sol` share a
    line. An aggregator's model namespace counts as the provider (`together/zai-org`),
    since versions of different vendors are not comparable."""
    namespace, _, name = model["slug"].rpartition("/")
    return (namespace.casefold(), VERSION_TOKEN.sub("*", name, count=1).casefold())


def listing_order(catalog: list[dict]) -> list[dict]:
    """Providers by name; within one, lines by their newest version descending (name breaks
    ties); within a line, newest version first. Chained stable sorts, last key applied last."""
    newest: dict[tuple[str, str], tuple[int, ...]] = {}
    for model in catalog:
        line = line_of(model)
        newest[line] = max(newest.get(line, ()), version_of(model))

    ranked = sorted(catalog, key=version_of, reverse=True)
    ranked.sort(key=lambda model: line_of(model)[1])
    ranked.sort(key=lambda model: newest[line_of(model)], reverse=True)
    ranked.sort(key=lambda model: line_of(model)[0])
    return ranked


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
    best: dict[str, tuple] = {}
    for model in catalog:
        rank = (preference.get(model["provider"], inf), model["provider"])
        current = best.get(model["id"])
        if current is None or rank < current[0]:
            best[model["id"]] = (rank, model)
    return [model for _, model in best.values()]


def favorite_keys(config: Path) -> set[tuple[str, str]]:
    store = read_json(config / "favorite-models.json", "favorite-models.json") or {}
    return {
        (item.get("provider"), item.get("modelId"))
        for item in store.get("items") or []
        if isinstance(item, dict)
    }


def describe(model: dict, favorites: set[tuple[str, str]]) -> dict:
    output_cost = cost_of(model, "output")
    input_cost = cost_of(model, "input")
    return {
        "model": model["slug"],
        "efforts": supported_thinking(model),
        "input_cost": input_cost if input_cost >= 0 else None,
        "output_cost": output_cost if output_cost >= 0 else None,
        "context": int(model.get("contextWindow") or 0),
        "favorite": (model["provider"], model["id"]) in favorites,
    }


def list_models(options) -> list[dict]:
    raw = load_raw(options, ["pi", "--list-models"])
    config = config_dir()
    store = read_json(config / "models-store.json", "models-store.json")
    catalog = dedupe(build_catalog(parse_listing(raw), store), provider_preference(config))
    if not catalog:
        raise ModelSourceError(
            "no model survived the availability join; run `pi update` and check `pi auth check`"
        )

    favorites = favorite_keys(config)
    ranked = (
        listing_order(catalog)
        if options.sort == "name"
        else sorted(catalog, key=strength, reverse=True)
    )
    rows = [describe(model, favorites) for model in ranked]
    if options.favorites:
        rows = [row for row in rows if row["favorite"]]
        if not rows:
            raise ModelSourceError(
                "no favorite model is currently reachable; drop --favorites or run `pi auth check`"
            )
    return rows


def format_cost(value: float | None) -> str:
    return f"{value:g}" if value is not None else "-"


def table_columns(rows: list[dict]) -> list[tuple]:
    return [
        ("IN$/M", lambda row: format_cost(row["input_cost"])),
        ("OUT$/M", lambda row: format_cost(row["output_cost"])),
        ("CONTEXT", lambda row: format_size(row["context"])),
        ("FAV", lambda row: "*" if row["favorite"] else ""),
    ]
