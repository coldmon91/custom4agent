---
name: codex-agent
description: "Run Codex CLI as a workspace-write implementation agent for delegated coding tasks."
---

# Codex Agent

Use OpenAI Codex CLI as a delegated implementation agent. Codex may modify files in the workspace only.

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

- Small, localized edits: a fast or affordable row, effort `medium`.
- Ordinary bug fixes, focused refactors, test additions: a fast or affordable row, effort `xhigh`.
- Cross-module changes, root cause fixes, concurrency, security, migration work: the frontier row,
  effort `high`.
- Any of the above with high uncertainty, high failure cost, ambiguous architecture tradeoffs, or
  several subsystems to coordinate: the frontier row, effort `xhigh`.

## Rules

- Reply in Korean.
- Use non-interactive `e`.
- Use `codex -a never e -s workspace-write`.
- Always include `--skip-git-repo-check`.
- Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Keep Codex edits inside the current workspace.
- Do not pass `--add-dir` unless the user explicitly requests another writable directory.
- Codex must not run destructive commands such as `rm`, `git reset`, or checkout-based reverts.
- Deliver the prompt only as described in Prompt Transport.
- Codex may become blocked during work, so periodic checks for blocking are necessary.
- If Codex returns an error, report it verbatim.

## Prompt Construction

Do not pass the user's raw prompt directly. Assemble this prompt.

```text
[배경]
{summary of recent conversation context, 3 ~ 15 sentences}

[작업]
{specific delegated implementation task. Include named files only when the user named them.}

[제약]
- 요청 범위에 직접 필요한 파일만 수정해라.
- 사용자 변경을 되돌리지 마라.
- 새 파일은 역할별로 분리하고 한 파일은 한 책임에 집중해라.
- 공통 동작은 함수, 메소드, 모듈로 만들어 재사용해라.
- 작업 후 변경 파일 목록과 실행한 검증 명령을 보고해라.

[출력 형식]
## 변경 사항
- 수정한 파일과 핵심 변경

## 검증
- 실행한 명령
- 성공 또는 실패 결과

## 남은 위험
- 테스트하지 못한 부분
- 사용자가 확인해야 할 부분
```

Always include `[제약]`.

## Prompt Transport

The assembled prompt is data. Never place any of it in a shell command, argument, variable,
heredoc, command substitution, or `printf`/`echo` pipeline.

- **Raw stdin**: when the execution tool can write to the process's stdin, send the complete
  prompt through it and close stdin.
- **Prompt file**: otherwise, hand the prompt over as a file redirected to stdin. Claude Code's
  Bash tool takes this path: it has no stdin input and the process sees `/dev/null`.
  1. Pick a directory outside the workspace that only the current user can enter: the session
     scratchpad when one is provided, else a fresh `mktemp -d` directory. Kept outside the
     workspace, the file never shows up in a `git status` check.
  2. Write the prompt with the file-writing tool, never a shell command, to a new file named
     `codex-prompt-<random suffix>.txt`. A suffix fresh per invocation keeps parallel runs apart.
  3. Append `< '<absolute path>'` to the command. Single quotes stop the shell from expanding `$`
     or backticks in the path; abort if the path itself contains `'`.
  4. Once the process has exited, on success, failure, or timeout alike, delete that one file and
     `rmdir` the `mktemp -d` directory if one was made. Never delete by wildcard, and report a
     failed deletion.
- Keep the trailing `-`. With it Codex reads stdin as the whole prompt; a positional prompt
  would demote stdin to an appended `<stdin>` block.
- If neither transport is available, abort and report the unsupported execution environment.

## What To Do

1. List the usable models with the `get_models.py` command above and remember the rows as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `-c model_reasoning_effort=`, and the user request.
3. Judge the task's complexity, then fill only unspecified options from the listing.
4. Announce the resolved choice in one line, including the literal model slug.
5. Build the command, substituting the literal resolved slug for `<model>` (no `$VAR` references).
   Use `-` so that Codex reads the entire assembled prompt from stdin:
   ```bash
   codex -a never e --skip-git-repo-check -s workspace-write \
     -m <model> -c model_reasoning_effort=<level> -
   ```
6. Deliver the prompt as described in Prompt Transport: through raw stdin, closed afterward, or
   as `< '<prompt file>'` appended to the command once the file is written.
7. Execute with Bash and set timeout to 600000 ms.
   When a prompt file was used, delete it once the process has exited, including after a timeout.
8. Inspect the resulting diff yourself.
9. Run or review relevant verification when feasible.
10. Deliver Codex output, your validation, changed files, and remaining risks.
