---
name: claude-review
description: "Run Claude Code CLI in read-only mode for code review, analysis, debugging, and second opinions."
---

# Claude Review

Use the Claude Code CLI as a read-only reviewer. The delegated run must analyze and suggest only.

## Model Resolution

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py" --profile review
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
Tier 2 may be raised to `high` for multi-turn analysis when `tier2_supported_efforts` lists it.

Use Tier 1 for symbol lookup, path checks, and short Q&A.
Use Tier 2 for single-file review, moderate refactoring suggestions, or multi-turn analysis.
Use Tier 3 for cross-module review, bug analysis, architecture, security, concurrency, or root cause tracing.
Use Tier 4 when Tier 3 conditions apply and incorrect advice has high risk,
the evidence is ambiguous, or the analysis spans several subsystems.

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

## What To Do

1. Resolve the tier table with the `get_models.py` command above and remember the values as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `--effort`, and the user request.
3. Classify the tier and fill only unspecified options.
4. Announce the resolved choice in one line, including the literal model alias and effort level.
5. Build the command, substituting the literal resolved alias for `<model>` (no `$VAR` references):
   ```bash
   claude -p --restricted --no-session-persistence --strict-mcp-config \
     --tools "Read,Grep,Glob" --allowedTools "Read Grep Glob" \
     --model <model> --effort <level>
   ```
6. Start the command and send the complete assembled prompt through the execution tool's raw stdin
   input facility, then close stdin. Do not construct a shell pipeline or place any prompt text in
   the command string.
7. Execute with Bash and set timeout to 300000 ms.
8. Validate the output against the real code.
9. Deliver the CLI output, validation, and brief commentary.
