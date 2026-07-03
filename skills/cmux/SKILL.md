---
name: cmux
description: cmux 터미널 멀티플렉서의 Unix 소켓 CLI 로 pane/surface 를 조작하고, 같은 워크스페이스 안에서 실행 중인 다른 에이전트 CLI (Claude Code, Codex CLI, opencode, omx 등) 와 메시지 주입·화면 캡처로 양방향 통신한다.
when_to_use: 사용자가 cmux, pane, surface, workspace, 옆 pane 에 Codex/Claude 실행, 다른 pane 으로 메시지 전송, 다른 pane 화면 읽기, send-key, read-screen, 멀티 에이전트 협업 자동화 등을 요청할 때 호출한다. 또한 "작업을 분담/분할/나눠서 진행", "역할을 분담/나누어 처리", "여러 에이전트에게 일을 나눠 돌려" 처럼 작업 또는 역할을 다른 에이전트와 분담·분할·분배하려는 의도가 보일 때도 cmux 로 새 pane 을 띄워 다른 에이전트에 위임하는 흐름의 후보로 호출한다.
metadata:
  version: "0.2.0"
  domain: tooling
  role: tool-guide
---

# cmux 사용 가이드

cmux 는 macOS 데스크톱 터미널 멀티플렉서로, `~/Library/Application Support/cmux/cmux.sock` (또는 `$CMUX_SOCKET_PATH`) Unix 소켓으로 외부 제어된다. cmux 안에서 실행 중인 CLI 에이전트는 (자신의 sandbox 정책이 허용한다는 전제하에) 같은 소켓을 통해 다른 pane 에 텍스트/키 입력을 주입하거나 화면을 캡처할 수 있다. 예: 기본 Codex sandbox 는 이 소켓 접근을 차단한다 (아래 통신 패턴 절 참고).

명령어에 문제 발생시: `https://raw.githubusercontent.com/manaflow-ai/cmux/main/docs/cli-contract.md` 참고

## 핵심 개념

- workspace: 디렉토리 단위의 작업공간. 환경변수 `$CMUX_WORKSPACE_ID` 로 자동 노출.
- pane: 워크스페이스를 가로/세로로 분할한 영역.
- surface: 하나의 pane 안에 있는 개별 터미널/브라우저 탭. 환경변수 `$CMUX_SURFACE_ID` 로 자동 노출.
- short ref: `workspace:1`, `surface:2`, `pane:3` 처럼 인덱스 기반의 짧은 식별자. UUID 대신 사용 가능.

## 자주 쓰는 명령 레시피

### 1. 현재 상태 파악
```bash
cmux current-workspace
cmux list-panes                         # 현재 workspace 의 pane 목록
cmux list-pane-surfaces                 # focused pane 의 surface 목록 (다른 pane 은 --pane <ref> 필요)
cmux tree --workspace workspace:1       # workspace 전체 트리 (모든 pane/surface 확인 시)
echo "$CMUX_WORKSPACE_ID $CMUX_SURFACE_ID"
```

### 2. 새 pane 만들기 + 명령 실행
`cmux new-split` 에는 `--command` 옵션이 없다. 분할 후 `send` 로 명령을 주입한다.

```bash
cmux new-split right                                # stdout 예: "OK surface:4 workspace:1"
cmux send --surface surface:4 "codex"
cmux send-key --surface surface:4 enter
```

### 3. 다른 pane 에 입력 보내기
- 텍스트 전송: `cmux send --surface <ref> "<text>"`
- 키 이벤트: `cmux send-key --surface <ref> <key>` (예: `enter`, `ctrl+c`, `tab`)
- `send` 는 텍스트를 그대로 주입하며 자동 개행이 없다. 명령 실행을 위해 Enter 를 보내려면 두 가지 방식 중 하나를 쓴다.
  - 별도 키 이벤트: `cmux send --surface <ref> "ls -la" && cmux send-key --surface <ref> enter`
  - 이스케이프 시퀀스: `cmux send --surface <ref> "ls -la\n"` (cmux 가 `\n`, `\r` 을 Enter, `\t` 를 Tab 으로 해석)

### 3-2. 멀티라인 프롬프트 전송 (bracketed paste mode)

`send` 는 텍스트 안의 LF (`\n`/실제 개행) 를 **Enter (submit)** 으로 변환해 그대로 키 이벤트로 발사한다. 따라서 여러 줄짜리 프롬프트를 한 번에 `send` 하면 매 줄마다 submit 되어 TUI 에이전트 (claude/codex/opencode 등) 에 첫 줄만 들어가거나 N 개 메시지로 쪼개진다.

해결: **ANSI bracketed paste mode** 로 감싼다. TUI 가 "내부 LF 는 soft newline" 으로 해석한다.

- 시작 마커: `\e[200~` (ESC `0x1B` + `[200~`)
- 종료 마커: `\e[201~`
- paste 시퀀스 자체로는 submit 되지 않는다 — paste 종료 후 별도 `send-key … enter`.

