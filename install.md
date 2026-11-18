# 설치: 에이전트 전역 설정 링크 생성

AI 에이전트가 이 문서를 읽고 그대로 수행하는 설치 절차.
목표는 각 에이전트의 전역 설정 경로(`~/.claude`, `~/.codex`, `~/.pi/agent`)를 이 저장소로 향하는 심볼릭 링크로 만드는 것.
저장소가 단일 원본이고, 전역 경로는 모두 링크.

링크 목록과 생성 로직은 `agent_settings/scripts/link_agent_settings.py`(이하 "링크 스크립트")에 있음.
이 문서는 그 스크립트를 안전하게 실행하는 순서만 다룸.

## 수행 규칙

- 모든 명령은 저장소 루트에서 실행.
- `--force`는 사용자 승인 없이 실행 금지. 기존 파일·디렉터리를 백업 후 교체하기 때문.
- 커밋, 푸시, 브랜치 생성 금지. 설치는 로컬 작업.
- `~/.claude/settings.json` 등 설정 파일 수정은 사용자 승인 후에만.
- 각 단계 결과를 사용자에게 보고하고, 실패 시 다음 단계로 넘어가지 말 것.

## 1. 사전 조건 확인

1. Python 3.9 이상 확인.

   ```sh
   python3 --version   # Windows: python --version
   ```

2. 심볼릭 링크 생성 권한 확인.
   - macOS / Linux: 추가 조치 불필요.
   - Windows: 개발자 모드 활성화 또는 관리자 권한 셸 필요. 둘 다 아니면 사용자에게 개발자 모드 활성화를 요청하고 중단.

3. Windows 한정: 저장소 내부 링크 확인.
   `pi-agent/AGENTS.md`, `pi-agent/prompts`, `pi-agent/skills`는 git에 심볼릭 링크로 저장됨.
   `core.symlinks=false`로 체크아웃되면 링크 대신 경로 문자열이 담긴 일반 파일이 됨.

   ```sh
   git config core.symlinks
   ls -la pi-agent/AGENTS.md pi-agent/prompts pi-agent/skills
   ```

   일반 파일이면 다음으로 복구.
   먼저 `git status -- pi-agent`로 세 경로에 로컬 변경이 없는지 확인할 것.

   ```sh
   git config core.symlinks true
   git checkout -- pi-agent/AGENTS.md pi-agent/prompts pi-agent/skills
   ```

## 2. 현재 상태 점검 (변경 없음)

```sh
python3 agent_settings/scripts/link_agent_settings.py
```

인자 없이 실행하면 점검만 하고 파일시스템은 건드리지 않음.
각 줄의 상태 의미:

- `OK`: 올바른 링크가 이미 존재.
- `FIX`: 링크가 없거나 다른 곳을 가리킴. `--apply`로 생성·수정됨.
- `BLOCKED`: 링크 자리에 실제 파일·디렉터리가 존재. 3단계에서 처리.
- `NO SRC`: 저장소 쪽 원본 경로가 없음. 저장소 체크아웃 상태를 사용자에게 보고하고 중단.

## 3. BLOCKED 항목 처리

`BLOCKED` 항목마다 다음을 확인하고 사용자에게 보고.

1. 상위 디렉터리가 이미 저장소로 향하는 링크인지 확인.

   ```sh
   ls -la ~/.claude/hooks ~/.claude/scripts
   ```

   예: `~/.claude/hooks`가 `agent_settings/hooks`를 가리키는 디렉터리 링크면, `~/.claude/hooks/prompt-timestamp.js`는 링크를 거친 저장소 원본 파일이라 `BLOCKED`로 표시됨.
   이 경우 이미 동작하는 상태이므로 **`--force` 금지**.
   `--force`의 백업 단계가 저장소 원본 파일 자체를 이동시킴.
   사용자에게 "디렉터리 단위 링크로 이미 연결됨"이라고 보고하고 그대로 둠.

2. 그 외 실제 파일·디렉터리면 내용을 확인하고, 저장소에 없는 사용자 데이터(로컬 전용 스킬, 직접 수정한 설정 등)가 있는지 보고.

   ```sh
   ls -la <BLOCKED 경로>
   diff -r <BLOCKED 경로> <저장소 쪽 원본 경로>
   ```

3. 사용자가 교체를 승인한 경우에만 `--force` 사용.
   기존 항목은 같은 위치에 `<이름>.bak-<YYYYmmdd-HHMMSS>`로 백업됨.

## 4. 링크 생성

```sh
python3 agent_settings/scripts/link_agent_settings.py --apply
```

`FIX` 항목만 생성·수정되고, `BLOCKED` 항목은 건너뜀.
3단계에서 교체를 승인받은 경우에만 다음을 실행.

```sh
python3 agent_settings/scripts/link_agent_settings.py --apply --force
```

## 5. 결과 검증

```sh
python3 agent_settings/scripts/link_agent_settings.py
echo "exit=$?"
```

- 종료 코드 0, 모든 항목 `OK`이면 완료.
- 3단계 1번의 디렉터리 링크 사례로 남은 `BLOCKED`는 정상. 이유와 함께 보고.
- 그 외 `FIX`·`BLOCKED`·`NO SRC`가 남으면 해당 줄 출력을 그대로 사용자에게 보고.

## 6. 선택: 설정 파일 연결

링크 스크립트는 링크만 만들고 설정 파일은 수정하지 않음.
다음 항목은 사용자가 원할 때만, 기존 `~/.claude/settings.json` 내용을 확인하고 변경 전후 차이를 보고한 뒤 적용.

- 상태 표시줄: `statusLine` 항목이 `node ~/.claude/statusline-command.js`를 실행하도록 설정. Windows에서는 `C:/Users/<사용자>/.claude/statusline-command.js` 같은 절대 경로 사용.
- 프롬프트 훅: `hooks.UserPromptSubmit`에 `node ~/.claude/hooks/prompt-timestamp.js` 등록.

## 7. 선택: 터미널·에디터 설정 링크

`config/` 아래 파일은 링크 스크립트 대상이 아님.
사용자가 요청한 경우에만, 대상 경로에 기존 파일이 있는지 확인·보고 후 수동으로 링크.

- `config/wezterm/wezterm.lua` → `~/.config/wezterm/wezterm.lua`
- `config/zed/keymap.json` → `~/.config/zed/keymap.json`
- `config/ghostty/config` → `~/.config/ghostty/config` (macOS는 `~/Library/Application Support/com.mitchellh.ghostty/config`)

## 완료 보고 형식

- 생성·수정된 링크 목록
- 남은 `BLOCKED` 항목과 사유
- 백업 파일 경로(`--force` 사용 시)
- 건너뛴 선택 단계
