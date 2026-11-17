# pi

## Listing

Run `models.py pi --sort strength`; rows come most capable first by provider pricing:

```
MODEL                     EFFORTS                            IN$/M  OUT$/M  CONTEXT  FAV
openai-codex/gpt-6-astra  minimal,low,medium,high,xhigh,max  10     50      272K     *
```

- `MODEL`: the literal `provider/id` slug; pass as `--model`.
- `EFFORTS`: thinking levels that model accepts; `run.py launch` rejects any other.
- `IN$/M`, `OUT$/M`: price per million tokens, `-` when unknown.
- `CONTEXT`: context window.
- `FAV`: `*` marks the user's chosen lineup in `favorite-models.json`.

Only models reachable with the current credentials are listed. `--favorites` shows the starred
lineup alone. A `warning:` about missing metadata means unknown pricing for that model; mention
it in the announcement.

## Choosing

Prefer a starred row and widen to the rest only when none fits. Pick the cheapest row that can
carry the task, and step up one row when uncertain.

agent:
- Small, localized edits: a low-cost row, `off` or `low`.
- Ordinary bug fixes, focused refactors, test additions: a mid-cost row, `medium`.
- Cross-module changes, root cause fixes, concurrency, security, migration: a top row, `high`.
- Any of the above with high uncertainty or failure cost: the top row at `xhigh` or `max` when listed.

review:
- Symbol lookup, path checks, short Q&A: a low-cost row, `off` or `low`.
- Single-file review, moderate refactoring suggestions: a mid-cost row, `medium`.
- Cross-module review, bug analysis, architecture, security, concurrency: a top row, `high`.
- Any of the above where wrong advice is costly or evidence is ambiguous: the top row at `xhigh`
  or `max` when listed.

## Behavior

- **No sandbox.** Nothing mechanically confines pi to the workspace. In `agent` mode the write
  boundary is the `[제약]` block plus your working tree check, so never skip either.
- `review` mode drops the edit/write tools and keeps `bash` under pi's auto-mode screener so pi
  can read git history. The screener still lets an in-repo shell write through, which is why the
  review template forbids shell writes and step 10 checks the working tree.
- Project-local extensions and skills are never loaded (`--no-approve`); `AGENTS.md` and
  `CLAUDE.md` still are.
- Pi exits 0 without running when stdin is empty, so exit 0 alone does not prove the prompt
  arrived; confirm the reply answers the task.
- Print mode writes nothing until the end, so `poll` checks in every 30 minutes.
