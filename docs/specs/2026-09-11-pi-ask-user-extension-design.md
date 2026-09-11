# Pi Ask User Extension 설계

## 목적

Pi 에이전트가 사용자 결정이 필요한 상황에서 선택형 질문을 TUI로 표시하고, 답변을 도구 결과로 받아 작업을 계속할 수 있게 한다.
단일 선택, 체크박스형 다중 선택, 여러 질문 탭, 숫자 단축키, 직접 입력 및 전역 제출을 지원한다.

## 기반

pi 설치본의 공식 예제 `examples/extensions/questionnaire.ts`를 기반으로 확장한다.

```text
/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/questionnaire.ts
```

예제가 이미 제공하는 것: 탭 바 기반 다중 질문, `Other` 직접 입력의 `Editor` 연동, `ctx.ui.custom` 컴포넌트 구조, ANSI 폭 기반 줄바꿈, 취소 처리, `renderCall`·`renderResult`.

이 설계가 추가하는 차이(델타):

- 질문별 다중 선택과 `[ ]`·`[v]` 체크박스
- `1` ~ `9`, `0` 숫자 단축키
- 질문 탭이 아닌 화면 하단의 전역 `[ Submit ]` 버튼
- 제출 시도 후 미답변 탭의 `!` 표시
- 일반 선택지와 `Other`의 동시 유지

검증된 렌더링·입력 코드를 재사용하여 구현과 검증 비용을 줄인다.

## 범위

### 포함

- LLM 호출용 `ask_user` 도구
- 한 번의 도구 호출에 최대 4개 질문
- 질문별 단일 또는 다중 선택
- 모든 질문에 `Other` 직접 입력 항목 제공
- 질문 탭 간 자유 이동
- 모든 탭 하단의 전역 `[ Submit ]` 버튼
- 취소 및 입력 검증
- 상태 전환 단위 테스트와 수동 TUI 검증

### 제외

- TUI 외 모드의 대체 UI
- 답변 영구 저장
- 마우스 조작
- 선택지 검색과 페이지네이션
- 질문별 선택 가능 개수 상한 설정

## 파일 구성

```text
pi-agent/extensions/ask-user/
├── package.json
├── index.ts
├── schema.ts
├── types.ts
├── questionnaire-state.ts
├── questionnaire-component.ts
├── tool-render.ts
├── index.test.ts
├── questionnaire-state.test.ts
└── questionnaire-component.test.ts
```

- `package.json`: `@earendil-works/pi-tui`와 `typebox`를 `dependencies`로 선언하고 `pi.extensions`에 `./index.ts`를 지정
- `index.ts`: 도구 등록, 입력 정규화·검증, TUI 실행, 도구 결과 생성
- `schema.ts`: TypeBox 입력 스키마 전용, `index.ts`에서만 참조
- `types.ts`: 외부 의존이 없는 순수 타입 선언만 포함
- `questionnaire-state.ts`: UI와 외부 패키지에 의존하지 않는 선택, 탭 이동, 제출 검증 상태 머신
- `questionnaire-component.ts`: 키 입력 연결과 pi TUI 렌더링
- `tool-render.ts`: `renderCall`·`renderResult`와 텍스트 요약 구현
- `index.test.ts`: 입력 검증, 도구 등록 메타데이터, 취소·비-TUI·`undefined` 결과 검증
- `questionnaire-state.test.ts`: 상태 머신의 단위 테스트
- `questionnaire-component.test.ts`: 키 매핑과 렌더링 검증

상태 로직과 렌더링을 분리하여 키 동작과 제출 조건을 터미널 없이 검증한다.

TypeBox 스키마를 `types.ts`가 아닌 `schema.ts`로 분리하는 이유는 테스트 실행 환경 때문이다.
`questionnaire-state.ts`와 그 테스트가 `typebox`를 간접 참조하면 `node --test`에서 모듈 해석에 실패한다.
상태 머신 경로는 순수 TypeScript만 참조하도록 유지한다.

