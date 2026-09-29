---
name: codex-review
description: "Run Codex CLI in read-only mode for code review, analysis, debugging, and second opinions."
---

# Codex Review

Use OpenAI Codex CLI as a read-only reviewer. Codex must analyze and suggest only.

## Model Listing

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py"
```

It prints one row per model Codex can currently use, in Codex's own model-picker order:

```
MODEL          DEFAULT  EFFORTS                          DESCRIPTION
gpt-6-astra    low      low,medium,high,xhigh,max,ultra  Frontier intelligence for the most demanding work.
```

- `MODEL`: the literal slug to pass to `-m`.
- `DEFAULT`: the model's default reasoning effort, `-` when the catalog names none.
- `EFFORTS`: the levels that model accepts. Never pass a level absent from its list.
- `DESCRIPTION`: the provider's own summary, the only capability signal the catalog carries.

Only OpenAI models shown in Codex's picker and not scheduled for upgrade are listed, so the
listing follows the account's real lineup rather than any hardcoded slug.
Add `--slugs` for bare slugs, `--json` for structured output.

Capture the chosen slug and effort as **plain strings** and substitute the literal text into every
`codex` command (env vars do not survive across Bash calls).

On failure the script exits non-zero with an `error:` line on stderr; abort and report that line
verbatim. Fallback slug reference: `https://developers.openai.com/codex/models`.
Do not read model env vars or hardcode slugs.

## Arguments

`$ARGUMENTS` format: `[options] "<prompt>"`

- `-m <model>`: Model. If omitted, select one from the listing.
- `-c model_reasoning_effort=<level>`: Reasoning level. Must appear in the chosen model's
  `EFFORTS` column.

User-specified values always take precedence.

## Model Selection

Judge each row's strength from its `DESCRIPTION`, not from its slug: suffixes such as `sol` or
`luna` are reused across generations with different roles.
Prefer earlier rows over those described as older or legacy, and step up one level when uncertain.
Take the effort from that row's `EFFORTS` column; when the target level is absent, use the highest
listed level below it.

- Symbol lookup, path checks, short Q&A: a fast or affordable row, effort `medium`.
- Single-file review, moderate refactoring suggestions, multi-turn analysis: a fast or affordable
  row, effort `xhigh`.
- Cross-module review, bug analysis, architecture, security, concurrency, root cause tracing:
  the frontier row, effort `high`.
- Any of the above where incorrect advice carries high risk, the evidence is ambiguous, or the
  analysis spans several subsystems: the frontier row, effort `xhigh`.

## Rules

- Reply in Korean.
- Use non-interactive `e`.
- Use `codex -a never e -s read-only`.
- Always include `--skip-git-repo-check`.
- Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Do not allow Codex to modify, create, or delete files.
- Never interpolate the assembled prompt into a shell command, argument, variable, heredoc, or
  `printf`/`echo` pipeline. Pass it only through the execution tool's raw stdin channel.
- If the execution tool cannot pass raw stdin without shell interpolation, abort and report the
  unsupported execution environment.
- Codex may become blocked during work, so periodic checks for blocking are necessary.
- If Codex returns an error, report it verbatim.

## Prompt Construction

Do not pass the user's raw prompt directly. Assemble this prompt.

```text
[배경]
{summary of recent conversation context, 3 ~ 15 sentences}

[작업]
{specific read-only analysis task. Let Codex choose the necessary scope unless the user named files.}

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

1. List the usable models with the `get_models.py` command above and remember the rows as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `-c model_reasoning_effort=`, and the user request.
3. Judge the task's complexity, then fill only unspecified options from the listing.
4. Announce the resolved choice in one line, including the literal model slug.
5. Build the command, substituting the literal resolved slug for `<model>` (no `$VAR` references).
   Use `-` so that Codex reads the entire assembled prompt from stdin:
   ```bash
   codex -a never e --skip-git-repo-check -s read-only \
     -m <model> -c model_reasoning_effort=<level> -
   ```
6. Start the command and send the complete assembled prompt through the execution tool's raw stdin
   input facility, then close stdin. Do not construct a shell pipeline or place any prompt text in
   the command string.
7. Execute with Bash and set timeout to 300000 ms.
8. Validate Codex output against the real code.
9. Deliver Codex output, validation, and brief commentary.
