---
name: claude-agent
description: "Run Claude Code CLI as a workspace-write implementation agent for delegated coding tasks."
---

# Claude Agent

Use the Claude Code CLI as a delegated implementation agent. Claude may modify files in the
workspace only.

## Model Listing

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py"
```

It prints one row per model the `claude` CLI can currently select, strongest family first:

```
MODEL                 EFFORTS                    DESCRIPTION
fable                 low,medium,high,xhigh,max  Alias for the latest Fable model
claude-fable-5-1[1m]  low,medium,high,xhigh,max  Fable 5.1 · Most capable for your hardest and longest-running tasks
opus                  low,medium,high,xhigh,max  Alias for the latest Opus model
```

- `MODEL`: the literal alias or full model name to pass to `--model`.
- `EFFORTS`: the levels `--effort` accepts. Never pass a level absent from its list.
- `DESCRIPTION`: the account's own summary for an extra model option, or the alias's family.

The `claude` CLI has no model enumeration command, so the script reads the alias and effort
ladders out of `claude --help` and the account's extra model options (e.g. a `[1m]` variant).
Aliases such as `opus` or `sonnet` always resolve to the newest model of that family, which is why
the listing carries aliases rather than dated slugs.
Add `--slugs` for bare names, `--json` for structured output.

Capture the chosen model and effort as **plain strings** and substitute the literal text into every
`claude` command (env vars do not survive across Bash calls).

On failure the script exits non-zero with an `error:` line on stderr; abort and report that line
verbatim. A `warning:` line means the listing degraded — the help text stopped naming aliases or
effort levels, so the built-in ladder was used. The listing is still usable, but say so in your
announcement. Verify any user-supplied model against this listing. Do not read model env vars or
hardcode slugs.

## Arguments

`$ARGUMENTS` format: `[options] "<prompt>"`

- `-m <model>`: Model alias or full model name. If omitted, select one from the listing.
- `--effort <level>`: Effort level. Must appear in the chosen model's `EFFORTS` column.

User-specified values always take precedence.

## Model Selection

Rows are grouped by family, strongest first; the first alias row is the most capable family and
the last alias row the fastest. Prefer alias rows, and pick an extra option row only when the task
needs what its `DESCRIPTION` offers, such as a larger context window.
Step up one family when uncertain. Take the effort from that row's `EFFORTS` column; when the
target level is absent, use the highest listed level below it.

- Small, localized edits: the fastest alias row, effort `medium`.
- Ordinary bug fixes, focused refactors, test additions: the middle alias row, effort `high`.
- Cross-module changes, root cause fixes, concurrency, security, migration work: the strongest
  alias row, effort `high`.
- Any of the above with high uncertainty, high failure cost, ambiguous architecture tradeoffs, or
  several subsystems to coordinate: the strongest alias row, effort `xhigh`.

## Rules

- Reply in Korean.
- Use non-interactive print mode: `claude -p`.
- **`-p` mode has no sandbox.** `--permission-mode acceptEdits` auto-approves edits and the
  allowed `Bash` tool runs real commands, so nothing mechanically confines the run to the
  workspace. The write boundary is prompt-level only, so the `[제약]` block and the post-run
  verification in step 9 are what enforce it — never skip either.
- Use `--tools "Read,Grep,Glob,Edit,Write,Bash"` and `--allowedTools "Read Grep Glob Edit Write Bash"`.
  `Bash` is included so Claude can run builds and tests; drop it from both lists when the task
  needs no command execution.
- Always include `--no-session-persistence` so a delegated run leaves no resumable session behind.
- Always include `--strict-mcp-config` so no MCP server from the target repository is loaded.
- Do not pass `--safe-mode` or `--bare`; `CLAUDE.md` and `AGENTS.md` carry the project rules the
  delegated run must follow.
- Never use `--dangerously-skip-permissions` or `--allow-dangerously-skip-permissions`.
- Run with the working directory set to the workspace. Do not pass `--add-dir` unless the user
  explicitly requests another writable directory.
- Claude must not run destructive commands such as `rm`, `git reset`, or checkout-based reverts.
- Deliver the prompt only as described in Prompt Transport.
- Run the CLI only as described in Execution Monitoring: detached, polled, never under a
  fixed timeout.
- If the CLI returns an error, report it verbatim.

## Prompt Construction

Do not pass the user's raw prompt directly. Assemble this prompt.

```text
[배경]
{summary of recent conversation context, 3 ~ 15 sentences}

[작업]
{specific delegated implementation task. Include named files only when the user named them.}

[제약]
- 현재 작업 디렉토리 밖의 파일을 수정하거나 생성하지 마라.
- rm, git reset, git checkout 등 되돌릴 수 없는 명령을 실행하지 마라.
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
The CLI runs detached (see Execution Monitoring), so the prompt always travels as a file
redirected to stdin.

