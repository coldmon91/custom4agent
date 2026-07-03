#!/usr/bin/env python3
"""Print Codex model slugs from `codex debug models`."""

import argparse
import json
import re
import subprocess
import sys
from math import inf

EXCLUDED = re.compile(r"mini|oss|auto|spark", re.I)
MINI = re.compile(r"mini", re.I)


def die(message: str) -> None:
    sys.exit(f"error: {message}")


def load_models() -> list[dict]:
    try:
        data = json.loads(subprocess.run(
            ["codex", "debug", "models"],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        ).stdout)
    except FileNotFoundError:
        die("`codex` executable not found in PATH")
    except subprocess.TimeoutExpired:
        die("`codex debug models` timed out")
    except subprocess.CalledProcessError as exc:
        die(f"`codex debug models` failed (exit {exc.returncode}): {exc.stderr.strip()}")
    except json.JSONDecodeError as exc:
        die(f"failed to parse JSON output: {exc}")
    return data.get("models", []) if isinstance(data, dict) else []


def is_usable(model: dict) -> bool:
    return model.get("visibility") == "list" and model.get("supported_in_api") is True


def slugs(models, keep=lambda _: True) -> list[str]:
    return [
        name
        for model in sorted(models, key=lambda model: model.get("priority", inf))
        if (name := model.get("slug", "")) and keep(name)
    ]


def pick(models, keep) -> str:
    return next(iter(slugs(models, keep)), "")


def main() -> None:
    parser = argparse.ArgumentParser(description="Query Codex model slugs.")
    parser.add_argument("--all", action="store_true", help="list every usable model slug")
    args = parser.parse_args()

    usable = [model for model in load_models() if is_usable(model)]

    if args.all:
        for model_slug in slugs(usable):
            print(model_slug)
        return

    candidates = [model for model in usable if model.get("upgrade") is None]
    print(f"{pick(candidates, lambda name: not EXCLUDED.search(name))}\t{pick(candidates, MINI.search)}")


if __name__ == "__main__":
    main()
