---
name: review-impact
description: "코드 변경사항에 대한 사이드 이펙트 분석. Use when the user asks to analyze side effects of code changes, check impact of modifications, review breaking changes, or assess risk of recent code changes. Responses in Korean."
---

# Review Impact

다음 변경사항에 대해 사이드 이펙트를 분석합니다.

## 분석 항목

1. **직접적 의존성**: 이 코드를 import/호출하는 파일들
2. **간접적 영향**: 공유 상태, 전역 변수, 설정 변경
3. **테스트 영향**: 관련 테스트 케이스
4. **API 계약**: 시그니처 변경으로 인한 breaking changes
5. **타입 안전성**: 타입 불일치 가능성

## 출력 형식

- High Risk: 즉시 수정 필요
- Medium Risk: 검토 권장
- Low Risk: 참고사항
