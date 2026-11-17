"""Codex models currently usable, with reasoning efforts, from `codex debug models`."""

from __future__ import annotations

import json
from math import inf

from .common import ModelSourceError, load_raw, one_line

NAME = "codex"
DEFAULT_TIMEOUT = 30.0
SOURCE_DESCRIPTION = "`codex debug models` JSON"

EFFORT_ORDER = ("low", "medium", "high", "xhigh", "max", "ultra")

# Codex folds `model_catalog_json` and any local `openai_base_url` provider into the
# same catalog, so `codex debug models` can list Ollama or other third-party models.
# The listing must stay inside OpenAI's own lineup, and the slug is the only vendor
# marker the catalog carries. `:` is Ollama's `name:tag` separator, which no Codex
# slug uses, so it rejects a locally served `gpt-oss:20b` as well.
VENDOR_PREFIXES = ("gpt", "codex")


def add_arguments(parser) -> None:
    parser.add_argument(
        "--include-deprecated",
        action="store_true",
        help="also list models scheduled for upgrade",
    )


def parse_catalog(raw: str) -> list[dict]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ModelSourceError(f"failed to parse model JSON: {exc}") from None
    if not isinstance(data, dict) or not isinstance(data.get("models"), list):
        raise ModelSourceError("unexpected schema: expected an object holding a `models` array")
    return [model for model in data["models"] if isinstance(model, dict)]


def is_vendor_model(model: dict) -> bool:
    slug = model.get("slug")
    return isinstance(slug, str) and slug.lower().startswith(VENDOR_PREFIXES) and ":" not in slug


def is_usable(model: dict) -> bool:
    # `supported_in_api` is deliberately not consulted: a catalog override reports it
    # as false even for the model `config.toml` runs by default, which would empty
    # the pool. `visibility` plus the vendor prefix is the reliable pair.
    return model.get("visibility") == "list" and is_vendor_model(model)


def is_current(model: dict) -> bool:
    return model.get("upgrade") is None


def priority_of(model: dict) -> float:
    priority = model.get("priority")
    return float(priority) if isinstance(priority, (int, float)) else inf


def supported_efforts(model: dict) -> list[str]:
    levels = model.get("supported_reasoning_levels")
    found = (
        {level.get("effort") for level in levels if isinstance(level, dict)}
        if isinstance(levels, list)
        else set()
    )
    return [effort for effort in EFFORT_ORDER if effort in found]


def upgrade_target(model: dict) -> str | None:
    upgrade = model.get("upgrade")
    target = upgrade.get("model") if isinstance(upgrade, dict) else None
    return target if isinstance(target, str) and target else None


def describe(model: dict) -> dict:
    efforts = supported_efforts(model)
    default = model.get("default_reasoning_level")
    return {
        "model": model["slug"],
        "efforts": efforts,
        "default_effort": default if default in efforts else None,
        "description": one_line(model.get("description")),
        "upgrade_to": upgrade_target(model),
    }


def list_models(options) -> list[dict]:
    catalog = parse_catalog(load_raw(options, ["codex", "debug", "models"]))
    usable = [model for model in catalog if is_usable(model)]
    if not usable:
        raise ModelSourceError(
            "`codex debug models` reported no usable OpenAI model; check "
            "`model_catalog_json` and `openai_base_url` in ~/.codex/config.toml"
        )
    pool = usable if options.include_deprecated else [m for m in usable if is_current(m)]
    if not pool:
        raise ModelSourceError(
            "every usable model is scheduled for upgrade; rerun with --include-deprecated"
        )
    # Catalog priority is the order Codex's own model picker uses.
    return [describe(model) for model in sorted(pool, key=priority_of)]


def table_columns(rows: list[dict]) -> list[tuple]:
    columns = [("DEFAULT", lambda row: row["default_effort"] or "-")]
    # Only reachable with --include-deprecated, so the default table stays narrow.
    if any(row["upgrade_to"] for row in rows):
        columns.append(("UPGRADE", lambda row: row["upgrade_to"] or "-"))
    columns.append(("DESCRIPTION", lambda row: row["description"] or "-"))
    return columns
