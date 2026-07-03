---
name: cmux-assist
description: "현재 workspace 의 다른 pane 에서 일어나는 작업(에이전트·셸·로그 등)을 현재 세션이 대신 또는 보조하여 처리한다."
---

# cmux Assist Another Pane

지금부터 너는 같은 cmux workspace 안에 열려 있는 다른 pane 의 작업을 **현재 세션이 이어받거나 보조하여 처리** 한다. `commands/cmux/new.md` 가 작업을 **밖으로 위임** 한다면, 본 명령은 작업을 **안으로 가져온다**.

대상 pane 은 무엇이든 될 수 있다 — 대화형 에이전트 (Claude Code, Codex, opencode 등) 뿐 아니라 일반 셸, 빌드/테스트 출력, 로그 tail, REPL, vim/less, file watcher 등. 본 명령은 pane 의 종류를 가정하지 않고 화면에 보이는 컨텍스트만 단서로 삼는다.

전형적인 활용 예:

- 옆 pane 의 에이전트가 막혔거나 늦을 때 작업을 가져와 직접 진행
- 옆 pane 셸에서 실패한 명령을 보고 원인을 분석/수정
- 옆 pane 의 긴 로그/에러 출력을 읽어 요약·디버깅
- 옆 pane 에서 진행 중인 파일 검색·grep·빌드 결과를 받아 후속 작업 (편집, 다른 검색, 명령 실행) 수행
- 옆 pane 화면에 떠 있는 정보 (스택 트레이스, JSON 응답, diff 등) 를 컨텍스트로 받아 처리

## 선행 조건

본 command 는 cmux CLI 의 세부 동작 (`list-pane-surfaces` 파싱, `read-screen` 옵션, send 자동 개행 없음, key 표기, 멀티라인 송신 등) 에 의존한다. **다른 작업을 시작하기 전에 먼저 `cmux` skill 을 호출** 하여 tool guide 컨텍스트를 적재한다.

```
Skill: cmux
```

skill 적재 후 본문 절차를 진행한다. skill 본문과 본 command 의 규칙이 충돌하면 skill 본문을 우선한다 (skill 이 단일 출처).

## Arguments

`$ARGUMENTS` format: `[options] ["<additional-instruction>"]`

- `-s <surface-ref>`: 대상 surface ref (예: `surface:3`). 생략 시 `list-pane-surfaces` 로 후보를 모아 사용자에게 질문.
- `-l <lines>`: 컨텍스트 캡처 라인 수. 기본 80. 로그/긴 출력은 더 크게.
- `--scrollback`: 스크롤백 포함 캡처 (긴 이력이 필요할 때).
- `--ack`: 인수 후 대상 pane 에 "본 작업은 다른 세션이 인수합니다" 안내를 주입. 대상이 일반 셸이면 단순 코멘트로 들어가므로 보통 불필요.
- `--reply`: 작업 종료 후 결과 요약을 대상 pane 으로 회신. 기본 비활성.

User-specified values always take precedence.

`<additional-instruction>` 은 자유 문자열로, 캡처한 컨텍스트 위에 사용자가 덧붙이는 지시다. 예: "여기서 실패한 명령을 fish 호환으로 고쳐", "이 grep 결과에서 deprecated API 호출만 추려", "이 빌드 에러의 원인을 찾아".

## 사전 점검

```bash
cmux ping
cmux current-workspace
```

응답 없으면 사용자에게 알리고 중단.

## 실행 절차

### 1. 대상 pane/surface 식별

`-s` 가 지정되면 그 ref 를 검증만 한다.

미지정 시 동일 workspace 의 surface 목록을 수집한다.

```bash
cmux tree --workspace "$(cmux current-workspace)"
# 또는
cmux list-panes
cmux list-pane-surfaces --pane <pane-ref>     # pane 별로 반복
```

자기 자신 (`$CMUX_SURFACE_ID`) 은 후보에서 제외한다. 후보가 둘 이상이면 **반드시 `AskUserQuestion` 으로 사용자에게 선택을 받는다.** 추측 금지.

후보 표시 형식 예 (대상 종류를 단정하지 않고, 화면 단서를 짧게 함께 보여준다):

