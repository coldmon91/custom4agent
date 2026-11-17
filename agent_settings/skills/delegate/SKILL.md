---
name: delegate
description: "Delegate a coding task to another agent CLI — Codex, pi, or Claude Code — in agent mode (it edits the workspace) or review mode (read-only analysis, code review, debugging, second opinion). Use when the user asks to hand work to codex, pi, or claude, e.g. 'codex한테 리뷰 맡겨', 'pi로 구현시켜', 'claude한테 second opinion 받아줘', or invokes /delegate."
---

# Delegate

Hand one task to another agent CLI, run it detached, and verify what comes back.
`scripts/run.py` builds every CLI command and holds every permission flag; never assemble a
`codex`, `pi`, or `claude` command yourself.

Scripts live in this skill's `scripts/` directory. Resolve that path against this `SKILL.md`'s
absolute location and call the scripts with absolute paths: `python3 <scripts>/run.py ...`.

## Arguments

`$ARGUMENTS` format: `<cli> <mode> [-m <model>] [-e <effort>] "<request>"`

- `<cli>`: `codex`, `pi`, or `claude`.
- `<mode>`: `agent` (may modify files in the workspace) or `review` (analysis only).
- `-m`, `-e`: model and effort. User-specified values always take precedence.

Without explicit arguments, infer CLI and mode from the request.
Choose `agent` only when the user clearly asks for changes to be made; otherwise `review`.
If the CLI or the mode is still unclear, ask before launching.

## Procedure

1. **Models**: run `python3 <scripts>/models.py <cli>` once (with any option the reference
   names, e.g. `--sort strength` for pi) and read the CLI's reference for
   how to read its columns and pick a model: `references/codex.md`, `references/pi.md`, or
   `references/claude-code.md`. Fill only options the user left unspecified.
   On a non-zero exit, report its `error:` line verbatim and stop. Mention any `warning:` line.
2. **Announce** the resolved choice in one line: CLI, mode, literal model name, effort.
3. **Run directory**: `python3 <scripts>/run.py prepare --base <scratchpad>` (omit `--base`
   when no session scratchpad exists). It prints the path; keep it as a plain string.
4. **Prompt**: write `<run dir>/prompt.txt` with the file-writing tool, using the template for
   the mode below. Never put prompt text in a shell command, argument, heredoc, or pipeline.
5. **Snapshot** (git repositories): record `git status --porcelain` of the workspace.
6. **Launch**: `python3 <scripts>/run.py launch --run-dir <run dir> --cli <cli> --mode <mode>
   --model <model> --effort <effort> --workdir <workspace>`.
   An `error:` line means nothing started; report it and fix the cause (e.g. pick a model the
   message lists).
7. **Poll**: `python3 <scripts>/run.py poll --run-dir <run dir>` waits up to 120 s and prints JSON.
   - Claude Code: run it with `run_in_background: true` and continue on its notification.
     Other harnesses: run it in the foreground with a tool timeout of at least 180 s.
   - `advice: "wait"`: poll again. Give the user a one-line progress note every 5 polls.
   - `advice: "ask_user"`: show `elapsed_s` and `log_tail`, and ask whether to keep waiting or
     stop. Never stop on your own.
   - `advice: "done"`: go to step 8.
   - Stop only on the user's request: `python3 <scripts>/run.py stop --run-dir <run dir>`.
8. **Result**: `python3 <scripts>/run.py result --run-dir <run dir>`.
   Exit 0 prints the CLI's reply. A `warning:` about empty output means the prompt may not have
   arrived; say so. Exit 1 prints the log tail; report it verbatim as the error.
9. **Cleanup**: `python3 <scripts>/run.py cleanup --run-dir <run dir>`. Report a failure.
10. **Working tree check**: re-run `git status --porcelain` and compare with step 5.
    - `agent`: every change must sit inside the workspace and the requested scope. Report any
      file outside it immediately.
    - `review`: any new entry means the reviewer changed files. Report the paths; do not
      silently revert them.
11. **Verify and deliver**:
    - `agent`: inspect the diff yourself, run relevant verification when feasible, then deliver
      the CLI's report, your validation, changed files, and remaining risks.
    - `review`: check the findings against the real code, then deliver them with your
      validation and brief commentary.

## Prompt Templates

Do not pass the user's raw request. Fill one template; always keep `[제약]` whole.

### agent

```text
[배경]
{summary of recent conversation context, 3 ~ 15 sentences}

[작업]
{specific implementation task. Include named files only when the user named them.}

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

### review

```text
[배경]
{summary of recent conversation context, 3 ~ 15 sentences}

[작업]
{specific read-only analysis task. Let the reviewer choose the scope unless the user named files.}

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
