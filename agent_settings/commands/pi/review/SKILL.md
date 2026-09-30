---
name: pi-review
description: "Run pi CLI as an analysis-only reviewer for code review, analysis, debugging, and second opinions."
---

# Pi Review

Use pi CLI as an analysis-only reviewer. Pi must analyze and suggest, never apply.
It gets a screened shell so it can read git history; it does not get the write tools.

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
- **Pi has no sandbox.** `bash` is in the allowlist so pi can reach repository history —
  `git show <tag>:<path>`, `git log`, `git diff` — which the `read` tool cannot see because it
  only opens working-tree files. Read-only intent is therefore carried by the auto-mode gate,
  not by the allowlist, so `--tools read,grep,find,ls,bash --tool-mode auto` is mandatory.
- Never add `edit` or `write` to `--tools`. Removing the dedicated write tools keeps every
  file-changing path inside the shell, where the gate can see it.
- **The gate does not make this run read-only.** Its fast path approves a shell write landing
  inside the working directory without a classifier call, so pi can still modify the repository
  if it disregards `[제약]`. Verify the working tree after the run (step 9) and report anything
  it left behind.
- A headless run has no UI, so a `soft_deny` verdict and a classifier outage are both refused
  outright rather than put to the user. Read-only commands take the fast path, so a review that
  stays within its brief spends nothing on the classifier.
- Always include `--no-session` so a delegated run leaves no session file behind.
- Always include `--no-approve` so project-local extensions and skills in the reviewed repository
  are never loaded or trusted.
- Do not pass `-nc` / `--no-context-files`; `AGENTS.md` and `CLAUDE.md` are useful review context.
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
{specific read-only analysis task. Let pi choose the necessary scope unless the user named files.}

[제약]
- 파일을 수정, 삭제, 생성하지 마라. 분석과 제안만 수행해라.
- 코드 변경이 필요한 경우 제안으로만 제시하고, 직접 적용하지 마라.
- 셸은 읽기 전용으로만 사용해라. 리다이렉션(`>`, `>>`), `sed -i`, `tee`, `rm`, `mv`, `cp`,
  `git add`/`commit`/`checkout`/`restore` 등 저장소나 파일 시스템을 바꾸는 명령은 금지다.
- 과거 커밋이나 태그 시점의 내용이 필요하면 `git show <ref>:<path>`, `git log`, `git diff`,
  `git cat-file`, `git ls-tree` 로 읽어라. 워킹트리 파일만 보고 추측하지 마라.

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

Always include `[제약]`. Auto mode appends a system prompt that tells pi to prefer the shell for
file changes; `[제약]` is what overrides it, so never abbreviate or drop those lines.

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
   nohup sh -c 'pi -p --no-session --no-approve --tool-mode auto \
       --tools read,grep,find,ls,bash \
       --model <model> --thinking <level> \
       < "$1/prompt.txt" > "$1/output.txt" 2> "$1/error.log"
     rc=$?; echo "$rc" > "$1/exit-code.tmp"; mv "$1/exit-code.tmp" "$1/exit-code"' \
     sh '<run dir>' > /dev/null 2>&1 &
   echo "pid=$!"
   ```
   `--tool-mode auto` keeps `bash` under the screener. `--tool-mode read` would drop `bash` from
   the allowlist regardless of what is passed here, which is the configuration that leaves pi
   unable to read git history.
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
5. In a git repository, record `git status --porcelain` immediately before the run so
   step 9 has something to compare against.
6. Create the run directory and write `prompt.txt` as described in Prompt Transport.
7. Launch the CLI detached as in Execution Monitoring step 1, substituting the literal resolved
   slug and thinking level (no `$VAR` references).
8. Poll until `state=exited` or `state=lost`, applying the check-in; then read the result and
   clean up the run directory as in Execution Monitoring steps 2 ~ 6.
9. Re-run `git status --porcelain` and diff it against the step 5 snapshot. The gate's fast path
   does not stop an in-repo write, so any new entry means pi changed the working tree during a
   review: report it to the user with the paths, and do not silently revert it.
10. Validate pi output against the real code.
11. Deliver pi output, validation, the working-tree check, and brief commentary.
