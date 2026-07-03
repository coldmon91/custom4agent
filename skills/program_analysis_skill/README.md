# 프로그램 종합 분석 Skill

이 압축파일은 프로그램 기능과 구조를 종합 분석하기 위한 AI agent skill 문서입니다.

## 포함 파일

- `SKILL.md`: 최종 스킬 본문
- `examples/analysis_request.md`: 에이전트에게 전달할 분석 요청 예시
- `examples/input.yaml`: 분석 입력값 예시

## 사용 방법

1. `SKILL.md`를 agent skill 문서로 등록합니다.
2. 분석 대상 프로젝트 경로를 `target_project_path`로 전달합니다.
3. entrypoint를 알고 있으면 함께 전달합니다.
4. entrypoint를 모르면 coordinator가 후보를 찾도록 둡니다.
5. 최종 보고서는 12개 핵심 카테고리 구조로 생성합니다.

## 핵심 특징

- 병렬 specialist agent 구조
- 호출 관계 및 심볼 기반 코드 분석
- API, route, CLI, protocol 분석
- bit-level inbound/outbound protocol 분석
- 설정, 보안, 운영, 테스트, 빌드, 호환성 분석
- 모든 결론에 파일, 심볼, 호출 관계 근거 요구
- `codegraph`, `Serena MCP`는 활성화되어 있으면 우선 사용 (없어도 분석은 진행)
