---
name: codex-review
description: "Run Codex CLI in read-only mode for code review, analysis, debugging, and second opinions."
---

# Codex Review

Use OpenAI Codex CLI as a read-only reviewer. Codex must analyze and suggest only.

## Model Resolution

Run `get_models.py` (in this skill's parent directory) once per invocation. Resolve its path
against this `SKILL.md`'s absolute location and run it with the absolute path:

```bash
python3 "<skill dir>/../get_models.py"
```

Output is one line: `<LATEST_SOL_MODEL>\t<LATEST_TERRA_MODEL>\t<LATEST_LUNA_MODEL>`. Capture the
three tab-separated slugs as
**plain strings** and substitute the literal text into every `codex` command (env vars do not
survive across Bash calls).

If any field is empty, abort and report it. Fallback slug reference:
`https://developers.openai.com/codex/models`. Do not read model env vars or hardcode slugs.

## Arguments

`$ARGUMENTS` format: `[options] "<prompt>"`

- `-m <model>`: Model. If omitted, auto-select by tier.
- `-c model_reasoning_effort=<level>`: Reasoning level. Choices: `medium`, `high`, `xhigh`.

User-specified values always take precedence.

## Tier Selection

Pick dynamically based on task complexity. When uncertain, step up one tier.

- Tier 1: `<LATEST_LUNA_MODEL>` / `medium`
- Tier 2: `<LATEST_TERRA_MODEL>` / `medium` or `high`
- Tier 3: `<LATEST_SOL_MODEL>` / `high`
- Tier 4: `<LATEST_SOL_MODEL>` / `xhigh`

Use Tier 1 for symbol lookup, path checks, and short Q&A.
Use Tier 2 for single-file review, moderate refactoring suggestions, or multi-turn analysis.
Use Tier 3 for cross-module review, bug analysis, architecture, security, concurrency, or root cause tracing.
Use Tier 4 when Tier 3 conditions apply and incorrect advice has high risk,
the evidence is ambiguous, or the analysis spans several subsystems.

## Rules

- Reply in Korean.
- Use non-interactive `e`.
- Use `codex -a never e -s read-only`.
- Always include `--skip-git-repo-check`.
- Do not use `--dangerously-bypass-approvals-and-sandbox`.
- Do not allow Codex to modify, create, or delete files.
- Codex may become blocked during work, so periodic checks for blocking are necessary.
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

## What To Do

1. Resolve the three model slugs with the `get_models.py` script above and remember them as plain strings.
2. Parse `$ARGUMENTS` for `-m`, `-c model_reasoning_effort=`, and the user request.
3. Classify the tier and fill only unspecified options.
4. Announce the resolved choice in one line, including the literal model slug.
5. Build the command, substituting the literal resolved slug for `<model>` (no `$VAR` references):
   ```bash
   codex -a never e --skip-git-repo-check -s read-only \
     -m <model> -c model_reasoning_effort=<level> "<prompt>"
   ```
6. For a long prompt, pipe via stdin with the same resolved model and level:
   ```bash
   printf '%s\n' "<prompt>" | codex -a never e --skip-git-repo-check -s read-only \
     -m <model> -c model_reasoning_effort=<level> \
     "아래 stdin 입력을 기반으로 작업을 수행해라"
   ```
7. Execute with Bash and set timeout to 300000 ms.
8. Validate Codex output against the real code.
9. Deliver Codex output, validation, and brief commentary.
