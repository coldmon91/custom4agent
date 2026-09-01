# custom_agent-skills

Pi와 코딩 에이전트에서 사용하는 공통 지침, 명령, 스킬 및 확장 설정 모음.

## 저장소 구성

```text
agent_settings/
├── AGENTS.md              # 공통 에이전트 동작 및 프로그래밍 지침
├── agents/                # 구현·검토·수정용 서브에이전트 정의
├── commands/              # agy, claude, codex, pi 등의 사용자 명령
├── hooks/                 # 프롬프트 처리 훅
├── scripts/               # 스킬 사용 통계 등의 보조 스크립트
├── skills/                # 분석, 디버깅, 언어, 문서화, 자동화 스킬
└── statusline-command.js  # 상태 표시줄 명령

pi-agent/
├── AGENTS.md              # ../agent_settings/AGENTS.md 심볼릭 링크
├── extensions/            # Pi 확장 스크립트와 확장 리소스
├── keybindings.json       # Pi 키 바인딩
├── models.json            # 사용자 정의 모델 공급자 설정
├── npm/                   # Pi 확장 실행에 사용하는 로컬 npm 환경
├── packages/              # 배포 가능한 Pi 확장 패키지
│   └── pi-model-thinking-selector/
├── prompts                # ../agent_settings/commands 심볼릭 링크
└── skills                 # ../agent_settings/skills 심볼릭 링크
```

## 주요 구성 요소

- `agent_settings/agents`: 작업 난이도별 구현 에이전트, 변경 검토 에이전트, 수정 루프 정의
- `agent_settings/commands`: 에이전트 실행, 문서 갱신, 기록 조회, 스킬 통계 등을 위한 명령
- `agent_settings/skills`: 아키텍처·영향·로그·원인 분석, 디버깅, 브라우저 자동화, 언어별 개발, 문서화 및 작업 계획 스킬
- `pi-agent/extensions`: 모델·추론 수준 선택, 도구 모드 전환, 상태 표시, 세션 사용량 확인 등의 Pi 확장
- `pi-agent/packages/pi-model-thinking-selector`: 모델 검색, 즐겨찾기, 최근 모델 및 모델별 추론 수준 선택 기능을 제공하는 npm 패키지

## 로컬 데이터 및 제외 항목

다음 데이터는 민감 정보, 개인 설정 또는 생성 결과물이므로 `.gitignore`를 통해 저장소에서 제외됩니다.

- 인증·신뢰·세션 데이터: `auth.json`, `trust.json`, `sessions/`
- Pi 로컬 상태: `pi-agent/settings.json`, `pi-agent/recent-models.json`, `pi-agent/models-store.json`, `pi-agent/favorite-models.json`
- 로컬 전용 스킬과 시스템 데이터: `agent_settings/skills/my-*`, `agent_settings/skills/.system`
- npm 생성 결과물: `pi-agent/packages/*/node_modules/`, 패키지 압축 파일(`*.tgz`)
- 운영체제·Python 생성 파일: `.DS_Store`, `__pycache__/`
