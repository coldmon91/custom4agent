---
name: pi-review
description: "Run pi CLI in read-only mode for code review, analysis, debugging, and second opinions."
---

# Pi Review

Use pi CLI as a read-only reviewer. Pi must analyze and suggest only.

## Model Listing

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py"
```

It prints one row per model pi can currently reach, most capable first:

```
MODEL                     IN$/M  OUT$/M  CONTEXT  FAV  THINKING
openai-codex/gpt-6-astra  10     50      272K     *    minimal,low,medium,high,xhigh,max
```

- `MODEL`: the literal `provider/id` slug to pass to `--model`.
- `IN$/M`, `OUT$/M`: price per million tokens, `-` when the catalog holds no pricing.
- `CONTEXT`: context window.
- `FAV`: `*` marks a model in `favorite-models.json`, the lineup the user actually chose.
- `THINKING`: the levels that model accepts. Never pass a level absent from its list.

Rows are ordered by provider pricing, the only capability proxy available here, so the listing
follows the account's real lineup rather than any hardcoded slug. Only reachable models are
listed: the script gates on `pi --list-models`, which reflects the current credentials.
Add `--favorites` for the starred lineup alone, `--slugs` for bare slugs, `--json` for
structured output.

Capture the chosen slug and level as **plain strings** and substitute the literal text into the
`pi` command (env vars do not survive across Bash calls).

On failure the script exits non-zero with an `error:` line on stderr; abort and report that line
verbatim. A `warning:` line means a model carried no cached metadata and is listed with unknown
pricing; the listing is still usable, but say so in your announcement. Verify any user-supplied
slug against this listing. Do not read model env vars or hardcode slugs.

## Arguments

`$ARGUMENTS` format: `[options] "<prompt>"`

- `-m <provider>/<id>`: Model. If omitted, select one from the listing.
- `--thinking <level>`: Thinking level. Must appear in the chosen model's `THINKING` column.

User-specified values always take precedence.

## Model Selection

Prefer a starred (`FAV`) model and widen to the rest of the listing only when none fits.
Pick the cheapest row that can carry the task, and step up one row when uncertain.
Take the thinking level from that row's `THINKING` column; a level it does not list is invalid.

- Symbol lookup, path checks, short Q&A: a low-cost row, thinking `off` or `low`.
- Single-file review, moderate refactoring suggestions, multi-turn analysis: a mid-cost row,
  thinking `medium`.
- Cross-module review, bug analysis, architecture, security, concurrency, root cause tracing:
  a top row, thinking `high`.
- Any of the above where incorrect advice carries high risk, the evidence is ambiguous, or the
  analysis spans several subsystems: the top row at `xhigh` or `max` when it supports one.

## Rules

- Reply in Korean.
- Use non-interactive print mode: `pi -p`.
- **Pi has no sandbox.** Read-only is enforced solely by the tool allowlist, so
  `--tools read,grep,find,ls` is mandatory. Omitting it hands pi `bash`, `edit`, and `write`.
- Always include `--no-session` so a delegated run leaves no session file behind.
- Always include `--no-approve` so project-local extensions and skills in the reviewed repository
  are never loaded or trusted.
- Do not pass `-nc` / `--no-context-files`; `AGENTS.md` and `CLAUDE.md` are useful review context.
- Do not add `bash`, `edit`, or `write` to `--tools` for any reason.
- Pass the prompt through the execution tool's raw stdin channel. Pi reads the whole prompt from
  stdin in `-p` mode when no message argument is given.
- Never interpolate the assembled prompt into a shell command, argument, variable, heredoc, or
  `printf`/`echo` pipeline.
- If the execution tool cannot pass raw stdin without shell interpolation, abort and report the
  unsupported execution environment.
- Pi may become blocked during work, so periodic checks for blocking are necessary.
- If pi returns an error, report it verbatim.

## Prompt Construction

Do not pass the user's raw prompt directly. Assemble this prompt.

```text
[배경]
{summary of recent conversation context, 3 ~ 15 sentences}

[작업]
{specific read-only analysis task. Let pi choose the necessary scope unless the user named files.}

[제약]
- 파일을 수정, 삭제, 생성하지 마라. 분석과 제안만 수행해라.
- 코드 변경이 필요한 경우 제안으로만 제시하고, 직접 적용하지 마라.

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

1. List the reachable models with the `get_models.py` command above and remember the rows as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `--thinking`, and the user request.
3. Judge the task's complexity, then fill only unspecified options from the listing.
4. Announce the resolved choice in one line, including the literal `provider/id` slug and level.
5. Build the command, substituting the literal resolved slug for `<model>` (no `$VAR` references):
   ```bash
   pi -p --no-session --no-approve --tool-mode read \
     --tools read,grep,find,ls \
     --model <model> --thinking <level>
   ```
   `--tool-mode read` matches this skill's read-only intent and keeps the run off the auto-mode
   screener entirely, so a review costs no classifier calls.
6. Start the command and send the complete assembled prompt through the execution tool's raw stdin
   input facility, then close stdin. Do not construct a shell pipeline or place any prompt text in
   the command string.
7. Execute with Bash and set timeout to 300000 ms.
8. Validate pi output against the real code.
9. Deliver pi output, validation, and brief commentary.
