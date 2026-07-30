#!/usr/bin/env python3
"""Aggregate Skill tool invocation frequency from Claude Code JSONL transcripts.

Reads ~/.claude/projects/**/*.jsonl, extracts every `Skill` tool_use block,
and reports counts grouped by skill, date, project, or session. Installed
skills that were never invoked are listed with count 0.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Iterator, Sequence

DEFAULT_LOG_ROOT = Path.home() / ".claude" / "projects"
DEFAULT_SKILL_ROOT = Path.home() / ".claude" / "skills"
DEFAULT_PLUGIN_ROOT = Path.home() / ".claude" / "plugins"

# Plugin payloads live under these subtrees; each holds <plugin>/[<version>/]skills/<name>/.
PLUGIN_SUBDIRS = ("cache", "marketplaces", "repos")

# Bundled system skills are hidden by default.
SYSTEM_DIR = ".system"

# Directories that hold sample/fixture skills rather than installable ones.
EXCLUDED_PARTS = frozenset({"tests", "test", "fixtures", "node_modules"})

# Matches version-like directory names inserted between plugin and skills dirs.
VERSION_RE = re.compile(r"^(v?\d+(\.\d+)*|unknown)$")

# Cheap substring gate applied before json.loads; the transcripts are large
# (100MB+) and only a tiny fraction of lines carry a Skill invocation.
SKILL_MARKER = '"name":"Skill"'


@dataclass(frozen=True)
class Invocation:
    skill: str
    when: datetime
    session_id: str
    project: str
    caller: str
    sidechain: bool
    source: Path


@dataclass(frozen=True)
class SkillEntry:
    """An installed skill discovered on disk."""

    name: str  # canonical display name, e.g. "superpowers:brainstorming"
    base: str  # match key shared with log entries, e.g. "brainstorming"
    origin: str  # "user", "system", or the owning plugin name
    path: Path


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #


def parse_timestamp(raw: str | None, *, use_utc: bool) -> datetime | None:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc) if use_utc else parsed.astimezone()


def project_name(record: dict, source: Path) -> str:
    cwd = record.get("cwd")
    if isinstance(cwd, str) and cwd:
        return cwd
    # Fallback: the parent directory encodes the project path with '-' separators.
    return source.parent.name


def extract_invocations(path: Path, *, use_utc: bool) -> Iterator[Invocation]:
    """Yield one Invocation per Skill tool_use block found in a transcript."""
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if SKILL_MARKER not in line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(record, dict):
                continue

            content = record.get("message", {}).get("content")
            if not isinstance(content, list):
                continue

            when = parse_timestamp(record.get("timestamp"), use_utc=use_utc)
            if when is None:
                continue

            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") != "tool_use" or block.get("name") != "Skill":
                    continue
                skill = (block.get("input") or {}).get("skill")
                if not isinstance(skill, str) or not skill:
                    continue

                caller = block.get("caller")
                yield Invocation(
                    skill=skill,
                    when=when,
                    session_id=str(record.get("sessionId") or path.stem),
                    project=project_name(record, path),
                    caller=(caller or {}).get("type", "unknown")
                    if isinstance(caller, dict)
                    else "unknown",
                    sidechain=bool(record.get("isSidechain")),
                    source=path,
                )


def collect(paths: Sequence[Path], *, use_utc: bool) -> list[Invocation]:
    found: list[Invocation] = []
    for path in paths:
        try:
            found.extend(extract_invocations(path, use_utc=use_utc))
        except OSError as exc:
            print(f"warning: skipped {path}: {exc}", file=sys.stderr)
    found.sort(key=lambda item: item.when)
    return found


# --------------------------------------------------------------------------- #
# Installed-skill inventory
# --------------------------------------------------------------------------- #


def version_sort_key(name: str) -> tuple[int, ...]:
    """Order version-like directory names so the newest install wins."""
    digits = re.findall(r"\d+", name)
    return tuple(int(part) for part in digits) if digits else (-1,)


def is_excluded(path: Path) -> bool:
    return any(part in EXCLUDED_PARTS for part in path.parts)


def discover_user_skills(root: Path, *, include_system: bool) -> Iterator[SkillEntry]:
    if not root.is_dir():
        return
    for manifest in root.rglob("SKILL.md"):
        if is_excluded(manifest):
            continue
        is_system = SYSTEM_DIR in manifest.parts
        if is_system and not include_system:
            continue
        name = manifest.parent.name
        yield SkillEntry(
            name=name, base=name, origin="system" if is_system else "user", path=manifest.parent
        )


def installed_plugin_dirs(root: Path) -> dict[str, list[Path]] | None:
    """Read installed_plugins.json into {plugin: [install dirs]}.

    Only these paths count as installed; `marketplaces/` and `repos/` hold
    browsable catalogs whose skills are not available to the session.
    """
    manifest = root / "installed_plugins.json"
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("plugins"), dict):
        return None

    resolved: dict[str, list[Path]] = {}
    for key, entries in data["plugins"].items():
        if not isinstance(entries, list):
            continue
        plugin = str(key).split("@", 1)[0]
        seen: dict[str, Path] = {}
        for entry in entries:
            path = isinstance(entry, dict) and entry.get("installPath")
            if isinstance(path, str) and path:
                seen[path] = Path(path)
        if seen:
            resolved[plugin] = sorted(seen.values())
    return resolved


def sweep_plugin_skills(root: Path) -> dict[tuple[str, str], tuple[tuple[int, ...], Path]]:
    """Fallback discovery: <plugin>[/<version>]/skills/<name>/SKILL.md."""
    best: dict[tuple[str, str], tuple[tuple[int, ...], Path]] = {}
    for subdir in PLUGIN_SUBDIRS:
        for manifest in (root / subdir).rglob("skills/*/SKILL.md"):
            if is_excluded(manifest):
                continue
            skill_dir = manifest.parent
            holder = skill_dir.parent.parent  # version dir or the plugin dir itself
            versioned = bool(VERSION_RE.match(holder.name))
            plugin = holder.parent.name if versioned else holder.name
            rank = version_sort_key(holder.name) if versioned else (0,)
            key = (plugin, skill_dir.name)
            if key not in best or rank > best[key][0]:
                best[key] = (rank, skill_dir)
    return best


def discover_plugin_skills(root: Path) -> Iterator[SkillEntry]:
    """Yield skills owned by installed plugins, newest version per (plugin, skill)."""
    if not root.is_dir():
        return

    installed = installed_plugin_dirs(root)
    if installed is None:
        best = sweep_plugin_skills(root)
    else:
        best = {}
        for plugin, dirs in installed.items():
            for install_dir in dirs:
                rank = version_sort_key(install_dir.name)
                for manifest in install_dir.glob("skills/*/SKILL.md"):
                    if is_excluded(manifest):
                        continue
                    key = (plugin, manifest.parent.name)
                    if key not in best or rank > best[key][0]:
                        best[key] = (rank, manifest.parent)

    for (plugin, name), (_, path) in sorted(best.items()):
        yield SkillEntry(name=f"{plugin}:{name}", base=name, origin=plugin, path=path)


def build_inventory(
    *, skill_roots: Sequence[Path], plugin_root: Path, include_system: bool
) -> dict[str, SkillEntry]:
    """Map each skill's basename to its canonical entry; user skills override plugins."""
    inventory: dict[str, SkillEntry] = {}
    for entry in discover_plugin_skills(plugin_root):
        inventory.setdefault(entry.base, entry)
    for root in skill_roots:
        for entry in discover_user_skills(root, include_system=include_system):
            inventory[entry.base] = entry  # local definitions take precedence
    return inventory


