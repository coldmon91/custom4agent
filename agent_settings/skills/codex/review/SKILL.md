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

- Use non-interactive `e`.
- Use `codex -a never e -s read-only`.
- Always include `--skip-git-repo-check`.
- Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Do not allow Codex to modify, create, or delete files.
- Deliver the prompt only as described in Prompt Transport.
- Run Codex only as described in Execution Monitoring: detached, polled, never under a
  fixed timeout.
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

## Prompt Transport

The assembled prompt is data. Never place any of it in a shell command, argument, variable,
heredoc, command substitution, or `printf`/`echo` pipeline.
Codex runs detached (see Execution Monitoring), so the prompt always travels as a file
redirected to stdin.

1. Create a fresh run directory outside the workspace that only the current user can enter:
   `mktemp -d '<scratchpad>/codex-run-XXXXXX'` when a session scratchpad is provided, else
   `mktemp -d`. One directory per invocation keeps parallel runs apart and keeps the files out
   of `git status`. Abort if the path contains `'`.
2. Write the prompt with the file-writing tool, never a shell command, to `<run dir>/prompt.txt`.
- Keep the trailing `-`. With it Codex reads stdin as the whole prompt; a positional prompt
  would demote stdin to an appended `<stdin>` block.
- If no file-writing tool is available, abort and report the unsupported execution environment.

## Execution Monitoring

A Codex run can outlast any fixed tool timeout, and a timeout kill is reported as a failure.
Never run Codex in the foreground or under a wall-clock timeout; launch it detached and check
its state periodically until it ends.

Run directory files: `prompt.txt` (input), `codex.log` (stdout and stderr progress),
`last-message.txt` (final reply via `-o`), `exit-code` (written once Codex exits).

1. **Launch**: one Bash call that returns immediately. Substitute literal text for `<model>`,
   `<level>`, and `<run dir>`; the run directory reaches the script as `$1`, so no path is
   quoted inside `sh -c`.
   ```bash
   nohup sh -c 'codex -a never e --skip-git-repo-check -s read-only \
       -m <model> -c model_reasoning_effort=<level> \
       -o "$1/last-message.txt" - < "$1/prompt.txt" > "$1/codex.log" 2>&1
     rc=$?; echo "$rc" > "$1/exit-code.tmp"; mv "$1/exit-code.tmp" "$1/exit-code"' \
     sh '<run dir>' > /dev/null 2>&1 &
   echo "pid=$!"
   ```
   Remember the printed pid as a plain string.
2. **Poll**: each call waits at most 120 s and returns early once Codex exits.
   ```bash
   d='<run dir>'; p=<pid>; n=0
   while [ ! -f "$d/exit-code" ] && kill -0 "$p" 2>/dev/null && [ "$n" -lt 120 ]; do
     sleep 5; n=$((n + 5))
   done
   if [ -f "$d/exit-code" ]; then echo "state=exited code=$(cat "$d/exit-code")"
   elif kill -0 "$p" 2>/dev/null; then echo "state=running"
   else echo "state=lost"; fi
   echo "log_bytes=$(wc -c < "$d/codex.log")"
   tail -n 20 "$d/codex.log"
   ```
   - Claude Code: run it with `run_in_background: true` (foreground `sleep` is blocked there)
     and continue on its completion notification.
   - Other harnesses: run it in the foreground with a tool timeout of at least 180 s.
   - Repeat while `state=running`. Give the user a one-line progress note every 5 polls.
3. **Stall check**: compare `log_bytes` with the previous poll. When it has not grown for 5
   consecutive polls (about 10 minutes), show the log tail and ask the user whether to keep
   waiting or stop. Never stop Codex on your own; long reasoning can be silent for minutes.
4. **Stop** (only on the user's request): `pkill -TERM -P <pid>`, then poll once. If still
   `state=running`, run `pkill -KILL -P <pid>; kill -KILL <pid>`. Report that the run was stopped.
5. **Result**: on `state=exited code=0`, read `last-message.txt` as Codex's output. On a
   non-zero code or `state=lost` (launcher killed before recording an exit code), report the log
   tail verbatim as the error.
6. **Cleanup**: only after `state=exited` or `state=lost`, remove each file by name with
   `rm -f` (`prompt.txt`, `codex.log`, `last-message.txt`, `exit-code`, `exit-code.tmp`), then
   `rmdir '<run dir>'`. Never delete by wildcard, and report a failed deletion.

## What To Do

1. List the usable models with the `get_models.py` command above and remember the rows as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `-c model_reasoning_effort=`, and the user request.
3. Judge the task's complexity, then fill only unspecified options from the listing.
4. Announce the resolved choice in one line, including the literal model slug.
5. Create the run directory and write `prompt.txt` as described in Prompt Transport.
6. Launch Codex detached as in Execution Monitoring step 1, substituting the literal resolved
   slug and effort (no `$VAR` references).
7. Poll until `state=exited` or `state=lost`, applying the stall check; then read the result
   and clean up the run directory as in Execution Monitoring steps 2 ~ 6.
8. Validate Codex output against the real code.
9. Deliver Codex output, validation, and brief commentary.