- `surface:2 — pane:1 [shell] "$ rg --files | wc -l ... 1284"`
- `surface:3 — pane:2 [codex] "auth 토큰 만료 처리 중..."`
- `surface:4 — pane:3 [build] "FAILED: cargo test --package …"`
- `surface:5 — pane:4 [log] "tail -f app.log — ERROR …"`

각 후보의 마지막 활동 단서는 `read-screen --surface <ref> --lines 10` 1 회 호출의 마지막 비공백 줄들로 추출한다. 종류 (`[shell]`/`[codex]`/`[build]` 등) 는 화면에서 단순 휴리스틱으로 추정한 라벨일 뿐, 확정이 아니라 사용자 선택을 돕기 위한 힌트다.

### 2. 컨텍스트 캡처

```bash
cmux read-screen --surface "$SURF" --lines "${LINES:-80}" ${SCROLLBACK:+--scrollback}
```

캡처 결과는 후속 작업의 입력일 뿐이며 그대로 사용자에게 덤프하지 않는다. 화면 종류에 따라 다음 단서를 추출한다 (대상이 무엇이냐에 따라 일부만 존재할 수 있다).

- **목표**: 사용자/에이전트가 하려던 일, 또는 실행한 명령의 의도
- **현재 상태**: 마지막 출력, 에러 메시지, 미완료 단계, 셸 프롬프트 위치
- **이미 시도된 것**: 직전 명령들, 에이전트가 이미 시도한 접근 — 중복 방지
- **제약/결정**: 화면에 보이는 사용자의 추가 지시, 환경 정보 (cwd, venv, 분기 등)
- **원시 데이터**: 스택 트레이스, JSON, diff, 검색 결과 라인 등 — 후속 처리 입력

대상 종류별 단서 예시:

- 셸 pane: 마지막 프롬프트의 cwd, 마지막 명령과 종료 코드, 직전 출력 (에러/검색 결과 등)
- 에이전트 pane: 사용자가 준 마지막 지시, 에이전트의 마지막 응답, 진행 단계
- 빌드/테스트 pane: 실패한 타깃, 에러 라인, 경로/라인 번호
- 로그 pane: 가장 최근 ERROR/WARN, 타임스탬프, 반복 패턴

캡처에서 단서를 못 찾으면 (대상 pane 이 막 시작했거나, 빈 셸만 떠 있거나, 깜빡임뿐일 때) 사용자에게 작업 목표를 직접 묻는다.

### 3. (선택) 대상 pane 에 인수 안내

`--ack` 지정 시:

```bash
# 단일 라인 안내 — 기존 방식 그대로
cmux send --surface "$SURF" "[assist] 본 작업은 다른 세션이 인수합니다. 진행을 중단하고 대기해주세요.\n"
```

기본은 보내지 **않는다** — 사이드 이펙트가 있다 (셸 pane 이면 명령으로 해석되어 not found 에러가 날 수 있고, 에이전트 pane 이면 새 메시지로 들어간다). 대상이 셸이면 `--ack` 를 권하지 않는다.

안내 본문이 여러 줄이 되면 `cmux` skill `3-2` 절의 bracketed paste mode (`$'\e[200~' … $'\e[201~'` + 별도 `send-key enter`) 를 따른다.

### 4. 현재 세션에서 작업 수행

캡처한 컨텍스트 + `$ARGUMENTS` 의 추가 지시를 합쳐 작업한다. 이 단계부터는 일반적인 도구 사용과 동일하다 — 작업 성격에 맞게 자유롭게 도구를 선택한다.

가능한 작업 범주 (제한 없음):

- **코드 편집**: Edit/Write 로 파일 수정, 테스트 추가/수정
- **셸 명령**: 일반 Linux/macOS 명령 — 파일 검색 (`fd`), 텍스트 검색 (`rg`), 디렉터리 탐색, 빌드/테스트 재실행, 권한·프로세스 점검 등
- **분석**: 캡처한 로그/스택 트레이스/JSON 을 파싱·요약·진단
- **재현·검증**: 옆 pane 에서 실패한 명령을 현재 세션에서 재현해 원인 격리
- **에이전트 위임**: 작업이 큰 경우 `/cmux:new` 로 다시 다른 pane 에 위임할 수도 있다 (재귀 허용)
- **외부 도구 조사**: 작업 성격에 맞는 specialized agent (Explore, general-purpose 등) 활용

