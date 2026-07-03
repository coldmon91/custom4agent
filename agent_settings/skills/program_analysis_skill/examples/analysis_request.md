# 분석 요청 예시

이 프로그램의 기능과 구조를 전부 상세히 분석해줘. `codegraph`, `Serena MCP`가 활성화되어 있으면 우선 사용해줘.

분석 작업은 병렬 specialist agent 구조로 수행해줘.

최종 보고서는 다음 12개 카테고리 구조를 따라줘.

1. Scope & Documentation
2. Architecture & Components
3. Runtime Lifecycle
4. Feature Inventory
5. Interfaces & Protocols
6. Data Flow & State
7. Configuration & Environment
8. Security & Reliability
9. Operations & Observability
10. Testing & Coverage
11. Build & Deployment
12. Compatibility & Limitations

특히 다음 항목은 상세히 분석해줘.

- API 리스트
- 주요 객체의 역할과 기능 리스트
- route가 있다면 route 리스트와 역할
- inbound 리스트와 bit-level protocol 분석
- inbound 데이터에 따른 outbound 종류와 bit-level protocol 분석
- 스스로 동작하는 기능과 루프
- 로그 포맷과 파일 관리 방법
- 설정 종류와 설정파일 관리 방법
- CLI command 리스트와 역할
- 서비스 시작/종료 동작
- 설정 옵션에 따른 시작/종료 동작
- 클라이언트 접속 시 동작
- 패킷에 따른 동작 흐름과 프로토콜 분석
- 보안, 신뢰성, 테스트, 빌드, 배포, 호환성 리스크

모든 결론에는 파일 경로, 심볼명, 설정 키, route, 호출 관계 근거를 붙여줘.

확인되지 않은 내용은 확인 불가로 표시해줘.

추정은 추정이라고 표시해줘.
