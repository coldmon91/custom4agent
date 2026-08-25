---
name: pi-review
description: "Run pi CLI in read-only mode for code review, analysis, debugging, and second opinions."
---

# Pi Review

Use pi CLI as a read-only reviewer. Pi must analyze and suggest only.

## Model Resolution

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py" --profile review
```

It prints the resolved tier table as `key=value` lines, three per tier:

```
tier<N>_model=<provider>/<id>
tier<N>_thinking=<level>
tier<N>_supported_thinking=<comma-separated levels>
```

Capture these as **plain strings** and substitute the literal text into every `pi` command
(env vars do not survive across Bash calls). Never pass a thinking level that is absent from that
tier's `supported_thinking`.

The script binds tiers to the models in `favorite-models.json` when at least three of them are
reachable, and widens to the full catalog otherwise. It ranks by provider pricing, so the tier
table follows the account's actual model lineup rather than any hardcoded slug.

On failure the script exits non-zero with an `error:` line on stderr; abort and report that line
verbatim. A `warning:` line means the table degraded — favorites were unavailable, roles collapsed
onto one model, or a model carried no cached metadata. The table is still usable, but say so in
your announcement. Verify any user-supplied slug against `python3 "<skill dir>/../get_models.py" --all`.
Do not read model env vars or hardcode slugs.

## Arguments

`$ARGUMENTS` format: `[options] "<prompt>"`

- `-m <provider>/<id>`: Model. If omitted, auto-select by tier.
- `--thinking <level>`: Thinking level. Must appear in the chosen tier's `tier<N>_supported_thinking`.

User-specified values always take precedence.

## Tier Selection

Pick dynamically based on task complexity. When uncertain, step up one tier.
Take each tier's model and level from the resolved `tier<N>_model` and `tier<N>_thinking` values.

Use Tier 1 for symbol lookup, path checks, and short Q&A.
Use Tier 2 for single-file review, moderate refactoring suggestions, or multi-turn analysis.
Use Tier 3 for cross-module review, bug analysis, architecture, security, concurrency, or root cause tracing.
Use Tier 4 when Tier 3 conditions apply and incorrect advice has high risk,
the evidence is ambiguous, or the analysis spans several subsystems.

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

1. Resolve the tier table with the `get_models.py` command above and remember the values as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `--thinking`, and the user request.
3. Classify the tier and fill only unspecified options.
4. Announce the resolved choice in one line, including the literal `provider/id` slug and level.
5. Build the command, substituting the literal resolved slug for `<model>` (no `$VAR` references):
   ```bash
   pi -p --no-session --no-approve --tools read,grep,find,ls \
     --model <model> --thinking <level>
   ```
6. Start the command and send the complete assembled prompt through the execution tool's raw stdin
   input facility, then close stdin. Do not construct a shell pipeline or place any prompt text in
   the command string.
7. Execute with Bash and set timeout to 300000 ms.
8. Validate pi output against the real code.
9. Deliver pi output, validation, and brief commentary.