def make_namer(
    inventory: dict[str, SkillEntry], *, strip_prefix: bool
) -> Callable[[str], str]:
    """Normalize log skill ids to a single display name per skill.

    Logs record both prefixed (`superpowers:brainstorming`) and bare (`dataviz`)
    ids for the same underlying skills, so matching happens on the basename.
    """

    def name_of(skill_id: str) -> str:
        base = skill_id.rsplit(":", 1)[-1]
        if strip_prefix:
            return base
        entry = inventory.get(base)
        return entry.name if entry else skill_id

    return name_of


# --------------------------------------------------------------------------- #
# Filtering
# --------------------------------------------------------------------------- #


def parse_date_bound(raw: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    raise argparse.ArgumentTypeError(f"invalid date '{raw}' (expected YYYY-MM-DD or YYYYMMDD)")


def apply_filters(items: Iterable[Invocation], args: argparse.Namespace) -> list[Invocation]:
    since = args.since.date() if args.since else None
    until = args.until.date() if args.until else None
    project_needle = args.project.lower() if args.project else None
    skill_needle = args.skill.lower() if args.skill else None

    kept: list[Invocation] = []
    for item in items:
        day = item.when.date()
        if since and day < since:
            continue
        if until and day > until:
            continue
        if project_needle and project_needle not in item.project.lower():
            continue
        if skill_needle and skill_needle not in item.skill.lower():
            continue
        if args.no_sidechain and item.sidechain:
            continue
        kept.append(item)
    return kept


# --------------------------------------------------------------------------- #
# Grouping
# --------------------------------------------------------------------------- #


def bucket_key(item: Invocation, by: str, *, name_of: Callable[[str], str]) -> str:
    if by == "skill":
        return name_of(item.skill)
    if by == "day":
        return item.when.strftime("%Y-%m-%d")
    if by == "week":
        year, week, _ = item.when.isocalendar()
        return f"{year}-W{week:02d}"
    if by == "month":
        return item.when.strftime("%Y-%m")
    if by == "project":
        return item.project
    if by == "session":
        return item.session_id
    raise ValueError(f"unsupported grouping: {by}")


def build_rows(
    items: Sequence[Invocation],
    *,
    by: str,
    name_of: Callable[[str], str],
    inventory: dict[str, SkillEntry] | None = None,
) -> list[dict[str, object]]:
    """Aggregate invocations into one row per bucket, richest column set first.

    When `inventory` is given and grouping by skill, installed-but-never-invoked
    skills are emitted as count-0 rows.
    """
    counts: Counter[str] = Counter()
    skills: defaultdict[str, Counter[str]] = defaultdict(Counter)
    sessions: defaultdict[str, set[str]] = defaultdict(set)
    projects: defaultdict[str, set[str]] = defaultdict(set)
    first_seen: dict[str, datetime] = {}
    last_seen: dict[str, datetime] = {}
    origins: dict[str, str] = {}

    if inventory is not None:
        origins = {name_of(entry.base): entry.origin for entry in inventory.values()}

    for item in items:
        key = bucket_key(item, by, name_of=name_of)
        counts[key] += 1
        skills[key][name_of(item.skill)] += 1
        sessions[key].add(item.session_id)
        projects[key].add(item.project)
        first_seen.setdefault(key, item.when)
        last_seen[key] = item.when

    total = sum(counts.values())
    if inventory is not None and by == "skill":
        for key in origins:
            counts.setdefault(key, 0)

    def sort_key(pair: tuple[str, int]) -> tuple[int, str]:
        return (-pair[1], pair[0])

    rows: list[dict[str, object]] = []
    for key, count in sorted(counts.items(), key=sort_key):
        row: dict[str, object] = {
            by: key,
            "count": count,
            "share": round(count * 100 / total, 1) if total else 0.0,
        }
        if by == "skill":
            row["sessions"] = len(sessions[key])
            row["projects"] = len(projects[key])
            if inventory is not None:
                row["origin"] = origins.get(key, "not installed")
        else:
            row["skills"] = len(skills[key])
            row["top_skill"] = skills[key].most_common(1)[0][0]
        if by == "session":
            row["project"] = next(iter(projects[key]))
        row["first"] = first_seen[key].strftime("%Y-%m-%d") if key in first_seen else "-"
        row["last"] = last_seen[key].strftime("%Y-%m-%d") if key in last_seen else "-"
        rows.append(row)
    return rows


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #


def render_table(rows: Sequence[dict[str, object]], *, bar_width: int) -> str:
    if not rows:
        return "no Skill invocations matched the given filters."

    columns = list(rows[0].keys())
    peak = max(int(row["count"]) for row in rows)

    display: list[list[str]] = []
    for row in rows:
        cells = [f"{row[col]:.1f}%" if col == "share" else str(row[col]) for col in columns]
        if bar_width > 0:
            count = int(row["count"])
            filled = max(1, round(count * bar_width / peak)) if count and peak else 0
            cells.append("█" * filled)
        display.append(cells)

    headers = [*columns, "bar"] if bar_width > 0 else list(columns)
    widths = [len(h) for h in headers]
    for cells in display:
        for index, cell in enumerate(cells):
            widths[index] = max(widths[index], len(cell))

    numeric = {"count", "share", "sessions", "projects", "skills"}

    def fmt(cells: Sequence[str], *, header: bool = False) -> str:
        parts = []
        for index, cell in enumerate(cells):
            right = not header and headers[index] in numeric
            parts.append(cell.rjust(widths[index]) if right else cell.ljust(widths[index]))
        return "  ".join(parts).rstrip()

    lines = [fmt(headers, header=True), "  ".join("-" * width for width in widths)]
    lines.extend(fmt(cells) for cells in display)
    return "\n".join(lines)


def render_csv(rows: Sequence[dict[str, object]]) -> str:
    if not rows:
        return ""
    import io

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().rstrip("\n")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="skill_usage_stats.py",
        description="Show Skill invocation frequency from Claude Code transcripts.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  skill_usage_stats.py                          # per-skill totals, unused as 0\n"
            "  skill_usage_stats.py --unused-only            # never-invoked skills\n"
            "  skill_usage_stats.py --by day --since 20260701\n"
            "  skill_usage_stats.py --by project --top 10\n"
            "  skill_usage_stats.py --skill analysis --json\n"
        ),
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_LOG_ROOT,
        help=f"transcript root directory (default: {DEFAULT_LOG_ROOT})",
    )
    parser.add_argument(
        "--skills-root",
        type=Path,
        action="append",
        metavar="PATH",
        help=f"skill inventory directory, repeatable (default: {DEFAULT_SKILL_ROOT})",
    )
    parser.add_argument(
        "--plugin-root",
        type=Path,
        default=DEFAULT_PLUGIN_ROOT,
        help=f"plugin inventory directory (default: {DEFAULT_PLUGIN_ROOT})",
    )
    parser.add_argument(
        "--by",
        choices=("skill", "day", "week", "month", "project", "session"),
        default="skill",
        help="grouping axis (default: skill)",
    )
    parser.add_argument("--since", type=parse_date_bound, help="include from date (inclusive)")
    parser.add_argument("--until", type=parse_date_bound, help="include until date (inclusive)")
    parser.add_argument("--project", help="substring filter on the project path")
    parser.add_argument("--skill", help="substring filter on the skill name")
    parser.add_argument("--top", type=int, help="limit output to N rows")
    parser.add_argument(
        "--strip-prefix",
        action="store_true",
        help="merge plugin prefixes (superpowers:brainstorming -> brainstorming)",
    )
    parser.add_argument(
        "--no-sidechain",
        action="store_true",
        help="exclude invocations made inside subagent sidechains",
    )
    usage = parser.add_mutually_exclusive_group()
    usage.add_argument(
        "--used-only",
        action="store_true",
        help="list only skills that appear in the logs (omit count-0 rows)",
    )
    usage.add_argument(
        "--unused-only",
        action="store_true",
        help="list only installed skills that were never invoked",
    )
    parser.add_argument(
        "--include-system",
        action="store_true",
        help="include bundled .system skills in the inventory",
    )
    parser.add_argument("--utc", action="store_true", help="report in UTC instead of local time")
    parser.add_argument("--no-bar", action="store_true", help="hide the bar chart column")
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--json", action="store_true", help="emit JSON")
    output.add_argument("--csv", action="store_true", help="emit CSV")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if not args.root.is_dir():
        print(f"error: transcript root not found: {args.root}", file=sys.stderr)
        return 1
    if args.since and args.until and args.since > args.until:
        print("error: --since is later than --until", file=sys.stderr)
        return 1

    paths = sorted(args.root.rglob("*.jsonl"))
    if not paths:
        print(f"error: no .jsonl transcripts under {args.root}", file=sys.stderr)
        return 1

    if args.unused_only and args.by != "skill":
        print("error: --unused-only requires --by skill", file=sys.stderr)
        return 1

    inventory = build_inventory(
        skill_roots=args.skills_root or [DEFAULT_SKILL_ROOT],
        plugin_root=args.plugin_root,
        include_system=args.include_system,
    )
    name_of = make_namer(inventory, strip_prefix=args.strip_prefix)

    invocations = apply_filters(collect(paths, use_utc=args.utc), args)
    rows = build_rows(
        invocations,
        by=args.by,
        name_of=name_of,
        inventory=None if args.used_only else inventory,
    )
    if args.unused_only:
        rows = [row for row in rows if row["count"] == 0]
    if args.top is not None and args.top > 0:
        rows = rows[: args.top]

    # Counted from the full inventory, not from `rows`, so --top cannot skew it.
    installed_names = {name_of(entry.base) for entry in inventory.values()}
    used = {name_of(item.skill) for item in invocations}
    used_installed = used & installed_names
    orphans = used - installed_names
    unused = installed_names - used

    if args.json:
        payload = {
            "root": str(args.root),
            "files_scanned": len(paths),
            "total_invocations": len(invocations),
            "installed_skills": len(installed_names),
            "used_installed_skills": len(used_installed),
            "unused_skills": len(unused),
            "orphan_skills": sorted(orphans),
            "group_by": args.by,
            "timezone": "UTC" if args.utc else "local",
            "rows": rows,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if args.csv:
        print(render_csv(rows))
        return 0

    print(render_table(rows, bar_width=0 if args.no_bar else 24))
    if invocations:
        span = f"{invocations[0].when:%Y-%m-%d} ~ {invocations[-1].when:%Y-%m-%d}"
        print(
            f"\ntotal {len(invocations)} invocations, "
            f"{len(used_installed)}/{len(installed_names)} installed skills used "
            f"({len(unused)} unused, {len(orphans)} logged but not installed), "
            f"{len({i.session_id for i in invocations})} sessions, "
            f"{span} ({'UTC' if args.utc else 'local'}), "
            f"{len(paths)} files scanned"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
