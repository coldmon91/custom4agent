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
- The delegated run may become blocked during work, so periodic checks for blocking are necessary.
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

- **Raw stdin**: when the execution tool can write to the process's stdin, send the complete
  prompt through it and close stdin.
- **Prompt file**: otherwise, hand the prompt over as a file redirected to stdin. Claude Code's
  Bash tool takes this path: it has no stdin input and the process sees `/dev/null`.
  1. Pick a directory outside the workspace that only the current user can enter: the session
     scratchpad when one is provided, else a fresh `mktemp -d` directory. Kept outside the
     workspace, the file never shows up in a `git status` check.
  2. Write the prompt with the file-writing tool, never a shell command, to a new file named
     `claude-prompt-<random suffix>.txt`. A suffix fresh per invocation keeps parallel runs apart.
  3. Append `< '<absolute path>'` to the command. Single quotes stop the shell from expanding `$`
     or backticks in the path; abort if the path itself contains `'`.
  4. Once the process has exited, on success, failure, or timeout alike, delete that one file and
     `rmdir` the `mktemp -d` directory if one was made. Never delete by wildcard, and report a
     failed deletion.
- Do not add a prompt argument. `claude -p` reads the whole prompt from stdin only when no
  prompt argument is given.
- If neither transport is available, abort and report the unsupported execution environment.

## What To Do

1. List the selectable models with the `get_models.py` command above and remember the rows as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `--effort`, and the user request.
3. Judge the task's complexity, then fill only unspecified options from the listing.
4. Announce the resolved choice in one line, including the literal model alias and effort level.
5. Record the pre-run state with `git status --short` so the post-run diff can be attributed.
6. Build the command, substituting the literal resolved alias for `<model>` (no `$VAR` references):
   ```bash
   claude -p --no-session-persistence --strict-mcp-config \
     --permission-mode acceptEdits \
     --tools "Read,Grep,Glob,Edit,Write,Bash" \
     --allowedTools "Read Grep Glob Edit Write Bash" \
     --model <model> --effort <level>
   ```
7. Deliver the prompt as described in Prompt Transport: through raw stdin, closed afterward, or
   as `< '<prompt file>'` appended to the command once the file is written.
8. Execute with Bash and set timeout to 600000 ms.
   When a prompt file was used, delete it once the process has exited, including after a timeout.
9. Compare `git status --short` against the step 5 snapshot and confirm every change sits inside the
   workspace and inside the requested scope. Report any file touched outside that scope immediately.
10. Inspect the resulting diff yourself.
11. Run or review relevant verification when feasible.
12. Deliver the CLI output, your validation, changed files, and remaining risks.
