---
name: claude-review
description: "Run Claude Code CLI in read-only mode for code review, analysis, debugging, and second opinions."
---

# Claude Review

Use the Claude Code CLI as a read-only reviewer. The delegated run must analyze and suggest only.

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

- Symbol lookup, path checks, short Q&A: the fastest alias row, effort `medium`.
- Single-file review, moderate refactoring suggestions, multi-turn analysis: the middle alias row,
  effort `medium`, raised to `high` for multi-turn analysis.
- Cross-module review, bug analysis, architecture, security, concurrency, root cause tracing: the
  strongest alias row, effort `high`.
- Any of the above where incorrect advice has high risk, the evidence is ambiguous, or the analysis
  spans several subsystems: the strongest alias row, effort `xhigh`.

## Rules

- Reply in Korean.
- Use non-interactive print mode: `claude -p`.
- Always include `--restricted`. It removes the command-running tools and WebFetch, confines the
  file tools to the working directory, and refuses `bypassPermissions`, so read-only is enforced
  by the CLI rather than by the prompt alone.
- Use `--tools "Read,Grep,Glob"` and `--allowedTools "Read Grep Glob"`. Do not name `Bash`,
  `Edit`, `Write`, or any other command-running or file-writing tool.
- Always include `--no-session-persistence` so a delegated run leaves no resumable session behind.
- Always include `--strict-mcp-config` so no MCP server from the target repository is loaded.
- Never use `--dangerously-skip-permissions` or `--allow-dangerously-skip-permissions`.
- Do not allow the delegated run to modify, create, or delete files.
- Run with the working directory set to the workspace; `--restricted` confines file reads to it.
  Pass `--add-dir` only when the user explicitly asks for another readable directory.
- Deliver the prompt only as described in Prompt Transport.
- The delegated run may become blocked during work, so periodic checks for blocking are necessary.
- If the CLI returns an error, report it verbatim.

## Prompt Construction

Do not pass the user's raw prompt directly. Assemble this prompt.

```text
[배경]
{summary of recent conversation context, 3 ~ 15 sentences}

[작업]
{specific read-only analysis task. Let the reviewer choose the necessary scope unless the user named files.}

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
5. Build the command, substituting the literal resolved alias for `<model>` (no `$VAR` references):
   ```bash
   claude -p --restricted --no-session-persistence --strict-mcp-config \
     --tools "Read,Grep,Glob" --allowedTools "Read Grep Glob" \
     --model <model> --effort <level>
   ```
6. Deliver the prompt as described in Prompt Transport: through raw stdin, closed afterward, or
   as `< '<prompt file>'` appended to the command once the file is written.
7. Execute with Bash and set timeout to 300000 ms.
   When a prompt file was used, delete it once the process has exited, including after a timeout.
8. Validate the output against the real code.
9. Deliver the CLI output, validation, and brief commentary.
