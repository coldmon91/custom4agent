---
name: cmux-new
description: "cmux 에 새 pane 을 만들고 선택한 AI 에이전트 CLI 를 띄워 작업을 위임한다."
---

# cmux New Pane Delegate

cmux 워크스페이스 안에서 `new-split` 으로 새 pane 을 만들고, 사용자가 지정한 (혹은 추론된) AI 에이전트 CLI 를 그 pane 에서 띄운 뒤, 위임 프롬프트를 주입해 작업을 시작시킨다. 본 명령은 **오케스트레이션 + 진행 모니터링** 을 담당한다 — 위임을 시작한 뒤 새 pane 의 작업이 완료될 때까지 주기적으로 `read-screen` 으로 폴링하여 사용자에게 최종 결과를 보고한다.

## 선행 조건

본 command 는 cmux CLI 의 세부 동작 (key 표기, send 자동 개행 없음, surface ref 파싱, sandbox 정책 등) 에 의존한다. **다른 작업을 시작하기 전에 먼저 `cmux` skill 을 호출** 하여 tool guide 컨텍스트를 적재한다.

```
Skill: cmux
```

skill 적재 후 본문 절차를 진행한다. skill 본문과 본 command 의 규칙이 충돌하면 skill 본문을 우선한다 (skill 이 단일 출처).

## Arguments

`$ARGUMENTS` format: `[options] "<task>"`

- `-a <agent>`: 사용할 에이전트. `claude` | `codex` | `opencode` | `omx` | `omc` | `gemini` | `aider`. 생략 시 작업 성격으로 추론하고, 모호하면 사용자에게 확인.
- `-d <direction>`: 분할 방향. `right` (기본) | `down` | `left` | `up`.
- `-w <seconds>`: 에이전트 부팅 대기 시간. 기본 5.

User-specified values always take precedence.

## 사전 점검

작업 시작 전 다음을 확인한다.

```bash
cmux ping                       # cmux 가 떠 있는지
cmux current-workspace          # 작업할 워크스페이스
```

cmux 가 응답하지 않으면 사용자에게 알리고 중단한다. 추측으로 우회하지 않는다.

## 에이전트 launch 명령 표

| -a 값 | LAUNCH_CMD | 비고 |
|---|---|---|
| `claude` | `claude` | Claude Code CLI |
| `codex` | `codex` | 기본 sandbox. 위임된 작업이 cmux 소켓을 다시 호출해야 하는 경우에만 `codex -s danger-full-access -a never` 사용 — 이 조합은 사용자 명시 승인 후에만 |
| `opencode` | `cmux omo` | cmux 단축어 |
| `omx` | `cmux omx` | cmux 단축어 |
| `omc` | `cmux omc` | cmux 단축어 |
| `gemini` | `gemini` | Gemini CLI |
| `aider` | `aider` | aider |

표에 없는 값을 받으면 그대로 LAUNCH_CMD 로 사용하되 사용자에게 한 번 확인한다.

## 에이전트 자동 추론 규칙 (-a 생략 시)

- 코드 구현·리팩터·테스트 추가 → `codex`
- 광범위 분석·리뷰·설계 토론 → `claude`
- 사용자가 평소 쓰는 에이전트가 명시적으로 드러나 있으면 그것을 우선
- 위 어느 것도 확신이 없다면 `AskUserQuestion` 으로 묻는다

## 실행 절차

1. 분할 생성 후 stdout 에서 `surface:N` 파싱
2. LAUNCH_CMD 주입 → 부팅 대기
3. 위임 프롬프트 주입
4. 사용자에게 새 surface ref 안내
5. **주기적 폴링** — `read-screen` 으로 완료 신호가 확인될 때까지 추적
6. 완료 감지 후 결과를 요약해 사용자에게 보고

```bash
SURF=$(cmux new-split "$DIRECTION" | awk '{for (i=1; i<=NF; i++) if ($i ~ /^surface:/) {print $i; exit}}')
if [ -z "$SURF" ]; then
  echo "new-split 실패 — cmux 상태 확인 필요" >&2
  exit 1
fi

# LAUNCH_CMD 는 단일 라인 — 기존 방식 그대로
cmux send --surface "$SURF" "${LAUNCH_CMD}\n"
sleep "${WAIT:-5}"

# 위임 프롬프트는 멀티라인 — bracketed paste mode 로 감싸서 한 번에 paste 후 별도 enter
# 일반 "${PROMPT}\n" 방식으로 보내면 매 줄이 개별 submit 되어 첫 줄만 들어가거나 N 회 제출됨
cmux send --surface "$SURF" $'\e[200~'"$DELEGATE_PROMPT"$'\e[201~'
cmux send-key --surface "$SURF" enter

echo "Delegated to $SURF (agent=$AGENT) — 진행 모니터링 시작"

# 이후: cmux read-screen --surface $SURF --lines 60 을 주기적으로 호출하여
# 완료 신호 (프롬프트 복귀, "완료/Done" 문구, agent CLI 의 idle 상태) 가 보일 때까지 추적
```

