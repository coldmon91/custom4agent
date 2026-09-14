# Pi 작업 완료 보고 설계

## 목적과 범위

작업 완료 후 무엇을 왜 했고 어떤 효과가 있으며 무엇이 남았는지 전달하도록 공통 지침 보강.
변경 대상은 `pi-agent/APPEND_SYSTEM.md`이며, 기존 내용은 모두 보존하고 `Self-Service Before Handoff` 다음에 독립 섹션 추가.
확장 코드, 공통 `AGENTS.md`, `pi:agent` skill 의 위임 프롬프트, 도구 권한 및 개인 설정 변경은 제외.

## 보고 구성

무엇을 바꿨는가 → 왜 그 방식인가 → 사용자에게 무엇이 달라지는가 → 무엇이 남았는가, 네 요소 고정.
이유는 문제의 원인 설명이나 수행 절차의 나열이 아니라 설계 선택의 근거이며, 실질적 트레이드오프가 있을 때 기각한 대안도 명시.
효과는 좋아지는 점과 치르는 비용을 함께 기술하며, 동작 변화·성능·호환성·인접 코드 영향과 검증 결과를 포함.
두 개 이상 파일을 건드린 변경은 네 요소를 절 제목으로 노출하고, 그보다 작은 변경은 문장 안에 포함.
분량은 변경 규모에 비례하되 축약은 길이에만 적용하며, 요소 생략의 근거가 되지 않음.
변경이 없는 조회·질문 응답에는 미적용.

## 추가할 지침

```markdown
## Completion Report

- Close any task that changed code, configuration, or system state by answering four
questions in this order: what changed, why this approach, what it changes for the user,
and what remains. Shorten the wording when the change is small; never drop one of the four.
- What changed: each file as `path/to/file.rs:42` with its core change.
Do not paste diffs or replay tool output.
- Why this approach: the design choice and the reason for it — not the root cause of the
problem, not a narration of the steps. Name a rejected alternative when the tradeoff is real.
- What it changes: what improves for the user and what it costs — behavior, performance,
compatibility, side effects on adjacent code. Say plainly when behavior is unchanged.
Carry the verification result here, naming whatever stayed unverified.
- What remains: blocked scope, follow-up the change implies, decisions that need the user.
State plainly that nothing remains rather than inventing a next step.
- Use the four as explicit section labels once the change spans more than one file;
keep them inline as prose for a smaller change.
- Scale by length, not by omission — a one-line edit still answers all four in one or two
lines. Skip the report only for a question, a lookup, or a read-only investigation that
changed nothing.
```

## 검증 기준

| 사례 | 기대 동작 |
|---|---|
| 다중 파일 수정 완료 | 변경 파일과 핵심 변경, 선택 이유, 효과, 검증, 남은 작업 보고 |
| 한 줄 수정 | 네 요소를 유지한 채 한두 줄로 압축, 요소 생략 금지 |
| 검증 미실시 또는 실패 | 성공으로 보고하지 않고 미검증 범위와 실패 출력 명시 |
| 남은 작업 없음 | 해당 항목 생략, 후속 작업 창작 금지 |
| 조회·질문 응답 | 완료 보고 미적용 |
| 범위 일부 차단 | 나머지 완료 후 차단 범위와 사유를 남은 작업에 기재 |

정적 검증은 기존 내용 보존, 추가 섹션의 범위, `Task Execution` 의 보고 규칙과의 모순 여부 및 `git diff --check` 확인.
행동 검증은 새 세션에서 실제 작업을 시켜 확인하며, 실제 수행하지 않았다면 미실시로 보고.
정적 문구 검증을 모델의 행동 검증 통과로 간주하지 않음.

## 영향과 적용

`~/.pi/agent` 가 이 저장소의 `pi-agent` 를 가리키므로 Pi 전역 세션에 영향을 주는 변경.
`pi -p` 위임 실행도 같은 부록을 읽으므로 `pi:agent` skill 의 `[출력 형식]` 과 함께 적용됨.
새 세션에서 반영 확인하며, 현재 세션에 즉시 적용되었다고 가정하지 않음.
지침 변경만으로 모델의 준수를 강제하지 않음.
