#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_EXCLUDED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vscode",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".pytest_cache",
    "__pycache__",
}

SOURCE_EXTENSIONS = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".go",
    ".h",
    ".hpp",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".kts",
    ".m",
    ".mm",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".swift",
    ".ts",
    ".tsx",
}

TEST_MARKERS = ("test", "tests", "spec", "__tests__")


@dataclass
class FileRecord:
    path: str
    extension: str
    kind: str
    depth: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a lightweight project map for structure and file naming decisions."
    )
    parser.add_argument("root", help="Project root to scan.")
    parser.add_argument(
        "--output-dir",
        help="Directory that will receive project-map.md and project-map.json. Defaults to <root>/.claude/project-structure.",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=4,
        help="Maximum directory depth to traverse from the project root.",
    )
    parser.add_argument(
        "--max-files",
        type=int,
        default=1200,
        help="Maximum number of files to record before truncating the scan.",
    )
    parser.add_argument(
        "--max-files-per-dir",
        type=int,
        default=60,
        help="Maximum number of files to record for a single directory.",
    )
    parser.add_argument(
        "--exclude-dir",
        action="append",
        default=[],
        help="Additional directory name to exclude. May be provided multiple times.",
    )
    return parser.parse_args()


def rel_depth(path: Path) -> int:
    return max(len(path.parts) - 1, 0)


def classify_file(relative_path: Path) -> str:
    parts = {part.lower() for part in relative_path.parts}
    suffix = relative_path.suffix.lower()
    stem = relative_path.stem.lower()

    if suffix in {".md", ".rst", ".adoc"}:
        return "documentation"
    if suffix in {".json", ".toml", ".yaml", ".yml", ".ini", ".cfg"}:
        return "config"
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"}:
        return "asset"
    if suffix in {".sh", ".bash"}:
        return "script"
    if any(marker in parts for marker in TEST_MARKERS) or stem.endswith(("_test", "_spec")):
        return "test"
    if suffix in SOURCE_EXTENSIONS:
        return "source"
    return "other"


def should_skip_dir(path: Path, excluded_dirs: set[str], max_depth: int) -> bool:
    if path.name in excluded_dirs:
        return True
    return rel_depth(path) > max_depth


def scan_project(
    root: Path,
    excluded_dirs: set[str],
    max_depth: int,
    max_files: int,
    max_files_per_dir: int,
) -> tuple[list[FileRecord], bool]:
    records: list[FileRecord] = []
    truncated = False
    per_dir_counter: Counter[str] = Counter()
    directories = [root]

    while directories:
        current = directories.pop()
        try:
            entries = sorted(current.iterdir(), key=lambda entry: (not entry.is_dir(), entry.name.lower()))
        except OSError:
            continue

        for entry in entries:
            if entry.is_dir():
                if should_skip_dir(entry.relative_to(root), excluded_dirs, max_depth):
                    continue
                directories.append(entry)
                continue

            rel_path = entry.relative_to(root)
            directory_key = str(rel_path.parent)
            if per_dir_counter[directory_key] >= max_files_per_dir:
                continue

            records.append(
                FileRecord(
                    path=str(rel_path),
                    extension=entry.suffix.lower(),
                    kind=classify_file(rel_path),
                    depth=rel_depth(rel_path),
                )
            )
            per_dir_counter[directory_key] += 1

            if len(records) >= max_files:
                truncated = True
                return records, truncated

    return records, truncated


def pick_roots(records: Iterable[FileRecord], kind: str) -> list[str]:
    counts: Counter[str] = Counter()
    for record in records:
        if record.kind != kind:
            continue
        parent = str(Path(record.path).parent)
        counts[parent] += 1
    roots = [path for path, _count in counts.most_common(8) if path != "."]
    return roots


def build_top_level_entries(root: Path, excluded_dirs: set[str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for entry in sorted(root.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())):
        if entry.is_dir() and entry.name in excluded_dirs:
            continue
        entries.append(
            {
                "name": entry.name,
                "type": "dir" if entry.is_dir() else "file",
            }
        )
    return entries


def render_markdown(payload: dict) -> str:
    lines = [
        "# Project Map",
        "",
        f"- Root: `{payload['root']}`",
        f"- Generated at: `{payload['generated_at']}`",
        f"- Excluded directories: `{', '.join(payload['excluded_directories'])}`",
        f"- Truncated: `{payload['truncated']}`",
        "",
        "## Candidate Source Roots",
    ]

    source_roots = payload["source_roots"] or ["(none detected)"]
    lines.extend([f"- `{path}`" for path in source_roots])

    lines.extend(["", "## Candidate Test Roots"])
    test_roots = payload["test_roots"] or ["(none detected)"]
    lines.extend([f"- `{path}`" for path in test_roots])

    lines.extend(["", "## Top-Level Entries"])
    lines.extend([f"- `{entry['name']}` ({entry['type']})" for entry in payload["top_level_entries"]])

    lines.extend(["", "## Extension Summary"])
    for extension, count in payload["extension_summary"].items():
        label = extension or "[no extension]"
        lines.append(f"- `{label}`: {count}")

    lines.extend(["", "## Notable Files"])
    notable = payload["files"][:80]
    if not notable:
        lines.append("- `(none detected)`")
    else:
        for record in notable:
            lines.append(f"- `{record['path']}` [{record['kind']}]")

    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Project root does not exist or is not a directory: {root}")

    output_dir = (
        Path(args.output_dir).resolve()
        if args.output_dir
        else root / ".claude" / "project-structure"
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    excluded_dirs = set(DEFAULT_EXCLUDED_DIRS)
    excluded_dirs.update(args.exclude_dir)

    records, truncated = scan_project(
        root=root,
        excluded_dirs=excluded_dirs,
        max_depth=args.max_depth,
        max_files=args.max_files,
        max_files_per_dir=args.max_files_per_dir,
    )

    payload = {
        "root": str(root),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "excluded_directories": sorted(excluded_dirs),
        "source_roots": pick_roots(records, "source"),
        "test_roots": pick_roots(records, "test"),
        "top_level_entries": build_top_level_entries(root, excluded_dirs),
        "extension_summary": dict(sorted(Counter(record.extension for record in records).items())),
        "files": [asdict(record) for record in records],
        "truncated": truncated,
    }

    markdown_path = output_dir / "project-map.md"
    json_path = output_dir / "project-map.json"
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    print(f"Wrote {markdown_path}")
    print(f"Wrote {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
