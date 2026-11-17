#!/usr/bin/env python3
"""List the Codex models currently usable, with reasoning efforts, from `codex debug models`."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from math import inf
from pathlib import Path
from typing import NoReturn

EFFORT_ORDER = ("low", "medium", "high", "xhigh", "max", "ultra")

# Codex folds `model_catalog_json` and any local `openai_base_url` provider into the
# same catalog, so `codex debug models` can list Ollama or other third-party models.
# The listing must stay inside OpenAI's own lineup, and the slug is the only vendor
# marker the catalog carries. `:` is Ollama's `name:tag` separator, which no Codex
# slug uses, so it rejects a locally served `gpt-oss:20b` as well.
VENDOR_PREFIXES = ("gpt", "codex")


def die(message: str) -> NoReturn:
    sys.exit(f"error: {message}")


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


def is_vendor_model(model: dict) -> bool:
    slug = model.get("slug")
    return (
        isinstance(slug, str)
        and slug.lower().startswith(VENDOR_PREFIXES)
        and ":" not in slug
    )


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
        "default_effort": default if default in efforts else None,
        "efforts": efforts,
        # Collapse embedded newlines so each model stays on one table row.
        "description": " ".join(str(model.get("description") or "").split()),
        "upgrade_to": upgrade_target(model),
    }


def format_table(rows: list[dict]) -> str:
    """Fixed-width columns; DESCRIPTION stays last because it contains spaces."""
    header = ["MODEL", "DEFAULT", "EFFORTS", "DESCRIPTION"]
    cells = [
        [
            row["model"],
            row["default_effort"] or "-",
            ",".join(row["efforts"]) or "-",
            row["description"] or "-",
        ]
        for row in rows
    ]
    # Only reachable with --include-deprecated, so the default table keeps four columns.
    if any(row["upgrade_to"] for row in rows):
        header.insert(3, "UPGRADE")
        for cell, row in zip(cells, rows):
            cell.insert(3, row["upgrade_to"] or "-")

    table = [header, *cells]
    widths = [max(len(line[i]) for line in table) for i in range(len(header))]
    return "\n".join(
        "  ".join(cell.ljust(widths[i]) for i, cell in enumerate(line)).rstrip()
        for line in table
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="List the Codex models currently usable.")
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--json", action="store_true", help="emit the model list as JSON")
    output.add_argument(
        "--slugs",
        action="store_true",
        help="print bare model slugs, one per line",
    )
    parser.add_argument(
        "--include-deprecated",
        action="store_true",
        help="also list models scheduled for upgrade",
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
        die(
            "`codex debug models` reported no usable OpenAI model; check "
            "`model_catalog_json` and `openai_base_url` in ~/.codex/config.toml"
        )

    pool = usable if args.include_deprecated else [m for m in usable if is_current(m)]
    if not pool:
        die("every usable model is scheduled for upgrade; rerun with --include-deprecated")

    # Catalog priority is the order Codex's own model picker uses.
    rows = [describe(model) for model in sorted(pool, key=priority_of)]
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