```bash
PROMPT_BODY=$(cat <<'EOF'
[배경]
...
[작업]
...
EOF
)

# $'...' 로 \e 를 실제 ESC 바이트 (0x1B) 로 풀어야 한다.
# 일반 큰따옴표 안의 "\e" 는 리터럴 백슬래시+e 가 되어 동작하지 않는다.
cmux send --surface "$SURF" $'\e[200~'"$PROMPT_BODY"$'\e[201~'
cmux send-key --surface "$SURF" enter
```

주의:

- 본문에 실제 ESC (0x1B) 가 포함될 일은 거의 없지만, 만약 있으면 paste 가 조기 종료되어 깨질 수 있다. 송신 전 검사 권장.
- 단일 라인 텍스트나 셸 명령 (예: `ls -la`) 에는 bracketed paste 가 필요 없다. 기존 방식 (`"...\n"` 또는 별도 `send-key enter`) 을 그대로 쓴다.
- bracketed paste 를 비활성화한 TUI 에서는 동작하지 않는다 — 그 경우 한 줄씩 `send` 하고 줄 사이에 soft newline 키 (`shift+enter` 또는 `ctrl+j` 등 에이전트별 키) 를 발사하는 fallback 을 쓴다.

### 4. 다른 pane 의 출력 읽기
```bash
cmux read-screen --surface <ref> --lines 40
cmux read-screen --surface <ref> --scrollback             # 스크롤백 포함
cmux capture-pane --surface <ref> --lines 100             # tmux 호환 형태
```
대화형 TUI(Codex/Claude 등)의 응답 캡처에는 `read-screen --lines N` 이 가장 단순하다. 응답이 늦으면 `sleep N` 후 재호출.

### 5. 알림/상태 표시
```bash
cmux notify --title "빌드 완료" --body "exit 0"
cmux set-status build success --icon check --color "#22c55e"
cmux set-progress 0.42 --label "tests"
```

## 멀티 에이전트 통신 패턴

여기서 "에이전트"는 cmux pane 안에서 동작하는 임의의 대화형 CLI 를 의미한다 — Claude Code, Codex CLI, opencode (`omo`), omx (`omx`), omc (`omc`), Gemini CLI, aider 등. 어느 쪽이든 호출자(orchestrator)와 피호출자의 역할은 대칭이므로, 아래 패턴에서 `LAUNCH_CMD` 자리에 해당 CLI 실행 명령을 대입해 사용한다.

### 일반 패턴: A → B (A 가 orchestrator)
1. `cmux new-split right` 로 옆 pane 생성 → stdout 의 `OK surface:N workspace:M` 에서 새 `surface:N` 확보
2. `cmux send --surface surface:N "<LAUNCH_CMD>\n"` 로 B 에이전트 실행
3. 부팅 대기 후 프롬프트 전달
   - **단일 라인** 프롬프트: `cmux send --surface surface:N "<프롬프트>\n"`
   - **멀티 라인** 프롬프트: 위 `3-2` 절의 bracketed paste mode 절차를 따른다. 일반 `"\n"` 방식으로 보내면 매 줄이 개별 submit 되어 깨진다.
4. 응답 시간 후 `cmux read-screen --surface surface:N --lines 50` 으로 출력 캡처

`<LAUNCH_CMD>` 예시:

| 에이전트 | 명령 |
|---|---|
| Claude Code | `claude` |
| Codex CLI | `codex` (또는 sandbox 풀어야 할 때 `codex -s danger-full-access -a never`, 아래 경고 참고) |
| opencode | `opencode` (또는 cmux 단축: `cmux omo`) |
| omx | `omx` (또는 `cmux omx`) |
| omc | `omc` (또는 `cmux omc`) |
| Gemini CLI | `gemini` |
| aider | `aider` |
| 일반 셸 명령 | 임의의 실행 가능 명령 |

### 역방향 (B → A)
피호출자 B 가 자기 쉘에서 `cmux` 를 호출하면 호출자 A 의 pane 으로 다시 메시지를 주입할 수 있다 (B 의 sandbox 정책이 허용해야 함).
```bash
cmux send --surface surface:<A_surface> '응답 메시지\n'
```

### 에이전트별 sandbox/권한 주의

