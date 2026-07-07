---
name: codex-agent
description: "Run Codex CLI as a workspace-write implementation agent for delegated coding tasks."
---

# Codex Agent

Use OpenAI Codex CLI as a delegated implementation agent. Codex may modify files in the workspace only.

## Model Resolution

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py"
```

Output is one line: `<LATEST_MODEL>\t<LATEST_MINI_MODEL>`. Capture the two tab-separated slugs as
**plain strings** and substitute the literal text into every `codex` command (env vars do not
survive across Bash calls).

If either field is empty, abort and report it. Fallback slug reference:
`https://developers.openai.com/codex/models`. Do not read model env vars or hardcode slugs.

## Arguments

`$ARGUMENTS` format: `[options] "<prompt>"`

- `-m <model>`: Model. If omitted, auto-select by tier.
- `-c model_reasoning_effort=<level>`: Reasoning level. Choices: `medium`, `high`, `xhigh`.

User-specified values always take precedence.

## Tier Selection

Pick dynamically based on task complexity. When uncertain, step up one tier.

- Tier 1: `<LATEST_MINI_MODEL>` / `medium`
- Tier 2: `<LATEST_MODEL>` / `high`
- Tier 3: `<LATEST_MODEL>` / `high`
- Tier 4: `<LATEST_MODEL>` / `xhigh`

Use Tier 1 for small, localized edits.
Use Tier 2 for ordinary bug fixes, focused refactors, and test additions.
Use Tier 3 for cross-module changes, root cause fixes, concurrency, security, or migration work.
Use Tier 4 when Tier 3 conditions apply and the task has high uncertainty, high failure cost,
ambiguous architecture tradeoffs, or requires coordinating several subsystems.

## Rules

- Reply in Korean.
- Use non-interactive `e`.
- Use `codex -a never e -s workspace-write`.
- Always include `--skip-git-repo-check`.
- Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Keep Codex edits inside the current workspace.
- Do not pass `--add-dir` unless the user explicitly requests another writable directory.
- Codex must not run destructive commands such as `rm`, `git reset`, or checkout-based reverts.
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

## What To Do

1. Resolve the two model slugs with the `get_models.py` script above and remember them as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `-c model_reasoning_effort=`, and the user request.
3. Classify the tier and fill only unspecified options.
4. Announce the resolved choice in one line, including the literal model slug.
5. Build the command, substituting the literal resolved slug for `<model>` (no `$VAR` references):
   ```bash
   codex -a never e --skip-git-repo-check -s workspace-write \
     -m <model> -c model_reasoning_effort=<level> "<prompt>"
   ```
6. For a long prompt, pipe via stdin with the same resolved model and level:
   ```bash
   printf '%s\n' "<prompt>" | codex -a never e --skip-git-repo-check -s workspace-write \
     -m <model> -c model_reasoning_effort=<level> \
     "아래 stdin 입력을 기반으로 작업을 수행해라"
   ```
7. Execute with Bash and set timeout to 600000 ms.
8. Inspect the resulting diff yourself.
9. Run or review relevant verification when feasible.
10. Deliver Codex output, your validation, changed files, and remaining risks.