`package.json`과 `npm install`은 `questionnaire-component.test.ts`를 위해 필요하다.
`@earendil-works/pi-tui`와 `typebox`는 pi 자체 `node_modules`에만 존재하므로, 확장 디렉터리에 설치하지 않으면 컴포넌트 테스트를 실행할 수 없다.
런타임에는 pi가 두 패키지를 제공하므로 설치는 테스트 전용 요구 사항이다.

## 도구 인터페이스

도구 이름은 `ask_user`로 한다.
도구는 `executionMode: "sequential"`로 등록하여 여러 대화형 UI가 동시에 열리지 않게 한다.

입력 형식:

```typescript
interface AskUserInput {
  questions: Array<{
    header: string;
    question: string;
    multiSelect?: boolean;
    options: Array<{
      label: string;
      description?: string;
    }>;
  }>;
}
```

질문 ID는 모델이 생성하지 않는다.
Extension이 배열 인덱스 기준으로 `q1`, `q2` 형태의 내부 ID를 부여한다.
모델에게 고유 ID 생성을 요구하면 검증 실패 지점만 늘어나고, 질문 식별에는 `header`로 충분하다.

`multiSelect`는 선택 항목이며 생략 시 `false`로 처리한다.
대부분의 질문이 단일 선택이므로 기본값을 두면 입력 토큰과 스키마 위반이 줄어든다.

제약 조건:

- 질문 개수: 1 ~ 4개
- 탭 제목(`header`)과 질문 본문(`question`): 공백 제거 후 비어 있지 않음
- 탭 제목: 도구 호출 안에서 고유
- 기본 선택지 개수: 질문당 1 ~ 9개
- 선택지 라벨: 공백 제거 후 비어 있지 않고 같은 질문 안에서 고유
- `Other` 항목: 입력에 포함하지 않고 Extension이 항상 마지막에 추가

정상 제출 결과의 상세 데이터:

```typescript
interface AskUserResult {
  cancelled: false;
  answers: Array<{
    questionId: string;
    header: string;
    selected: Array<{
      index: number;
      label: string;
    }>;
    customAnswer: string | null;
  }>;
}
```

`index`는 화면에 표시된 숫자 단축키와 동일한 1부터 시작하는 값이다.
텍스트 요약을 `Database: user selected: 2. SQLite` 형태로 만들 수 있어 모델이 답변을 화면과 대응시키기 쉽다.

단일 선택에서 일반 항목을 고르면 `selected`에 하나가 들어가고 `customAnswer`는 `null`이다.
단일 선택에서 Other를 고르면 `selected`는 비어 있고 `customAnswer`에 입력값이 들어간다.
다중 선택에서는 일반 항목과 Other를 함께 선택할 수 있다.

취소 결과:

```typescript
interface AskUserCancelledResult {
  cancelled: true;
  answers: [];
}
```

도구의 텍스트 결과에도 질문별 선택 내용을 사람이 읽을 수 있는 형태로 넣어 모델이 `details` 구조에 의존하지 않고 답변을 이해할 수 있게 한다.

## 모델 호출 지침

`promptSnippet`과 `promptGuidelines`를 사용하여 다음 원칙을 모델에 전달한다.

`promptGuidelines` 불릿은 도구 이름 접두 없이 시스템 프롬프트의 `Guidelines` 섹션에 평면 병합된다.
따라서 모든 불릿이 `ask_user`를 직접 명시해야 하며, `this tool` 같은 지시 표현은 어떤 도구를 가리키는지 모델이 구분할 수 없으므로 사용하지 않는다.

- `Use ask_user when the user's choice would materially change the implementation direction or the result.`
- `Investigate the code and docs first; do not use ask_user for facts that are verifiable in the repository.`
- `Do not use ask_user for minor points that a safe default can cover.`
- `Group related questions into a single ask_user call, at most four.`

`promptSnippet`은 `Available tools` 섹션용 한 줄 요약으로 `Ask the user up to four multiple-choice questions and receive the answers`를 사용한다.

