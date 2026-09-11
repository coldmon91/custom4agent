#!/usr/bin/env python3
"""Create the symlinks that expose this repository to each agent's global config dir.

The repository is the single source of truth; every global path is a symlink into it.
Run with no arguments to inspect, with --apply to create or repair links.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
HOME = Path.home()

# (link path, target path inside the repo, relative?)
#   relative=True  -> link stores a path relative to its own directory (repo-internal)
#   relative=False -> link stores an absolute path (global config dir -> repo)
LINKS: list[tuple[Path, str, bool]] = [
    # Claude Code
    (HOME / ".claude/CLAUDE.md", "agent_settings/AGENTS.md", False),
    (HOME / ".claude/agents", "agent_settings/agents", False),
    (HOME / ".claude/commands", "agent_settings/commands", False),
    (HOME / ".claude/skills", "agent_settings/skills", False),
    (HOME / ".claude/statusline-command.js", "agent_settings/statusline-command.js", False),
    (HOME / ".claude/hooks/prompt-timestamp.js", "agent_settings/hooks/prompt-timestamp.js", False),
    (HOME / ".claude/scripts/skill_usage_stats.py", "agent_settings/scripts/skill_usage_stats.py", False),
    # Codex
    (HOME / ".codex/AGENTS.md", "agent_settings/AGENTS.md", False),
    (HOME / ".codex/skills", "agent_settings/skills", False),
    # pi — the whole agent dir lives in the repo
    (HOME / ".pi/agent", "pi-agent", False),
    # pi-agent internals (committed to git; listed here so a broken one is repairable).
    # APPEND_SYSTEM.md is a real file under pi-agent/ — pi-only, so it is not shared or linked.
    (REPO_ROOT / "pi-agent/AGENTS.md", "agent_settings/AGENTS.md", True),
    (REPO_ROOT / "pi-agent/prompts", "agent_settings/commands", True),
    (REPO_ROOT / "pi-agent/skills", "agent_settings/skills", True),
]

OK, FIX, BLOCKED, MISSING = "ok", "fix", "blocked", "missing-target"

C_GREEN, C_YELLOW, C_RED, C_DIM, C_RESET = "\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m"
if not sys.stdout.isatty() or os.environ.get("NO_COLOR"):
    C_GREEN = C_YELLOW = C_RED = C_DIM = C_RESET = ""

MARK = {
    OK: (C_GREEN, "OK     "),
    FIX: (C_YELLOW, "FIX    "),
    BLOCKED: (C_RED, "BLOCKED"),
    MISSING: (C_RED, "NO SRC "),
}


def link_value(link: Path, target: Path, relative: bool) -> str:
    """The string the symlink should hold."""
    if relative:
        return os.path.relpath(target, link.parent)
    return str(target)


def classify(link: Path, want: str, target: Path) -> tuple[str, str]:
    """Return (state, human-readable detail) without touching the filesystem."""
    if not target.exists():
        return MISSING, f"repo path absent: {target}"
    if link.is_symlink():
        current = os.readlink(link)
        if current == want:
            return OK, ""
        resolved_same = link.resolve() == target.resolve() if link.exists() else False
        detail = f"points to {current}" + (" (same target, different form)" if resolved_same else "")
        return FIX, detail
    if link.exists():
        kind = "directory" if link.is_dir() else "file"
        return BLOCKED, f"real {kind} in the way"
    return FIX, "absent"


def backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = path.with_name(f"{path.name}.bak-{stamp}")
    shutil.move(str(path), str(dest))
    return dest


def apply(link: Path, want: str, state: str, force: bool) -> str:
    """Create or repair one link. Returns a short note for the report."""
    if state == BLOCKED:
        if not force:
            return "skipped (use --force to back up and replace)"
        dest = backup(link)
        note = f"backed up to {dest.name}; "
    else:
        note = ""
        if link.is_symlink():
            link.unlink()
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(want)
    return note + "linked"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="create or repair links (default: inspect only)")
    parser.add_argument("--force", action="store_true", help="back up and replace a real file/dir blocking a link")
    args = parser.parse_args()

    print(f"{C_DIM}repo: {REPO_ROOT}{C_RESET}\n")

    counts: dict[str, int] = {}
    blocked_paths: list[Path] = []

    for link, rel_target, relative in LINKS:
        target = REPO_ROOT / rel_target
        want = link_value(link, target, relative)
        state, detail = classify(link, want, target)
        counts[state] = counts.get(state, 0) + 1

        note = detail
        if args.apply and state in (FIX, BLOCKED):
            note = apply(link, want, state, args.force)
            if state == BLOCKED and not args.force:
                blocked_paths.append(link)
        elif state == BLOCKED:
            blocked_paths.append(link)

        color, label = MARK[state]
        shown = str(link).replace(str(HOME), "~")
        print(f"{color}{label}{C_RESET} {shown:<50} -> {want}")
        if note:
            print(f"        {C_DIM}{note}{C_RESET}")

    summary = ", ".join(f"{MARK[s][1].strip().lower()} {n}" for s, n in sorted(counts.items()))
    print(f"\n{len(LINKS)} links — {summary}")

    if not args.apply and counts.get(FIX):
        print(f"{C_DIM}run with --apply to create the missing links{C_RESET}")
    if blocked_paths:
        print(f"{C_YELLOW}inspect the blocking paths before using --force:{C_RESET}")
        for p in blocked_paths:
            print(f"  {str(p).replace(str(HOME), '~')}")
        return 1
    return 1 if counts.get(MISSING) else 0


if __name__ == "__main__":
    sys.exit(main())
