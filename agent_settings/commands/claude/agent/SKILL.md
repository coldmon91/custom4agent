---
name: claude-agent
description: "Run Claude Code CLI as a workspace-write implementation agent for delegated coding tasks."
---

# Claude Agent

Use the Claude Code CLI as a delegated implementation agent. Claude may modify files in the
workspace only.

## Model Resolution

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py" --profile agent
```

It prints the resolved tier table as `key=value` lines, three per tier:

```
tier<N>_model=<alias>
tier<N>_effort=<level>
tier<N>_supported_efforts=<comma-separated levels>
```

Capture these as **plain strings** and substitute the literal text into every `claude` command
(env vars do not survive across Bash calls). Never pass an effort that is absent from that tier's
`supported_efforts`.

The `claude` CLI has no model enumeration command, so the script reads the alias and effort
ladders out of `claude --help` and the account's extra model options. Aliases such as `opus` or
`sonnet` always resolve to the newest model of that family, which is why the table carries aliases
rather than dated slugs.

On failure the script exits non-zero with an `error:` line on stderr; abort and report that line
verbatim. A `warning:` line means the table degraded — the help text stopped naming aliases or
effort levels, or roles collapsed onto one alias. The table is still usable, but say so in your
announcement. Verify any user-supplied alias against
`python3 "<skill dir>/../get_models.py" --all`. Do not read model env vars or hardcode slugs.

## Arguments

`$ARGUMENTS` format: `[options] "<prompt>"`

- `-m <model>`: Model alias or full model name. If omitted, auto-select by tier.
- `--effort <level>`: Effort level. Must appear in the chosen tier's `tier<N>_supported_efforts`.

User-specified values always take precedence.

## Tier Selection

Pick dynamically based on task complexity. When uncertain, step up one tier.
Take each tier's model and effort from the resolved `tier<N>_model` and `tier<N>_effort` values.

Use Tier 1 for small, localized edits.
Use Tier 2 for ordinary bug fixes, focused refactors, and test additions.
Use Tier 3 for cross-module changes, root cause fixes, concurrency, security, or migration work.
Use Tier 4 when Tier 3 conditions apply and the task has high uncertainty, high failure cost,
ambiguous architecture tradeoffs, or requires coordinating several subsystems.

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
- Pass the prompt through the execution tool's raw stdin channel. `claude -p` reads the whole
  prompt from stdin when no prompt argument is given.
- Never interpolate the assembled prompt into a shell command, argument, variable, heredoc, or
  `printf`/`echo` pipeline.
- If the execution tool cannot pass raw stdin without shell interpolation, abort and report the
  unsupported execution environment.
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

## What To Do

1. Resolve the tier table with the `get_models.py` command above and remember the values as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `--effort`, and the user request.
3. Classify the tier and fill only unspecified options.
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
7. Start the command and send the complete assembled prompt through the execution tool's raw stdin
   input facility, then close stdin. Do not construct a shell pipeline or place any prompt text in
   the command string.
8. Execute with Bash and set timeout to 600000 ms.
9. Compare `git status --short` against the step 5 snapshot and confirm every change sits inside the
   workspace and inside the requested scope. Report any file touched outside that scope immediately.
10. Inspect the resulting diff yourself.
11. Run or review relevant verification when feasible.
12. Deliver the CLI output, your validation, changed files, and remaining risks.