도구 선택은 모델 판단이므로 호출을 완전히 강제하지 않는다.
명확한 설명과 지침으로 불필요한 질문은 줄이고 중요한 의사결정에서 호출될 가능성을 높인다.

## 화면 설계

```text
┌ [Scope v] [Database !] [Style v] ┐
│ 어떤 데이터베이스를 사용할까요?   │
│                                   │
│ > [ ] 1. PostgreSQL               │
│   [v] 2. SQLite                   │
│   [ ] 3. MySQL                    │
│   [v] 0. Other: DuckDB            │
│                                   │
│          [ Submit ]               │
└───────────────────────────────────┘
```

탭 상태:

- `v`: 답변 완료
- 빈 표시: 아직 답변하지 않음
- `!`: 제출 시도 후 답변 누락

질문이 하나이면 탭 바를 표시하지 않는다.
탭이 하나뿐인 탭 바는 정보를 주지 않고 세로 공간만 차지한다.
이때 화면은 질문 본문, 선택지 목록, `[ Submit ]` 버튼으로만 구성한다.

모든 질문 탭에 동일한 전역 `[ Submit ]` 버튼을 표시한다.
모든 질문이 유효해야 활성 스타일로 표시한다.

## 트랜스크립트 렌더링

`renderCall`과 `renderResult`를 `tool-render.ts`에 구현한다.
생략하면 도구 호출이 원시 인자로 표시되어 대화 기록의 가독성이 떨어진다.

- `renderCall`: `ask_user` 도구명과 질문 개수, 탭 제목 목록을 한 줄로 표시
- `renderResult` 정상: 질문별 `✓ Database: 2. SQLite` 형태로 표시하고, 직접 입력은 `(wrote)` 표시를 덧붙임
- `renderResult` 취소: `Cancelled`를 경고 색으로 표시
- `details`가 없으면 텍스트 결과를 그대로 표시

## 키 동작

### 일반 탐색

- `Tab`, `Right`: 다음 질문 탭
- `Shift+Tab`, `Left`: 이전 질문 탭
- `Up`, `Down`: 선택지, Other, Submit 사이에서 커서 이동
- `Escape`: 전체 질문 취소

탭 이동은 순환하며 각 질문의 기존 답변과 커서 상태를 유지한다.
커서가 `[ Submit ]`에 있을 때도 `Tab`, `Shift+Tab`, `Left`, `Right`는 동일하게 탭을 이동한다.
이때 커서는 `[ Submit ]`에 그대로 남아 탭만 바뀌며, 이동한 탭의 선택 상태를 그대로 볼 수 있다.
질문이 하나이면 탭 이동 키는 동작하지 않는다.

### 단일 선택

- `Space`, `Enter`: 현재 선택지를 답변으로 지정
- `1` ~ `9`: 해당 기본 선택지를 바로 지정
- `0`: Other 선택 후 직접 입력 모드 진입
- 새 답변은 기존 일반 선택 또는 Other 답변을 대체
- 선택 직후 아직 답변하지 않은 다음 탭으로 자동 이동
- 모든 질문이 답변된 상태면 커서를 `[ Submit ]`으로 이동하고 현재 탭 유지
- 자동 제출은 하지 않음

단일 선택에서 자동 이동을 두는 이유는 조작 수 때문이다.
선택 후 탭을 유지하면 질문이 하나일 때도 선택, 커서 이동, 확정의 세 동작이 필요하다.
자동 이동은 마지막 선택 직후 커서가 `[ Submit ]`에 놓이므로 두 동작으로 끝난다.
마지막 질문에서 자동 제출까지 하지는 않는다.
잘못 누른 키가 즉시 확정되면 되돌릴 방법이 없기 때문이다.

### 다중 선택

