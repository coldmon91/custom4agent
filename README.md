# custom4agent

Pi agent / 코딩 에이전트 설정 파일 모음.

## 구성

```
pi-agent/
├── settings.json        # 테마, 기본 provider/model, thinking 설정
├── keybindings.json     # 키 바인딩
└── extensions/          # 확장 스크립트 (TypeScript)
    ├── footer-model-under-cwd.ts
    ├── model-thinking-selector.ts
    ├── thinking-colors.ts
    └── tool-mode-cycle.ts

agent_settings/
├── AGENTS.md             # 에이전트 동작 가이드라인 (페르소나/규칙/커뮤니케이션/프로그래밍 원칙)
├── commands/             # 커맨드 스킬 (codex, cmux, debugger, daily-summary 등)
└── skills/               # 언어별(cpp/rust/go/swift/flutter), 분석(code-path/architecture/log),
                           # 리서치(web-research), 브라우저(playwright/aside-browser) 등 스킬 모음
```

## 참고

인증 정보(`auth.json`), 신뢰 목록(`trust.json`), 세션 데이터(`sessions/`) 등
민감·개인 데이터는 `.gitignore` 로 제외되어 있습니다.