> 멀티라인 프롬프트 송신 상세는 `cmux` skill 본문의 `3-2. 멀티라인 프롬프트 전송 (bracketed paste mode)` 절을 단일 출처로 따른다. bracketed paste 가 비활성화된 에이전트에 대비한 fallback (soft newline 키 분할 송신) 도 그쪽 절에 명시되어 있다.

## 진행 모니터링 (필수)

위임 후 종료하지 말고 다음 절차로 완료를 확인한다.

- 위임 직후 즉시 1회 `cmux read-screen --surface "$SURF" --lines 60` 으로 부팅 결과 확인
- 이후 작업 성격에 맞는 간격으로 폴링
  - 짧은 코드 수정·단답형 분석: 30 초 내외
  - 일반 구현·테스트 추가: 60 초 내외
  - 장시간 빌드·대규모 분석: 1 ~ 2 분
- 완료 신호로 간주하는 표시
  - 에이전트 CLI 의 입력 프롬프트가 다시 idle 상태로 복귀
  - 출력에 "완료", "Done", "Finished", "이상입니다" 등 종료 어휘
  - 위임 프롬프트의 `[출력 형식]` 헤더 (`## 변경 사항`, `## 검증`) 가 모두 채워진 상태
- 무한 폴링 금지 — 합리적인 상한 (기본 10회 또는 사용자 지정 timeout) 을 두고 초과 시 사용자에게 상태 알림
- 폴링 중 에이전트가 추가 입력을 기다리는 것으로 보이면 (질문 프롬프트 등) 즉시 사용자에게 알리고 지시를 받는다 — 임의로 응답을 주입하지 않는다
- 사용자가 명시적으로 "위임만 하고 끝내라" 고 지시한 경우에만 모니터링을 생략한다

## 위임 프롬프트 구성

사용자의 raw 입력을 그대로 보내지 말고 아래 구조로 감싼다.

```text
[배경]
{최근 대화 컨텍스트 요약 3 ~ 10 문장. 사용자가 명시한 사실만 포함.}

[작업]
{$ARGUMENTS 의 task 본문. 사용자가 지명한 파일·경로만 포함.}

[제약]
- 요청 범위에 직접 필요한 파일만 다뤄라.
- 사용자 변경을 되돌리지 마라.
- 작업 후 변경 파일 목록과 검증 명령·결과를 보고해라.
- 비밀정보·자격증명을 출력에 노출하지 마라.

[출력 형식]
## 변경 사항
- 수정한 파일과 핵심 변경

## 검증
- 실행한 명령
- 성공 또는 실패 결과
```

## Rules

- Reply in Korean.
- 새 pane 의 surface ref 는 반드시 stdout 파싱으로 확정한다. UUID·인덱스를 추측하지 않는다.
- `send` 는 자동 개행이 없다 — Enter 가 필요하면 `\n` 을 텍스트 끝에 붙이거나 `send-key … enter` 를 별도 호출한다.
- 멀티라인 위임 프롬프트는 반드시 bracketed paste mode (`$'\e[200~' … $'\e[201~'`) 로 감싸 한 번에 paste 한 뒤 별도 `send-key enter` 로 submit 한다. 일반 `"\n"` 방식 송신은 매 줄이 개별 submit 되어 프롬프트가 깨진다 — 상세는 `cmux` skill `3-2` 절.
- `send-key` 의 키 표기는 `ctrl+c`, `enter`, `tab` 형식 (`C-c` 같은 tmux 표기 금지).
- 비밀정보·자격증명·민감 토큰을 `send` 로 주입하지 않는다.
- 사용자가 띄워둔 기존 pane 을 닫거나 재사용하지 않는다 — 항상 새 pane 을 만든다.
- Codex 를 `danger-full-access` 로 띄우는 경우 반드시 사용자 명시 승인을 받은 후에만 수행한다.
- 위임 후 종료하지 않는다 — 새 pane 의 작업이 끝날 때까지 주기적 `read-screen` 폴링으로 진행 상태를 추적하고, 완료 후 결과를 요약해 사용자에게 보고한다. (사용자가 명시적으로 위임만 요청한 경우 예외)

## 보고 형식

위임 시점에 1차 안내, 완료 감지 후 최종 보고를 한다.

### 1차 안내 (위임 직후)

```text
## Delegated
- agent: {AGENT}
- surface: surface:N
- workspace: workspace:M
- launch: {LAUNCH_CMD}

## 모니터링
- 진행 확인 중 (간격: {N}s, 상한: {N}회)
- 추가 지시 필요 시: cmux send --surface surface:N "<message>\n"
```

### 최종 보고 (완료 감지 후)

```text
## Result (surface:N)
- 상태: 완료 | 중단 | timeout
- 소요 시간: 약 {N}초

## 변경 사항
{위임된 에이전트가 보고한 변경 요약}

## 검증
{에이전트가 실행한 명령과 결과}
```
