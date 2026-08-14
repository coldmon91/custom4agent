---
name: agy-review
description: "Run Antigravity CLI (agy) in plan mode for code review, analysis, debugging, and second opinions."
---

# Agy Review

Use Antigravity CLI (`agy`) as a read-only reviewer. Agy must analyze and suggest only.

## Model Resolution

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py" --profile review
```

It prints the resolved tier table as `key=value` lines, three per tier:

```
tier<N>_model=<slug>
tier<N>_effort=<level>
tier<N>_supported_efforts=<comma-separated levels>
```

Capture these as **plain strings** and substitute the literal text into every `agy` command
(env vars do not survive across Bash calls). Do not read model env vars or hardcode slugs.

Agy bakes the reasoning level into the slug (`gemini-3.7-flash-high`), so `tier<N>_model` already
carries the effort. Pass `--model <slug>` only. Add `--effort <level>` **only** when the user
explicitly asks for a level and `tier<N>_effort` is `default` — a slug that already names its level
must never be paired with `--effort`.

`tier<N>_effort=default` means the resolved slug names no level of its own — either the family has
no level variants at all, or none of them sat at or below the requested ceiling. Tiers 3 and 4 may
resolve to the same slug when the deep family has no level variants — that is expected, not an error.

On failure the script exits non-zero with an `error:` line on stderr; abort and report that line
verbatim. A `warning:` line means a role was resolved by fallback because the model lineup changed —
the table is still usable, but say so in your announcement.

## Arguments

`$ARGUMENTS` format: `[options] "<prompt>"`

- `-m <model>`: Model slug. If omitted, auto-select by tier. Verify it appears in
  `python3 "<skill dir>/../get_models.py" --all`.
- `--effort <level>`: Reasoning level (`low|medium|high`). Only valid for a slug without a
  baked-in level.

User-specified values always take precedence.

## Tier Selection

Pick dynamically based on task complexity. When uncertain, step up one tier.
Take each tier's model from the resolved `tier<N>_model` value.

Use Tier 1 for symbol lookup, path checks, and short Q&A.
Use Tier 2 for single-file review, moderate refactoring suggestions, or multi-turn analysis.
Use Tier 3 for cross-module review, bug analysis, architecture, security, concurrency, or root cause tracing.
Use Tier 4 when Tier 3 conditions apply and incorrect advice has high risk,
the evidence is ambiguous, or the analysis spans several subsystems.

## Rules

- Reply in Korean.
- Use non-interactive print mode: `agy --mode plan -p "<prompt>"`.
- **Always pass `--add-dir "<absolute path of the working directory>"`.** Without it agy defaults to
  `~/.gemini/antigravity-cli/scratch` and reviews nothing in the user's repository.
- Do not pass `--dangerously-skip-permissions`.
- Do not pass `--mode accept-edits`; `--mode plan` is what keeps the run read-only.
- Do not add extra `--add-dir` entries beyond the working directory unless the user asks.
- Agy has **no stdin prompt channel** (`-p -` is read as an empty prompt). The prompt must go in as
  a single `-p` argument value. Wrap it in single quotes and rewrite every inner `'` as `'\''`.
  Never build it with `printf`, `echo`, a heredoc, or a shell variable.
- Exit code `1` is normal in plan mode — agy stops to ask for approval after producing its analysis.
  Judge success by the printed output, not the exit code. Report a run as failed only when the
  output carries no analysis.
- In plan mode agy writes no files inside the workspace, but it may drop a plan markdown under
  `~/.gemini/antigravity-cli/brain/`. That is outside the repository; leave it alone.
- If agy returns an error, report it verbatim.

## Prompt Construction

Do not pass the user's raw prompt directly. Assemble this prompt.

```text
[배경]
{summary of recent conversation context, 3 ~ 15 sentences}

[작업]
{specific read-only analysis task. Let agy choose the necessary scope unless the user named files.}

[제약]
- 파일을 수정, 삭제, 생성하지 마라. 분석과 제안만 수행해라.
- 코드 변경이 필요한 경우 제안으로만 제시하고, 직접 적용하지 마라.
- 승인 질문 없이 분석 결과를 끝까지 출력해라.

[출력 형식]
## 분석 결과
- 발견 사항
- 각 항목: 문제 설명, 근거, 영향도

## 제안
- 구체적인 수정 방안
- 필요한 경우 코드 예시 포함

## 요약
- 핵심 결론 3 ~ 15 문장
```

Always include `[제약]`.

## What To Do

1. Resolve the tier table with the `get_models.py` command above and remember the values as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `--effort`, and the user request.
3. Classify the tier and fill only unspecified options.
4. Announce the resolved choice in one line, including the literal model slug.
5. Build the command, substituting the literal resolved slug for `<model>` (no `$VAR` references)
   and the absolute working directory for `<workspace>`:
   ```bash
   agy --add-dir "<workspace>" --mode plan --print-timeout 10m \
     --model <model> -p '<assembled prompt>'
   ```
6. Execute with Bash and set timeout to 660000 ms — slightly above `--print-timeout` so the CLI's
   own timeout fires first and its message survives.
7. Validate agy output against the real code.
8. Confirm no workspace file changed (`git status --short`) before trusting the run.
9. Deliver agy output, validation, and brief commentary.
