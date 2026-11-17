#!/usr/bin/env python3
"""Collect one day's user inputs from Claude Code, Codex, pi, and Hermes logs.

Prints JSON: {"date": ..., "sources": {name: {"entries": [...], "error": str|null}}}.
Each entry: {"time": "HH:MM", "project": "~/...", "session": str, "text": str}.
"""

import argparse
import datetime as dt
import glob
import json
import os
import sqlite3
import sys

HOME = os.path.expanduser("~")
CLAUDE_HISTORY = os.path.join(HOME, ".claude", "history.jsonl")
CODEX_SESSIONS = os.path.join(HOME, ".codex", "sessions")
PI_SESSIONS = os.path.join(HOME, ".pi", "agent", "sessions")
HERMES_DB = os.path.join(HOME, ".hermes", "state.db")

MAX_TEXT_CHARS = 500
# Injected context, not typed by the user.
CODEX_SYSTEM_PREFIXES = ("# AGENTS", "<environment", "<stdin>", "<user_instructions", "<permissions")
# Throwaway runs (scripted `pi -p`, scratchpads) rather than real work.
AUTOMATED_CWD_PREFIXES = ("/private/tmp/", "/private/var/folders/", "/tmp/", "/var/folders/")


class DayWindow:
    def __init__(self, day: dt.date):
        self.day = day
        self.start = dt.datetime.combine(day, dt.time.min).astimezone()
        self.end = self.start + dt.timedelta(days=1)

    def contains(self, moment: dt.datetime) -> bool:
        return self.start <= moment < self.end


def shorten_path(path: str) -> str:
    return "~" + path[len(HOME):] if path and path.startswith(HOME) else path


def is_automated_cwd(cwd: str) -> bool:
    return any(cwd.startswith(prefix) for prefix in AUTOMATED_CWD_PREFIXES)


def make_entry(moment: dt.datetime, project: str, session: str, text: str) -> dict:
    text = text.strip()
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS] + "…"
    return {
        "time": moment.astimezone().strftime("%H:%M"),
        "project": shorten_path(project),
        "session": session,
        "text": text,
    }


def parse_iso(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def iter_jsonl(path: str):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def text_parts(content, part_type: str) -> list:
    if isinstance(content, str):
        return [content]
    if isinstance(content, list):
        return [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == part_type]
    return []


def collect_claude(window: DayWindow) -> list:
    entries = []
    if not os.path.exists(CLAUDE_HISTORY):
        return entries
    for obj in iter_jsonl(CLAUDE_HISTORY):
        moment = dt.datetime.fromtimestamp(obj.get("timestamp", 0) / 1000).astimezone()
        if window.contains(moment):
            entries.append(make_entry(moment, obj.get("project", ""), obj.get("sessionId", ""), obj.get("display", "")))
    return entries


def collect_codex(window: DayWindow) -> list:
    entries = []
    day_dir = os.path.join(CODEX_SESSIONS, f"{window.day:%Y}", f"{window.day:%m}", f"{window.day:%d}")
    for path in sorted(glob.glob(os.path.join(day_dir, "*.jsonl"))):
        cwd = ""
        session = os.path.basename(path)
        for obj in iter_jsonl(path):
            payload = obj.get("payload")
            if not isinstance(payload, dict):
                continue
            if obj.get("type") == "session_meta":
                cwd = payload.get("cwd", "")
                continue
            if obj.get("type") != "response_item" or payload.get("role") != "user":
                continue
            moment = parse_iso(obj["timestamp"]) if obj.get("timestamp") else window.start
            for text in text_parts(payload.get("content"), "input_text"):
                if text and not text.startswith(CODEX_SYSTEM_PREFIXES):
                    entries.append(make_entry(moment, cwd, session, text))
    return entries


def collect_pi(window: DayWindow) -> list:
    entries = []
    min_mtime = window.start.timestamp()
    for path in sorted(glob.glob(os.path.join(PI_SESSIONS, "*", "*.jsonl"))):
        # A session touched before the day began cannot hold that day's messages.
        if os.path.getmtime(path) < min_mtime:
            continue
        cwd = ""
        session = os.path.basename(path)
        for obj in iter_jsonl(path):
            if obj.get("type") == "session":
                cwd = obj.get("cwd", "")
                if is_automated_cwd(cwd):
                    break
                continue
            message = obj.get("message")
            if obj.get("type") != "message" or not isinstance(message, dict) or message.get("role") != "user":
                continue
            moment = parse_iso(obj["timestamp"])
            if not window.contains(moment):
                continue
            for text in text_parts(message.get("content"), "text"):
                if text:
                    entries.append(make_entry(moment, cwd, session, text))
    return entries


def collect_hermes(window: DayWindow) -> list:
    if not os.path.exists(HERMES_DB):
        return []
    query = """
        SELECT m.timestamp, COALESCE(s.cwd, ''), m.session_id, COALESCE(s.source, ''), m.content
        FROM messages m LEFT JOIN sessions s ON s.id = m.session_id
        WHERE m.role = 'user' AND m.timestamp >= ? AND m.timestamp < ?
        ORDER BY m.timestamp
    """
    conn = sqlite3.connect(f"file:{HERMES_DB}?mode=ro", uri=True, timeout=5)
    try:
        rows = conn.execute(query, (window.start.timestamp(), window.end.timestamp())).fetchall()
    finally:
        conn.close()
    entries = []
    for timestamp, cwd, session_id, source, content in rows:
        if not content:
            continue
        moment = dt.datetime.fromtimestamp(timestamp).astimezone()
        entry = make_entry(moment, cwd, session_id, content)
        entry["channel"] = source
        entries.append(entry)
    return entries


COLLECTORS = {
    "claude_code": collect_claude,
    "codex": collect_codex,
    "pi": collect_pi,
    "hermes": collect_hermes,
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", help="YYYY-MM-DD (default: today, local time)")
    args = parser.parse_args()
    try:
        day = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    except ValueError:
        print(f"invalid --date: {args.date}", file=sys.stderr)
        return 2

    window = DayWindow(day)
    sources = {}
    for name, collect in COLLECTORS.items():
        # One broken log must not hide the other sources.
        try:
            entries = sorted(collect(window), key=lambda e: e["time"])
            sources[name] = {"entries": entries, "error": None}
        except Exception as exc:  # noqa: BLE001
            sources[name] = {"entries": [], "error": f"{type(exc).__name__}: {exc}"}

    json.dump({"date": day.isoformat(), "sources": sources}, sys.stdout, ensure_ascii=False, indent=1)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
