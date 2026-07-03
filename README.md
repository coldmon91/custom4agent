# custom4agent

Pi agent 설정 파일 모음.

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
```

## 참고

인증 정보(`auth.json`), 신뢰 목록(`trust.json`), 세션 데이터(`sessions/`) 등
민감·개인 데이터는 `.gitignore` 로 제외되어 있습니다.