대상 pane 에 명령·키 입력을 임의로 주입하지 않는다 (인수 안내·결과 회신 제외, 둘 다 명시 옵션).

### 5. 결과 회신 (선택)

`--reply` 지정 시 작업 결과 요약을 원래 pane 으로 회신한다.

```bash
# 단일 라인 요약 — 기존 방식 그대로
cmux send --surface "$SURF" "[assist] 인수 작업 완료. 변경 파일: ...\n"

# 멀티라인 요약 — bracketed paste mode + 별도 enter
REPORT=$(cat <<'EOF'
[assist] 인수 작업 완료.

## 변경 사항
- ...

## 검증
- ...
EOF
)
cmux send --surface "$SURF" $'\e[200~'"$REPORT"$'\e[201~'
cmux send-key --surface "$SURF" enter
```

기본은 회신하지 **않는다**. 대상이 셸 pane 이면 회신 텍스트가 명령으로 해석되어 에러가 날 수 있으므로, 회신은 에이전트/REPL 처럼 자유 텍스트 입력을 받는 pane 에 한정한다. 멀티라인 송신 상세는 `cmux` skill `3-2` 절을 따른다.

## Rules

- Reply in Korean.
- 대상 pane 의 종류를 가정하지 않는다 — 에이전트, 셸, 로그 tail, REPL, 빌드 출력 무엇이든 화면 컨텍스트만 단서로 삼는다. 종류 라벨은 휴리스틱이며 확정이 아니다.
- 대상 surface 가 모호하면 반드시 사용자 확인. 추측으로 다른 pane 의 화면을 읽지 않는다.
- 자기 자신의 surface (`$CMUX_SURFACE_ID`) 는 후보에서 제외.
- 캡처한 화면 내용을 가공 없이 그대로 출력에 노출하지 않는다 — 비밀정보·토큰·경로·자격증명이 섞여 있을 수 있다. 작업에 필요한 사실만 추출해 사용한다.
- 대상 pane 에 명령·키 입력을 주입하지 않는다 (인수 안내·결과 회신 제외, 둘 다 명시 옵션).
- 대상 pane 을 닫지 않는다 (`close-surface` 금지).
- 셸 pane 에 회신/안내 메시지를 보낼 때 위험성을 고려한다 — 자유 텍스트가 셸에서 명령으로 해석된다. 기본은 비활성, 필요 시에만 단일 라인 + 무해한 코멘트 형태 (`#` prefix 권장) 로 보낸다.
- 옆 pane 에서 진행 중이던 사용자 변경을 되돌리지 않는다 — 이어서 진행하거나, 명시 지시가 있을 때만 방향 전환.
- 캡처에서 작업 목표·맥락을 확정할 수 없으면 즉시 사용자에게 묻는다. 임의 추론한 목표로 시작하지 않는다.
- 인수 안내·결과 회신 메시지에 비밀정보를 포함하지 않는다.
- 인수 안내·결과 회신 메시지가 여러 줄이면 bracketed paste mode (`$'\e[200~' … $'\e[201~'`) 로 감싸 한 번에 paste 한 뒤 별도 `send-key enter` 로 submit 한다 — 일반 `"\n"` 송신은 매 줄 Enter 로 해석된다. 상세는 `cmux` skill `3-2` 절.

## 보고 형식

```text
## Assisted from
- surface: surface:N
- pane: pane:M
- workspace: workspace:K
- 대상 종류 (추정): {shell | codex | claude | opencode | build | log | repl | unknown}

## 파악된 컨텍스트
- 목표 또는 의도: ...
- 마지막 상태: ...
- 이미 시도된 것 (있다면): ...
- 원시 단서 (요약): ...

## 진행 계획
- ...
```

이후 실제 작업 수행은 현재 세션의 일반 흐름으로 이어진다.