- **Codex CLI**: 기본 sandbox 는 `~/Library/Application Support/cmux/cmux.sock` 접근을 차단해 `Operation not permitted` 가 난다. Codex 가 자기 쪽에서 `cmux` 를 호출해야 할 때만 `codex -s danger-full-access -a never` 같은 권한 조합으로 띄워야 한다. ⚠️ 이 조합은 승인 절차 없이 모든 명령을 임의로 실행하는 모드에 가깝다 — 신뢰된 로컬 워크스페이스와 직접 작성한 프롬프트에서만, 그것도 cmux 호출이 정말 필요할 때만 사용한다. 일반적인 코드 작업에는 기본 sandbox 를 유지한다.
- **Claude Code**: harness 의 자동 승인 클래시파이어가 위험 명령(예: `--dangerously-bypass-approvals-and-sandbox`)을 차단할 수 있다. 다른 pane 에 그런 명령을 `send` 로 주입하기 전에 사용자 확인을 거친다.
- **opencode / omx / omc**: cmux 가 직접 launch 단축어 (`cmux omo`, `cmux omx`, `cmux omc`) 를 제공한다 — 단순 실행 시 권장.

### 핸드셰이크 스크립트 예시 (orchestrator 셸에서)
```bash
# new-split 출력 예: "OK surface:4 workspace:1"
SURF=$(cmux new-split right | awk '{for (i=1; i<=NF; i++) if ($i ~ /^surface:/) {print $i; exit}}')
LAUNCH_CMD="codex"          # claude / opencode / gemini / aider 등으로 교체 가능
cmux send --surface "$SURF" "${LAUNCH_CMD}\n"
sleep 5
cmux send --surface "$SURF" "안녕. '핸드셰이크 OK' 라고만 답해.\n"
sleep 15
cmux read-screen --surface "$SURF" --lines 40
```

## 자주 빠지는 함정

- `cmux send-key … "C-c"` 는 잘못된 표기 → `ctrl+c` 로 써야 한다 (`Unknown key` 에러).
- `cmux new-split --command …` 같은 옵션은 없다. 분할 후 `send` 로 명령을 주입해야 한다.
- 대화형 TUI 의 응답은 비동기다. `read-screen` 전에 적절한 `sleep` (보통 5 ~ 20 초) 을 둔다.
- 한 줄 명령에서 `&&` 로 묶더라도 `send` 는 한 번에 한 surface 에만 작용한다. 여러 surface 를 다루려면 호출을 분리한다.
- Codex 가 cmux 소켓을 호출해야 할 때만 `danger-full-access` 가 필요하다. 그렇지 않다면 기본 sandbox 로 충분하다.
- `cmux send` 의 텍스트에 작은따옴표가 포함될 경우 셸 인용을 신중히 처리한다 (`'...'\''...'` 패턴 등).
- 멀티라인 프롬프트를 한 번의 `send` 로 보낼 때 LF 가 매 줄 Enter 로 해석되어 TUI 에서 N 회 submit 된다. bracketed paste mode (`\e[200~ … \e[201~`) 로 감싼 뒤 별도 `send-key enter` 로 마무리한다 — 상세는 `3-2` 절.

## 참고 명령 색인

| 목적 | 명령 |
|---|---|
| 환경 진단 | `cmux ping`, `cmux version`, `cmux capabilities` |
| 워크스페이스 | `list-workspaces`, `new-workspace`, `current-workspace`, `select-workspace`, `close-workspace` |
| Pane/Surface | `new-split`, `new-pane`, `new-surface`, `list-panes`, `list-pane-surfaces`, `focus-pane`, `close-surface` |
| 입출력 | `send`, `send-key`, `send-panel`, `read-screen`, `capture-pane` |
| 알림/상태 | `notify`, `set-status`, `set-progress`, `log`, `list-log` |
| 브라우저 pane | `browser open|navigate|click|type|snapshot|screenshot|eval` |
| tmux 호환 | `capture-pane`, `resize-pane`, `pipe-pane`, `swap-pane`, `break-pane`, `join-pane`, `set-hook` |

전체 명령은 `cmux --help` 또는 `cmux docs <topic>` (settings/shortcuts/api/agents/dock) 으로 확인.

## 환경변수

- `CMUX_WORKSPACE_ID` — 현재 워크스페이스 UUID. 거의 모든 명령의 `--workspace` 기본값.
- `CMUX_SURFACE_ID` — 현재 surface UUID. `send`/`read-screen` 기본값.
- `CMUX_TAB_ID` — `tab-action`/`rename-tab` 기본값.
- `CMUX_SOCKET_PATH` — 기본 소켓 경로 오버라이드.
- `CMUX_SOCKET_PASSWORD` — 소켓 비밀번호 (또는 `--password`).

## 작업 원칙

- 다른 pane 에 명령을 주입하기 전에 항상 `list-pane-surfaces` 로 surface ref 를 확인한다.
- 사용자가 띄워둔 pane 을 임의로 닫지 않는다 (`close-surface` 는 명시적 요청에만).
- 대화형 에이전트(Codex, opencode 등)와의 통신은 텍스트 기반이라 timing 에 민감하다. 응답 누락이 보이면 `sleep` 을 늘리거나 `read-screen --scrollback` 으로 재확인한다.
- 비밀정보를 다른 pane 에 `send` 하지 않는다. 화면 캡처로 기록될 수 있다.
