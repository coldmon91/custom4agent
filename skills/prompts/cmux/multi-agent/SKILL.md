---
name: cmux-multi-agent
description: "현재 작업을 분석해 역할을 분할하고, 역할별로 여러 pane 을 생성해 병렬로 위임한다."
---

# cmux Multi-Agent Split

현재 세션의 작업을 분석해서 **독립적으로 병렬 진행 가능한 역할** 로 분할하고, 각 역할마다 새 pane 을 만들어 적합한 AI 에이전트 CLI 에 위임한다. `commands/cmux/new.md` 가 단일 위임이라면, 본 명령은 **N-way 위임** 이다.

분할이 불가능하거나 이득이 없다고 판정되면 분할을 강행하지 않고 사용자에게 단일 처리 권고로 회신한다.

## 선행 조건

본 command 는 cmux CLI 의 세부 동작 (`new-split` 방향 누적, surface ref 파싱, send 자동 개행 없음, sandbox 정책 등) 과 `commands/cmux/new.md` 의 위임 규약에 의존한다. **다른 작업을 시작하기 전에 먼저 `cmux` skill 을 호출** 하여 tool guide 컨텍스트를 적재한다.

```
Skill: cmux
```

skill 적재 후 본문 절차를 진행한다. skill 본문과 본 command 의 규칙이 충돌하면 skill 본문을 우선한다 (skill 이 단일 출처).

## Arguments

`$ARGUMENTS` format: `[options] "<task>"`

- `-n <count>`: 최대 분할 수. 기본 3. 1 이면 분할하지 않고 종료.
- `-a <map>`: 역할별 에이전트 매핑. 예: `impl=codex,review=claude,test=codex`. 생략 시 역할 성격으로 추론.
- `-d <direction>`: 초기 분할 방향. `right` (기본) | `down`. 이후 분할은 누적된다.
- `-w <seconds>`: 각 pane 의 에이전트 부팅 대기. 기본 5.
- `--dry-run`: 분할 계획만 출력하고 pane 을 만들지 않는다.

User-specified values always take precedence.

## 사전 점검

```bash
cmux ping
cmux current-workspace
```

응답 없으면 사용자에게 알리고 중단.

## 분할 가능성 판정 기준

다음을 모두 만족할 때 분할을 진행한다.

- 작업이 **둘 이상의 독립 산출물** 로 쪼개진다 (예: 구현 / 테스트 / 문서, 또는 모듈 A / 모듈 B).
- 역할 간 **공유 파일 경합이 적다** (같은 파일을 동시에 수정해야 하면 분할 이득 < 머지 비용).
- 각 역할이 **단독으로 검증 가능** (다른 역할의 결과를 기다리지 않고 자체 완료 판정 가능).
- 사용자 요청이 명시적으로 "하나의 흐름으로" 처리하라고 지시하지 않았다.

위 중 하나라도 깨지면 분할하지 않고 다음을 보고한 뒤 종료한다.

- 왜 분할이 부적합한지 (구체 근거 1 ~ 2 줄)
- 대안: 단일 위임 (`/cmux:new`) 또는 현재 세션 직접 처리

## 역할 정의 가이드

분할이 가능한 경우 각 역할에 대해 다음을 정한다.

- 역할명 (예: `impl`, `test`, `review`, `docs`, `bench`)
- 목표 산출물 (수정/생성할 파일 범위 명시)
- 검증 방법 (실행할 명령 또는 확인 기준)
- 적합한 에이전트 (`-a` 매핑이 없으면 추론)

기본 에이전트 추론:

- 코드 구현·수정·테스트 작성 → `codex`
- 광범위 분석·리뷰·설계 검토·문서 작성 → `claude`
- 사용자가 평소 쓰는 에이전트가 있으면 우선

## 실행 절차

1. 작업 분석 → 분할 가능성 판정 → (불가 시 종료)
2. 역할 N 개 (≤ `-n`) 확정
3. `--dry-run` 이면 계획만 출력하고 종료
4. 각 역할마다:
   - `cmux new-split <direction>` → stdout 에서 `surface:N` 파싱
   - LAUNCH_CMD 주입 → 부팅 대기
   - 역할별 위임 프롬프트 주입
5. 보고 형식대로 각 surface ref 와 다음 조회 명령을 안내

