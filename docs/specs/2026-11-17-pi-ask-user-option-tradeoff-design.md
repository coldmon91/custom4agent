# Pi Ask User 선택지 추천·장단점 — 승인된 설계

상태: 승인됨. 구현 전.

기반 설계: [2026-09-11-pi-ask-user-extension-design.md](2026-09-11-pi-ask-user-extension-design.md).

## 목적

모델이 사용자에게 선택을 물을 때, 추천 선택지와 선택지별 장단점을 화면에 구분해서 보여 준다.
장단점이 없는 선택지는 지금처럼 라벨만 보여 준다.
사용자가 고른 번호와 라벨만 답으로 돌아가고, 장단점은 답에 다시 넣지 않는다.

구조화 필드를 쓴다.
`description` 문자열 규칙으로 추천과 장단점을 적으면 화면이 이를 안정적으로 가를 수 없다.
`description`을 없애면 장단점이 아닌 한 줄 설명을 둘 곳이 없다.

## 범위

포함:

- 선택지 필드 `recommended`, `pros`, `cons`
- 도구 입력 스키마(`schema.ts`의 `OptionSchema`)에 세 필드와 필드 설명 추가
- 값이 있을 때만 그리는 추천 표시와 장단점 줄
- 질문당 추천 1개 제한
- 모델 안내 문구
- 정규화와 렌더링 테스트

제외:

- 상태 기계 변경. 추천과 장단점은 표시 전용이다
- 답변 payload 변경
- `renderCall`·`renderResult` 변경. 호출 요약은 헤더만, 결과는 고른 라벨만 유지한다
- `Other` 행의 추천·장단점
- 글자 수 상한. 줄바꿈은 기존 `description`과 같다
- TUI 외 모드의 대체 UI

## 입력

`types.ts`의 `AskUserOption`과 `schema.ts`의 `OptionSchema`에 다음을 추가한다. 모두 생략 가능하다.
모델이 보는 입력 정의는 `OptionSchema`이므로, 각 필드에 아래 의미를 담은 `description`을 단다.

| 필드 | 타입 | 의미 |
|---|---|---|
| `recommended` | boolean | `true`일 때만 추천 |
| `pros` | string | 한 줄 장점 |
| `cons` | string | 한 줄 단점 |

`description`은 유지한다.
장단점이 아닌 한 줄 설명이다.

정규화:

- `pros`, `cons`, `description`은 trim한다. 빈 문자열은 필드 자체를 뺀다
- `recommended`가 없으면 `false`와 같다. 정규화 결과에는 `true`일 때만 남긴다
- 한 질문에 `recommended: true`가 2개 이상이면 도구 호출을 실패시킨다. 단일 선택과 복수 선택 모두 같다
- 복수 선택에서 조합 추천을 받지 않는 것은 의도한 제한이다. 표시와 검증 규칙을 하나로 유지하기 위해서다
- 실패 처리 방식은 기존 라벨·헤더 중복 검사와 같다
- 실패 메시지는 `ask_user question "<header>" has more than one recommended option`이다
- `pros`만 있거나 `cons`만 있어도 된다

모델 안내:

- 추천이 있으면 질문당 최대 1개 선택지에 `recommended: true`를 넣는다
- 실제 트레이드오프가 있을 때만 짧은 `pros`와 `cons`를 넣는다. 없으면 둘 다 생략한다
- 라벨을 장단점에 반복하지 않는다
- 장단점을 `description`에 다시 쓰지 않는다
- 기존 테스트처럼 모든 `promptGuidelines` 문장에 `ask_user`가 들어간다

## 화면

선택지 라벨 줄은 그대로다.
추천이면 라벨 뒤에 공백과 `★`를 붙인다.
`★`는 라벨과 같은 `theme.fg` 호출 안에 넣어, 선택·포커스에 따라 라벨과 같은 색으로 바뀐다.

라벨 아래 줄은 있을 때만, 이 순서로 그린다.
들여쓰기는 기존 `description`과 같다.

1. `description`. 색은 `muted`
2. `+ `와 `pros`. 색은 `muted`
3. `- `와 `cons`. 색은 `muted`

없는 줄은 자리를 비우지 않는다.

`+ `와 `- `는 본문이 아니라 `push`의 prefix에 붙인다.
기존 들여쓰기 뒤에 기호를 둔 문자열이 prefix다.
줄바꿈된 다음 줄은 기호가 아니라 본문 첫 글자 아래에서 시작한다.

```text
     + 배포가 단순하고 별도 서버 없이
       파일 하나로 끝난다
```

### 알려진 위험

- 높이: 선택지 하나가 최대 4줄이 되므로 선택지 9개에 모두 장단점이 있으면 일반 터미널 높이를 넘을 수 있다. 줄 수 상한은 두지 않고, 실제 트레이드오프가 있을 때만 장단점을 넣으라는 모델 안내로 줄인다
- `★` 폭: `★`(U+2605)는 East Asian Ambiguous 문자다. pi-tui `visibleWidth`는 1칸으로 세지만, 모호한 폭 문자를 2칸으로 그리는 터미널에서는 줄이 1칸 넘칠 수 있다. 영향이 작아 받아들인다. 문제가 보이면 ASCII 표시로 바꾼다

예:

```text
> 1. SQLite ★
     + 배포가 단순하다
     - 동시 쓰기에 약하다
  2. Postgres
  0. Other
```

`Postgres`처럼 장단점과 `description`이 없으면 라벨만 나온다.
`description`만 있으면 그 한 줄만 지금과 같이 나온다.

## 검증

- 스키마: `OptionSchema`에 `recommended`, `pros`, `cons`가 있다
- 정규화: trim, 빈 장단점 제거, `recommended: false` 제거, 추천 2개 거절
- 렌더링: `★`, `+`, `-`는 값이 있을 때만 나타난다
- 렌더링: `description`과 장단점이 함께 있으면 위 순서를 지킨다
- 렌더링: 줄바꿈된 장단점의 다음 줄은 본문 첫 글자 아래에서 시작한다
- 폭: `questionnaire-component.test.ts`의 `question()` 도우미가 `pros`·`cons`·`recommended`를 받도록 넓히고, 기존 폭 테스트 입력에 긴 장단점을 넣어 통과를 확인한다
- 상태 기계 테스트는 수정하지 않는다
