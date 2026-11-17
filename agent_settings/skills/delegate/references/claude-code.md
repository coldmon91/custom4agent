# Claude Code

## Listing

`models.py claude` prints the models the `claude` CLI can select, strongest family first:

```
MODEL                 EFFORTS                    DESCRIPTION
fable                 low,medium,high,xhigh,max  Alias for the latest Fable model
claude-fable-5-2[1m]  low,medium,high,xhigh,max  Fable 5.2 · Most capable for your hardest and longest-running tasks
opus                  low,medium,high,xhigh,max  Alias for the latest Opus model
```

- `MODEL`: an alias or full model name; pass as `--model`.
- `EFFORTS`: levels `--effort` accepts; `run.py launch` rejects any other.
- `DESCRIPTION`: the account's own summary for an extra option, or the alias's family.

The CLI has no model enumeration command, so the list comes from `claude --help` and the
account's extra options. Aliases always resolve to the newest model of their family.
A `warning:` means the help text stopped naming aliases or efforts and the built-in ladder was
used; mention it in the announcement.

## Choosing

Rows are grouped by family, strongest first. Prefer alias rows; pick an extra option row only
when the task needs what its `DESCRIPTION` offers, such as a larger context window. Step up one
family when uncertain. When the target effort is absent, use the highest listed level below it.

agent:
- Small, localized edits: the fastest alias, `medium`.
- Ordinary bug fixes, focused refactors, test additions: the middle alias, `high`.
- Cross-module changes, root cause fixes, concurrency, security, migration: the strongest alias, `high`.
- Any of the above with high uncertainty or failure cost: the strongest alias, `xhigh`.

review:
- Symbol lookup, path checks, short Q&A: the fastest alias, `medium`.
- Single-file review, moderate refactoring suggestions: the middle alias, `medium`
  (`high` for multi-turn analysis).
- Cross-module review, bug analysis, architecture, security, concurrency: the strongest alias, `high`.
- Any of the above where wrong advice is costly or evidence is ambiguous: the strongest alias, `xhigh`.

## Behavior

- **`agent` mode has no sandbox.** `acceptEdits` approves edits and `Bash` runs real commands, so
  the `[제약]` block and your working tree check are the write boundary; never skip either.
- `review` mode runs with `--restricted` and only Read, Grep, Glob, so read-only is enforced by
  the CLI itself.
- MCP servers from the target repository are never loaded (`--strict-mcp-config`), and no
  resumable session is left behind.
- Print mode writes nothing until the end, so `poll` checks in every 30 minutes.