1. Create a fresh run directory outside the workspace that only the current user can enter:
   `mktemp -d '<scratchpad>/claude-run-XXXXXX'` when a session scratchpad is provided, else
   `mktemp -d`. One directory per invocation keeps parallel runs apart and keeps the files out
   of `git status`. Abort if the path contains `'`.
2. Write the prompt with the file-writing tool, never a shell command, to `<run dir>/prompt.txt`.
- Do not add a prompt argument. `claude -p` reads the whole prompt from stdin only when no
  prompt argument is given.
- If no file-writing tool is available, abort and report the unsupported execution environment.

## Execution Monitoring

A delegated run can outlast any fixed tool timeout, and a timeout kill is reported as a failure.
Never run the delegated run in the foreground or under a wall-clock timeout; launch it detached and check
its state periodically until it ends.

Run directory files: `prompt.txt` (input), `output.txt` (final reply on stdout), `error.log`
(stderr), `exit-code` (written once the CLI exits). Print mode writes nothing to stdout until the
run finishes, so an empty `output.txt` during the run is normal.

1. **Launch**: one Bash call from the workspace directory that returns immediately. Substitute
   literal text for `<model>`, `<level>`, and `<run dir>`; the run directory reaches the script as
   `$1`, so no path is quoted inside `sh -c`.
   ```bash
   nohup sh -c 'claude -p --no-session-persistence --strict-mcp-config \
       --permission-mode acceptEdits \
       --tools "Read,Grep,Glob,Edit,Write,Bash" \
       --allowedTools "Read Grep Glob Edit Write Bash" \
       --model <model> --effort <level> \
       < "$1/prompt.txt" > "$1/output.txt" 2> "$1/error.log"
     rc=$?; echo "$rc" > "$1/exit-code.tmp"; mv "$1/exit-code.tmp" "$1/exit-code"' \
     sh '<run dir>' > /dev/null 2>&1 &
   echo "pid=$!"
   ```
   Remember the printed pid as a plain string.
2. **Poll**: each call waits at most 120 s and returns early once the CLI exits.
   ```bash
   d='<run dir>'; p=<pid>; n=0
   while [ ! -f "$d/exit-code" ] && kill -0 "$p" 2>/dev/null && [ "$n" -lt 120 ]; do
     sleep 5; n=$((n + 5))
   done
   if [ -f "$d/exit-code" ]; then echo "state=exited code=$(cat "$d/exit-code")"
   elif kill -0 "$p" 2>/dev/null; then echo "state=running"
   else echo "state=lost"; fi
   echo "output_bytes=$(wc -c < "$d/output.txt") error_bytes=$(wc -c < "$d/error.log")"
   tail -n 20 "$d/error.log"
   ```
   - Claude Code: run it with `run_in_background: true` (foreground `sleep` is blocked there)
     and continue on its completion notification.
   - Other harnesses: run it in the foreground with a tool timeout of at least 180 s.
   - Repeat while `state=running`. Give the user a one-line progress note every 5 polls.
3. **Check-in**: print mode emits no progress, so silence alone is not a stall. After 15 polls
   (about 30 minutes) and every 15 polls after that, tell the user the elapsed time with the
   `error.log` tail and ask whether to keep waiting or stop. Never stop the run on your own.
4. **Stop** (only on the user's request): `pkill -TERM -P <pid>`, then poll once. If still
   `state=running`, run `pkill -KILL -P <pid>; kill -KILL <pid>`. Report that the run was stopped.
5. **Result**: on `state=exited code=0`, read `output.txt` as the CLI output. On a non-zero code
   or `state=lost` (launcher killed before recording an exit code), report the `error.log` tail
   and `output.txt` verbatim as the error.
6. **Cleanup**: only after `state=exited` or `state=lost`, remove each file by name with
   `rm -f` (`prompt.txt`, `output.txt`, `error.log`, `exit-code`, `exit-code.tmp`), then
   `rmdir '<run dir>'`. Never delete by wildcard, and report a failed deletion.

## What To Do

1. List the selectable models with the `get_models.py` command above and remember the rows as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `--effort`, and the user request.
3. Judge the task's complexity, then fill only unspecified options from the listing.
4. Announce the resolved choice in one line, including the literal model alias and effort level.
5. Record the pre-run state with `git status --short` so the post-run diff can be attributed.
6. Create the run directory and write `prompt.txt` as described in Prompt Transport.
7. Launch the CLI detached as in Execution Monitoring step 1, substituting the literal resolved
   alias and effort (no `$VAR` references).
8. Poll until `state=exited` or `state=lost`, applying the check-in; then read the result and
   clean up the run directory as in Execution Monitoring steps 2 ~ 6.
9. Compare `git status --short` against the step 5 snapshot and confirm every change sits inside the
   workspace and inside the requested scope. Report any file touched outside that scope immediately.
10. Inspect the resulting diff yourself.
11. Run or review relevant verification when feasible.
12. Deliver the CLI output, your validation, changed files, and remaining risks.
