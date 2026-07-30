---
name: skill-stats
description: "Show Skill invocation frequency from Claude Code transcripts, including installed-but-never-invoked skills as count 0. Use when the user asks which skills they actually use, how often a skill was invoked, which skills are unused or worth removing, or wants skill usage statistics per day, project, or session."
---

# Skill Stats

Report how often each Skill was invoked, based on the local Claude Code transcripts
(`~/.claude/projects/**/*.jsonl`). Installed skills with no recorded invocation are
listed with `count 0`, so the output doubles as an unused-skill audit.

## Run

```bash
python3 ~/.claude/scripts/skill_usage_stats.py [OPTIONS]
```

The path is a symlink to `agent_settings/scripts/skill_usage_stats.py` in this
repository. On a fresh machine, create it once:

```bash
mkdir -p ~/.claude/scripts
ln -s ~/Documents/rsupport/custom_agent-skills/agent_settings/scripts/skill_usage_stats.py \
      ~/.claude/scripts/skill_usage_stats.py
```

Standard library only — no virtualenv, no dependencies. A full scan of ~570 transcript
files takes well under a second, so no timeout guard is needed beyond the usual one.

## Options

| Option | Effect |
|---|---|
| `--by skill\|day\|week\|month\|project\|session` | Grouping axis, default `skill` |
| `--since` / `--until` | `YYYY-MM-DD` or `YYYYMMDD`, both inclusive |
| `--project` / `--skill` | Substring filter on project path / skill name |
| `--top N` | Limit to N rows |
| `--used-only` / `--unused-only` | Drop count-0 rows / show only count-0 rows |
| `--strip-prefix` | Merge `superpowers:brainstorming` into `brainstorming` |
| `--include-system` | Include bundled `.system` skills in the inventory |
| `--no-sidechain` | Exclude invocations made inside subagent sidechains |
| `--utc` | Report in UTC instead of local time |
| `--json` / `--csv` / `--no-bar` | Output format |
| `--root` / `--skills-root` / `--plugin-root` | Override transcript and inventory paths |

## Argument mapping

Translate the user's request into flags rather than post-filtering the output:

- "이번 달" / "지난주" → `--since` / `--until`
- "안 쓰는 스킬" / "정리 대상" → `--unused-only`
- "프로젝트별" / "날짜별" → `--by project` / `--by day`
- "top 10만" → `--top 10`
- Machine-readable follow-up work → `--json`

With no arguments, run the bare command and report the table plus the summary line.

## Reporting

Show the table as-is (it is pre-aligned) and keep the trailing summary line: it carries
the invocation total, `used/installed` counts, unused count, and scan span.

Two caveats worth surfacing when they matter:

- `origin = not installed` means the skill appears in the logs but not on disk — a
  renamed or removed skill, a project-local plugin, or a harness built-in.
- Harness built-in skills (`review`, `run`, `artifact-design`, `claude-in-chrome`, …)
  have no `SKILL.md` on disk, so they never appear as count-0 rows. The `--json`
  output lists these under `orphan_skills`.