- `Space`: 현재 기본 선택지를 선택 또는 해제
- `1` ~ `9`: 해당 기본 선택지를 선택 또는 해제
- `Enter` 또는 `0`: Other 직접 입력 모드 진입, 기존 값이 있으면 편집기에 채움
- 값이 없는 Other에서 `Space`: 직접 입력 모드 진입
- 값이 있고 선택된 Other에서 `Space`: 선택만 해제하고 입력값은 보존
- 값이 있고 해제된 Other에서 `Space`: 입력 모드 없이 보존된 값으로 다시 선택
- 일반 선택지와 Other 답변을 동시에 유지 가능
- 기본 선택지와 Other 모두 `[ ]`와 `[v]` 체크박스로 표시
- 선택 후 탭을 자동 이동하지 않음

Other의 `Space` 토글은 해제 경로를 위해 필요하다.
`Enter`만 제공하면 한 번 입력한 Other를 취소할 방법이 없고, 빈 문자열 저장은 빈 Other 거부 규칙과 충돌한다.
해제된 Other의 보존 값은 결과에 포함하지 않으며 `customAnswer`는 `null`이 된다.

### 직접 입력

- 편집 중 `Enter`: 공백을 제거한 비어 있지 않은 값을 저장하고 Other 선택
- 편집 중 `Escape`: 변경을 취소하고 선택 목록으로 복귀
- 기존 Other 답변을 다시 열면 현재 값을 편집기에 채움
- 직접 입력 모드에서는 숫자와 탐색 키를 텍스트 편집기에 전달

### Submit

- 커서가 Submit에 있을 때 `Enter`: 전체 제출 시도
- 모든 질문이 답변됐으면 결과 반환
- 미완료 질문이 있으면 해당 탭을 `!`로 표시하고 첫 번째 미완료 탭으로 이동
- 단일 선택은 일반 항목 하나 또는 비어 있지 않은 Other 답변 필요
- 다중 선택은 일반 항목과 Other를 합쳐 최소 하나 필요

## 데이터 흐름

1. 모델이 `ask_user` 도구를 호출한다.
2. `index.ts`가 스키마 외의 중복·공백 조건을 추가 검증하고 내부 질문 ID를 부여한다.
3. `ctx.mode === "tui"`를 확인하고, 아니면 예외를 발생시킨다.
4. `QuestionnaireComponent`가 `QuestionnaireState`를 생성해 사용자 입력을 처리한다.
5. 각 입력은 상태 머신을 갱신하고 `tui.requestRender()`를 호출한다.
6. Submit 성공 시 정규화한 답변 배열을 `done()`으로 반환한다.
7. `ctx.ui.custom()`의 반환값이 `undefined`이면 UI를 표시할 수 없었던 경우로 보고 예외를 발생시킨다.
8. `index.ts`가 텍스트 요약과 구조화된 `details`를 모델에 반환한다.
9. 모델이 답변을 반영해 기존 작업을 계속한다.

## 오류와 취소 처리

- 잘못된 도구 입력: 예외를 발생시켜 pi가 실패한 도구 결과로 모델에 전달
- TUI 이외의 모드: 지원 모드를 명시한 도구 실행 오류
- `ctx.ui.custom()` 반환값 `undefined`: UI 표시 불가로 간주하고 도구 실행 오류
- 사용자 Escape: 오류가 아닌 `cancelled: true` 정상 결과
- 빈 Other 제출: 편집 모드를 유지하고 경고 표시
- 렌더 너비 부족: ANSI 폭을 고려해 줄바꿈하고 모든 출력 줄을 주어진 너비 이하로 제한

도구 실패는 반환값이 아니라 예외로 신호한다.
pi는 `execute`에서 던진 예외를 잡아 `isError: true`로 모델에 전달하고 세션을 계속 진행한다.
오류 정보를 담은 값을 반환하면 실패로 표시되지 않는다.

`ctx.ui.custom()`은 RPC 모드에서 `undefined`를 반환한다.
`ctx.mode` 검사만으로는 이 경로를 막지 못하므로 반환값 검사를 함께 둔다.

백그라운드 프로세스, 타이머, 파일 저장을 사용하지 않으므로 세션 종료 정리 작업은 필요하지 않다.

## 테스트 전략

상태 머신 단위 테스트:

- 단일 선택 시 기존 답변 교체
- 단일 선택 후 다음 미답변 탭으로 자동 이동
- 모든 질문 답변 시 커서의 `[ Submit ]` 이동
- 다중 선택의 Space 및 숫자 키 토글에 해당하는 상태 변경
- 다중 선택 해제
- 다중 선택 Other의 선택 해제와 보존 값 재선택
- 일반 항목과 Other 답변 동시 유지
- 빈 Other 입력 거부
- 기존 Other 답변 수정과 편집 취소
- 탭 순환과 탭별 상태 유지
- 커서가 `[ Submit ]`에 있을 때의 탭 이동
- 질문 1개일 때 탭 이동 키 무시
- 미완료 제출 차단과 첫 누락 탭 이동
- 유효한 전체 결과 직렬화와 선택 인덱스 보존
- 전체 취소 결과

렌더링 검증:

- 선택 상태에 따른 `[ ]`, `[v]` 출력
- 완료 및 누락 탭 표시
- 질문 1개일 때 탭 바 미표시
- Submit 활성·비활성 표현
- 좁은 터미널에서도 반환 줄의 표시 폭 제한 준수

검증 명령:

```bash
node --test pi-agent/extensions/ask-user/questionnaire-state.test.ts
cd pi-agent/extensions/ask-user && npm install
node --test pi-agent/extensions/ask-user/*.test.ts
```

상태 머신 테스트는 외부 의존이 없어 `npm install` 없이도 통과해야 한다.
컴포넌트 테스트와 `index.test.ts`는 `@earendil-works/pi-tui` 해석이 필요하므로 설치 후에만 실행한다.
설치를 생략하는 구성이라면 컴포넌트 테스트를 범위에서 제외하고 상태 머신 테스트와 수동 검증만 유지한다.

수동 검증은 `/reload`로 수행한다.

```text
pi
/reload
```

이 저장소는 `~/.pi/agent`로 연결되어 있어 확장이 이미 자동 발견된다.
`pi -e ./pi-agent/extensions/ask-user/index.ts`를 쓰면 같은 확장이 이중 로드되므로 사용하지 않는다.
격리 실행이 필요하면 `pi --no-extensions -e ./pi-agent/extensions/ask-user/index.ts`를 사용한다.

수동 검증 항목은 단일 선택, 다중 선택, Other 동시 선택, Other 해제, 누락 제출 차단, 취소, 질문 1개 화면이다.

## 호환성과 영향

- 신규 도구 추가이므로 기존 Extension API와 호출부를 변경하지 않는다.
- 기존 수정 파일인 `pi-agent/APPEND_SYSTEM.md`와 추적되지 않은 `pi-agent/tmp/`를 변경하지 않는다.
- 자동 발견 위치인 `pi-agent/extensions/` 아래에 추가하며, 이 저장소가 `~/.pi/agent`로 연결된 현재 구성에서 `/reload` 후 사용할 수 있다.
- TUI 전용 사용자 경험으로 제한하며 RPC, JSON, print 모드에서는 명시적으로 실패한다.
- 확장 디렉터리에 `node_modules/`가 생기므로 저장소 `.gitignore` 확인이 필요하다.
- 공식 예제 `questionnaire.ts`와 도구 이름이 다르므로, 예제를 함께 설치해도 이름 충돌은 발생하지 않는다.

## 완료 조건

- 모델이 `ask_user`를 호출할 수 있음
- 최대 4개 질문을 탭으로 이동 가능
- 단일 및 다중 선택 동작
- 다중 선택의 `[v]` 체크박스, Space 및 숫자 키 토글 동작
- 모든 질문의 Other 직접 입력과 다중 선택에서의 Other 해제 동작
- 모든 탭 하단의 전역 Submit 동작
- 질문 1개일 때 탭 바 없는 화면
- 미응답 질문 제출 차단
- 취소, 비-TUI 오류, `ctx.ui.custom()` `undefined` 반환 처리
- `renderCall`과 `renderResult`로 트랜스크립트 표시
- 상태 머신 테스트가 `npm install` 없이 통과
- 수동 TUI 시나리오 통과
