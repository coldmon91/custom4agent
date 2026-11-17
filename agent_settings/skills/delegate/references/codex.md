# Codex

## Listing

`models.py codex` prints the OpenAI models Codex can use, in Codex's own picker order:

```
MODEL          EFFORTS                          DEFAULT  DESCRIPTION
gpt-6-astra    low,medium,high,xhigh,max,ultra  low      Frontier intelligence for the most demanding work.
```

- `MODEL`: pass as `--model`.
- `EFFORTS`: the levels that model accepts; `run.py launch` rejects any other.
- `DEFAULT`: the model's default effort, `-` when none.
- `DESCRIPTION`: the provider's own summary, the only capability signal the catalog carries.

Models scheduled for upgrade are hidden; `--include-deprecated` shows them.

## Choosing

Judge strength from `DESCRIPTION`, not from the slug: suffixes such as `sol` or `luna` are
reused across generations with different roles. Prefer rows not described as older or legacy,
and step up one level when uncertain. When the target effort is absent, use the highest listed
level below it.

agent:
- Small, localized edits: a fast or affordable row, `medium`.
- Ordinary bug fixes, focused refactors, test additions: a fast or affordable row, `xhigh`.
- Cross-module changes, root cause fixes, concurrency, security, migration: the frontier row, `high`.
- Any of the above with high uncertainty or failure cost: the frontier row, `xhigh`.

review:
- Symbol lookup, path checks, short Q&A: a fast or affordable row, `medium`.
- Single-file review, moderate refactoring suggestions: a fast or affordable row, `xhigh`.
- Cross-module review, bug analysis, architecture, security, concurrency: the frontier row, `high`.
- Any of the above where wrong advice is costly or evidence is ambiguous: the frontier row, `xhigh`.

## Behavior

- Sandboxed: `agent` runs with `workspace-write`, `review` with `read-only`.
- The log grows while Codex works, so `poll` asks the user after 10 minutes without log growth.
