---
name: pi-agent
description: "Run pi CLI as a workspace-write implementation agent for delegated coding tasks."
---

# Pi Agent

Use pi CLI as a delegated implementation agent. Pi may modify files in the workspace only.

## Model Listing

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py" --sort strength
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
structured output. Without `--sort strength`, rows are ordered by provider, then model lines and
versions newest first.

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

- Small, localized edits: a low-cost row, thinking `off` or `low`.
- Ordinary bug fixes, focused refactors, test additions: a mid-cost row, thinking `medium`.
- Cross-module changes, root cause fixes, concurrency, security, migration work: a top row,
  thinking `high`.
- Any of the above with high uncertainty, high failure cost, ambiguous architecture tradeoffs, or
  several subsystems to coordinate: the top row at `xhigh` or `max` when it supports one.

## Rules

- Use non-interactive print mode: `pi -p`.
- **Pi has no sandbox.** Unlike a sandboxed agent, nothing mechanically confines pi's writes or
  its `bash` commands to the workspace. The write boundary is prompt-level only, so the `[제약]`
  block and the post-run verification in step 9 are what enforce it — never skip either.
- Use `--tools read,grep,find,ls,edit,write,bash`. `bash` is included so pi can run builds and
  tests; drop it from the list when the task needs no command execution.
- Always include `--no-session` so a delegated run leaves no session file behind.
- Always include `--no-approve` so project-local extensions and skills in the target repository
  are never loaded or trusted.
- Do not pass `-nc` / `--no-context-files`; `AGENTS.md` and `CLAUDE.md` carry the project rules pi
  must follow.
- Run pi with the working directory set to the workspace; pi has no `--add-dir` equivalent and
  operates relative to the current directory.
- Pi must not run destructive commands such as `rm`, `git reset`, or checkout-based reverts.
- Deliver the prompt only as described in Prompt Transport.
- Run the CLI only as described in Execution Monitoring: detached, polled, never under a
  fixed timeout.
- If pi returns an error, report it verbatim.

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
   `mktemp -d '<scratchpad>/pi-run-XXXXXX'` when a session scratchpad is provided, else
   `mktemp -d`. One directory per invocation keeps parallel runs apart and keeps the files out
   of `git status`. Abort if the path contains `'`.
2. Write the prompt with the file-writing tool, never a shell command, to `<run dir>/prompt.txt`.
- Do not use `@file` or add a message argument. `@file` wraps the text in a `<file>` tag,
  and pi joins stdin, file text, and the first message with no separator. Pi trims stdin
  and exits 0 without running when it is empty, so exit 0 alone does not prove the prompt
  arrived; confirm the output answers the task.
- If no file-writing tool is available, abort and report the unsupported execution environment.

## Execution Monitoring

A delegated run can outlast any fixed tool timeout, and a timeout kill is reported as a failure.
Never run pi in the foreground or under a wall-clock timeout; launch it detached and check
its state periodically until it ends.

Run directory files: `prompt.txt` (input), `output.txt` (final reply on stdout), `error.log`
(stderr), `exit-code` (written once the CLI exits). Print mode writes nothing to stdout until the
run finishes, so an empty `output.txt` during the run is normal.

1. **Launch**: one Bash call from the workspace directory that returns immediately. Substitute
   literal text for `<model>`, `<level>`, and `<run dir>`; the run directory reaches the script as
   `$1`, so no path is quoted inside `sh -c`.
   ```bash
   nohup sh -c 'pi -p --no-session --no-approve --tool-mode write \
       --tools read,grep,find,ls,edit,write,bash \
       --model <model> --thinking <level> \
       < "$1/prompt.txt" > "$1/output.txt" 2> "$1/error.log"
     rc=$?; echo "$rc" > "$1/exit-code.tmp"; mv "$1/exit-code.tmp" "$1/exit-code"' \
     sh '<run dir>' > /dev/null 2>&1 &
   echo "pid=$!"
   ```
   `--tool-mode write` is required: the default `auto` mode screens non-read-only calls and a
   print-mode run has no UI to approve one, so a screened call would be refused outright with no
   recourse. Step 9's diff review is what bounds the delegated run instead.
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

1. List the reachable models with the `get_models.py` command above and remember the rows as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `--thinking`, and the user request.
3. Judge the task's complexity, then fill only unspecified options from the listing.
4. Announce the resolved choice in one line, including the literal `provider/id` slug and level.
5. Record the pre-run state with `git status --short` so the post-run diff can be attributed.
6. Create the run directory and write `prompt.txt` as described in Prompt Transport.
7. Launch the CLI detached as in Execution Monitoring step 1, substituting the literal resolved
   slug and thinking level (no `$VAR` references).
8. Poll until `state=exited` or `state=lost`, applying the check-in; then read the result and
   clean up the run directory as in Execution Monitoring steps 2 ~ 6.
9. Compare `git status --short` against the step 5 snapshot and confirm every change sits inside the
   workspace and inside the requested scope. Report any file touched outside that scope immediately.
10. Inspect the resulting diff yourself.
11. Run or review relevant verification when feasible.
12. Deliver pi output, your validation, changed files, and remaining risks.