```bash
DIRECTION="${DIRECTION:-right}"
for ROLE in "${ROLES[@]}"; do
  SURF=$(cmux new-split "$DIRECTION" | awk '{for (i=1; i<=NF; i++) if ($i ~ /^surface:/) {print $i; exit}}')
  if [ -z "$SURF" ]; then
    echo "new-split 실패 ($ROLE) — cmux 상태 확인 필요" >&2
    break
  fi
  LAUNCH_CMD=$(launch_cmd_for "$ROLE")

  # LAUNCH_CMD 는 단일 라인 — 기존 방식 그대로
  cmux send --surface "$SURF" "${LAUNCH_CMD}\n"
  sleep "${WAIT:-5}"

  # 역할별 위임 프롬프트는 멀티라인 — bracketed paste mode 로 감싸서 한 번에 paste 후 별도 enter
  # 일반 "${PROMPT}\n" 방식은 LF 가 매 줄 Enter 로 해석되어 첫 줄만 들어가거나 N 회 제출됨
  ROLE_PROMPT=$(role_prompt "$ROLE")
  cmux send --surface "$SURF" $'\e[200~'"$ROLE_PROMPT"$'\e[201~'
  cmux send-key --surface "$SURF" enter

  echo "[$ROLE] -> $SURF"
done
```

> 멀티라인 프롬프트 송신 상세는 `cmux` skill 본문의 `3-2. 멀티라인 프롬프트 전송 (bracketed paste mode)` 절을 단일 출처로 따른다.

LAUNCH_CMD 매핑은 `commands/cmux/new.md` 의 표를 그대로 따른다 (`claude`, `codex`, `cmux omo`, `cmux omx`, `cmux omc`, `gemini`, `aider`).

## 역할별 위임 프롬프트 구성

`commands/cmux/new.md` 의 템플릿을 확장한다. 각 역할 프롬프트에 **본인 역할 범위와 다른 역할의 존재** 를 명시해 중복/충돌을 줄인다.

```text
[배경]
{전체 작업 요약 2 ~ 5 문장.}

[전체 분할]
- impl: {파일 범위}
- test: {파일 범위}
- review: {확인 범위}

[당신의 역할: {ROLE}]
{목표 산출물·작업 범위.}

[제약]
- 본인 역할 범위 밖 파일은 수정하지 않는다.
- 다른 역할이 다루는 파일에 대해서는 읽기만 한다.
- 사용자 변경을 되돌리지 않는다.
- 작업 후 변경 파일 목록과 검증 명령·결과를 보고한다.
- 비밀정보·자격증명을 출력에 노출하지 않는다.

[출력 형식]
## 변경 사항
- 수정한 파일과 핵심 변경

## 검증
- 실행한 명령
- 성공 또는 실패 결과
```

## Rules

- Reply in Korean.
- 분할이 부적합하면 강행하지 않는다 — 근거와 단일 처리 대안을 보고한다.
- 같은 파일을 둘 이상의 역할이 동시에 수정해야 하면 분할 금지 (또는 순차 위임으로 재계획 권고).
- pane 생성·LAUNCH·프롬프트 주입은 역할당 1 회로 끝낸다. 응답 폴링·결과 캡처는 본 command 의 책임이 아니다 — 보고 형식에 조회 명령을 안내한다.
- 새 pane 의 surface ref 는 반드시 stdout 파싱으로 확정한다. UUID/인덱스 추측 금지.
- `send` 는 자동 개행이 없다 — Enter 가 필요하면 `\n` 을 텍스트 끝에 붙이거나 `send-key … enter` 를 별도 호출한다.
- 멀티라인 역할별 위임 프롬프트는 반드시 bracketed paste mode (`$'\e[200~' … $'\e[201~'`) 로 감싸 한 번에 paste 한 뒤 별도 `send-key enter` 로 submit 한다 — 상세는 `cmux` skill `3-2` 절.
- 비밀정보·자격증명을 `send` 로 주입하지 않는다.
- 사용자가 띄워둔 기존 pane 을 닫거나 재사용하지 않는다 — 항상 새 pane 을 만든다.
- Codex 를 `danger-full-access` 로 띄우는 경우 반드시 사용자 명시 승인을 받은 후에만 수행한다.
- `--dry-run` 시 pane 을 생성하지 않는다.

## 보고 형식

분할을 진행한 경우:

```text
## Split plan
- task: ...
- roles: N

## Delegated
- [{role}] agent={AGENT} surface=surface:N launch={LAUNCH_CMD} scope={파일 범위}
- ...

## 다음 단계
- 진행 확인: cmux read-screen --surface surface:N --lines 60
- 추가 지시: cmux send --surface surface:N "<message>\n"
- 인수 필요 시: /cmux:assist -s surface:N
```

분할을 보류한 경우:

```text
## Split skipped
- 사유: ...
- 권고: /cmux:new -a <agent> "<task>"  또는  현재 세션에서 직접 처리
```
