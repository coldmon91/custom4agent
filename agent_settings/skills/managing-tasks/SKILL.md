---
name: managing-tasks
description: "Use when the user wants to create, start, log progress on, finish, or list their work tasks (업무 Task) in the Obsidian vault Tasks folder. Trigger on '태스크 만들어줘', 'Task 추가', '이거 시작할게', '오늘 한 일 기록해줘', '작업 로그 남겨줘', '하위 작업 추가', 'subtask', '커밋 기록', '레드마인 번호 연결', '끝났어', '완료 처리', '진행 중인 작업 뭐 있어', '할 일 목록'."
---
# Managing Tasks — Obsidian Task 노트 관리

## Overview

업무 Task를 Obsidian vault의 상태별 폴더와 `task.md` frontmatter로 관리.
폴더 위치와 frontmatter `status`는 항상 일치시킴.

## 위치와 구조

```
V="/Users/cskim/Library/Mobile Documents/iCloud~md~obsidian/Documents/Rsupport"
$V/Tasks/<YYYY>/{todo,in_progress,done}/<Task 이름>/task.md
```

- Task 1개 = 폴더 1개 + `task.md` (첨부·리뷰 문서·Subtask 노트는 같은 폴더에 둠)
- `<YYYY>`: Task 생성 연도. 상태가 바뀌어도 연도 폴더는 유지
- 제목: `[<컴포넌트>] <내용>` (예: `[rsmuxer] 메모리 누수 조사`, `[session3] openssl 3.5.6 적용`)
  - 컴포넌트: `rsupport` skill의 서버 컴포넌트 이름, 버전 접미사 포함 가능(`session3`). 소문자
  - 사용자 말에서 컴포넌트를 특정할 수 없으면 생성 전에 사용자에게 확인
- 폴더 이름: 제목과 동일 (`[rsmuxer] 메모리 누수 조사`). 제목에 `/ \ : # ^ |`가 있으면 제목과 폴더 이름 모두 공백으로 치환
  - `[ ]`는 glob·정규식 특수 문자. 경로는 항상 따옴표로 감싸고, `fd` 패턴이나 glob에 Task 이름을 넣지 않음(목록을 받은 뒤 문자열로 비교)
- Redmine 번호는 폴더 이름이 아닌 frontmatter `redmine` 목록에만 기록

## task.md 템플릿

원본: `$V/Templates/task.md` (Obsidian Templates 플러그인과 공유).
생성 시 이 파일을 읽어 아래만 채우고 나머지 구조는 그대로 유지.
- `{{date:YYYY-MM-DD}}` → 오늘 날짜
- `title:` → 큰따옴표로 감싼 제목(`"[rsmuxer] 메모리 누수 조사"`), `# ` 헤딩 → 따옴표 없는 제목
- `redmine:` → 번호 목록, `## 배경` 첫 항목 → `Redmine #<번호>` (번호가 있을 때만)

채운 예:

```markdown
---
title: "[rsmuxer] 메모리 누수 조사"
status: todo
created: 2026-10-06
...
redmine: [48213]
---
# [rsmuxer] 메모리 누수 조사
...
## 배경
- Redmine #48213
```

- 템플릿 파일이 없으면 생성을 중단하고 사용자에게 알림
- 값이 없는 필드도 키는 남김 (빈 값)
- `redmine`: 숫자 목록. 없으면 `[]`
- 사용자가 준 정보만 채움. 목표·배경을 추측해 쓰지 않음

## 동작

| 요청 | 폴더 | frontmatter |
|---|---|---|
| 생성 | `todo/`에 폴더 + `task.md` 생성 | `status: todo`, `created: 오늘` |
| 시작 | `todo/` → `in_progress/` | `status: in_progress`, `started: 오늘` |
| 완료 | `in_progress/` → `done/` | `status: done`, `completed: 오늘` |
| 로그 | 이동 없음 | 변경 없음 |
| 하위 작업 | 이동 없음 | 변경 없음 (아래 "하위 작업") |
| 작업 동기화 | 조건 충족 시 이동 (아래 "자동 상태 전환") | 이동 시 상태 전환과 동일 |
| 커밋·Redmine 연결 | 이동 없음 | `redmine` 목록 추가 (아래 "커밋과 Redmine") |
| 조회 | 이동 없음 | 읽기만 |

**생성**
1. 대상 폴더가 이미 있으면 덮어쓰지 않고 사용자에게 확인
2. 제목 없이 Redmine 번호만 주면 `redmine` skill로 이슈 제목 조회 후 사용

**Task 찾기 (생성 외 모든 요청)**
- 후보: `"$V"/Tasks/*/{todo,in_progress,done}/` 바로 아래 항목 (폴더, 예전 형식 `.md` 포함)
- 매칭: 사용자가 말한 이름이 항목 이름에 포함되는지 (대소문자 무시)
- 후보가 0개 또는 2개 이상이면 목록을 보여주고 사용자에게 확인
- 이름 없이 "그거", "끝났어"처럼 말하면 대화에서 직전에 다룬 Task를 사용

**상태 전환**
1. 이동 대상 경로가 이미 있으면 중단하고 사용자에게 확인 (`mv -n` 사용)
2. 폴더 이동 후 frontmatter `status`와 날짜 필드를 같은 작업에서 갱신
3. todo에서 바로 완료하면 `started`도 오늘로 채움
4. 완료 전 아래 "커밋과 Redmine"의 커밋 후보 검색 (조건이 맞을 때만)
5. 완료 전 `## 하위 작업`에 `- [ ]`가 남아 있으면 목록을 보여주고 완료 진행 여부를 확인. 진행해도 체크박스는 그대로 둠
6. 완료 시 `## 결과`: 사용자가 결과를 말했으면 그대로 기록. 말하지 않았으면 작업 로그 기반 초안을 보여주고 확인 후 기록
7. 4~6의 확인 사항은 한 번에 모아서 질문

**로그**
- `## 작업 로그` 아래에 날짜 헤딩 + bullet로 추가. 같은 날짜 헤딩이 있으면 그 아래에 이어 씀
- 사용자 문장을 요약하지 말고 쉼표·문장 단위로 나눠 원문 그대로 기록

```markdown
### 2026-10-06
- valgrind 로 재현함
- ConvertJob 소멸자에서 버퍼 해제 누락 확인
```

**하위 작업**

`task.md`의 `## 하위 작업` 체크리스트가 하위 작업 상태의 유일한 기록.
- 추가: `- [ ] <항목>` 추가
- 완료: `- [ ]` → `- [x]`, 그리고 `## 작업 로그` 오늘 날짜 아래에 `- <항목> 완료` 기록
- Subtask 노트 승격: 사용자가 요청할 때, 또는 하위 작업에 별도 로그·첨부가 필요할 때 제안 후 진행
  1. 원본 `$V/Templates/subtask.md`를 읽어 `parent:` → 상위 Task 이름(링크 없이 텍스트), `# ` 헤딩 → 하위 작업 이름, 날짜 변수 → 오늘
  2. `<Task 폴더>/<하위 작업 이름>.md`로 생성. 이름 규칙은 폴더 이름과 동일, `task`는 사용 불가. 같은 경로가 있으면 덮어쓰지 않고 확인
  3. 체크리스트 항목을 `- [ ] [[<하위 작업 이름>]]`로 교체 (체크 상태는 유지)
- Subtask 노트에 `status`를 두지 않음. 완료 여부는 체크박스만으로 판단
- 승격된 하위 작업의 로그는 Subtask 노트의 `## 작업 로그`에 기록 (형식은 위 "로그"와 동일). 어느 하위 작업인지 불분명하면 상위 `task.md`에 기록

```markdown
## 하위 작업
- [x] valgrind로 재현
- [ ] [[ConvertJob 소멸자 수정]]
- [ ] 회귀 테스트
```

**커밋과 Redmine**

`task.md`와 Subtask 노트 각각의 `## 커밋`, `redmine`에 기록. 승격된 하위 작업의 커밋은 Subtask 노트에.

둘 다 선택 사항. 정보가 없으면 `## 커밋`과 `redmine`을 비워 두고 사용자에게 묻지 않음. 후보 검색 결과가 없으면 언급 없이 넘어감.

커밋 기록 조건 (하나라도 해당하면 기록):
- 이 대화에서 해당 Task 작업으로 커밋함 → 바로 기록
- 사용자가 커밋 SHA·URL을 알려줌 → 바로 기록
- 로그 추가·완료 처리 시 이 대화에서 작업한 git 저장소(없으면 현재 작업 폴더)가 있고 `redmine`이 비어 있지 않음 → `git log --all --grep='#<번호>' --format='%h %ad %s' --date=short`로 후보 검색, 이미 기록된 SHA는 제외하고 사용자 확인 후 기록

커밋 항목 형식:

```markdown
## 커밋
- 2026-10-06 rsmuxer [a1b2c3d](https://gitlab.rsupport.com/server/rsmuxer/-/commit/a1b2c3d) ConvertJob 소멸자 버퍼 해제 (#48213)
```

- 날짜: 커밋 날짜(`%ad`). 저장소 이름: 원격 주소의 마지막 경로
- URL: `git remote get-url origin`을 `https://<host>/<path>`로 정규화(`git@host:path.git` 포함, `.git` 제거) 후 host가 `github.com`이면 `/commit/<sha>`, host에 `gitlab`이 들어가면(사내 `gitlab.rsupport.com` 포함) `/-/commit/<sha>`
- 정렬: 커밋 날짜 오래된 순. 새 항목은 날짜 순서에 맞게 삽입
- 원격이 없거나 host가 위 두 경우가 아니면 `` `a1b2c3d` ``처럼 SHA만 기록
- GitLab/GitHub API는 호출하지 않음. 로컬 git 정보만 사용

Redmine 번호 추가:
- 사용자가 말한 번호 → 바로 `redmine` 목록에 추가
- 커밋 메시지·브랜치 이름의 `#<번호>` 중 목록에 없는 번호 → 사용자 확인 후 추가
- 목록에 이미 있는 번호는 중복 추가하지 않음

**작업 동기화 (요청 없이 skill만 호출된 경우)**

사용자가 구체적인 Task 요청 없이 이 skill을 호출하면, 현재 대화에서 한 작업을 관련 Task에 반영.
1. 관련 Task 판별. `in_progress` Task를 우선 확인
   - 강한 근거: 대화·브랜치 이름·커밋 메시지의 Redmine 번호가 Task `redmine` 목록에 있음, 또는 대화에서 Task 이름을 언급
   - 약한 근거: 작업 중인 저장소 이름이나 컴포넌트가 Task 제목의 `[컴포넌트]`와 일치
2. 강한 근거로 Task가 1개면 바로 갱신. 약한 근거뿐이거나 후보가 여러 개면 후보를 보여주고 확인(작업 내용과 가장 가까운 Task를 첫 번째에 추천으로 표시). 후보가 없으면 새 Task 생성 여부를 질문
3. 갱신 내용
   - `## 작업 로그`: 오늘 날짜 아래에 이 대화에서 확인된 결과·결정을 항목별로 기록. 기존 로그와 중복되는 항목은 제외
   - `## 커밋`, `redmine`: 아래 "커밋과 Redmine" 규칙대로
   - `## 하위 작업`: 이 대화에서 끝난 것이 확인된 항목만 체크
4. 아래 "자동 상태 전환" 판단
5. 확실한 항목은 먼저 반영하고, 확인이 필요한 항목(커밋 후보, Redmine 번호 등)만 모아서 한 번에 질문
6. 갱신 후 Task 이름과 추가한 항목을 사용자에게 보고

**자동 상태 전환 (작업 동기화에서만)**

조건이 충족되면 확인 없이 이동하고, 이동 절차는 "상태 전환"과 동일. 예전 형식 Task는 대상 아님.
- 시작 (`todo` → `in_progress`): 이 대화에서 해당 Task 작업(코드 수정, 조사 결과, 커밋 중 하나 이상)을 실제로 함
- 완료 (`in_progress` → `done`): `## 하위 작업`에 `- [ ]`가 없고, 아래 중 하나 이상 충족
  - 하위 작업이 1개 이상 있고 모두 체크됨
  - `redmine`의 모든 이슈가 해결·종료 상태 (`redmine` skill의 issue_get으로 조회)
  - `## 목표`의 모든 항목이 이 대화에서 달성됐다는 근거(커밋, 테스트 통과 등)가 있음. `## 목표`가 비어 있으면 이 항목은 불충족
- 완료 신호(Redmine 이슈 해결, 목표 달성 근거, 사용자의 "거의 끝" 같은 언급)가 있으나 조건 일부가 부족하면(하위 작업 미완료, 목표 비어 있음 등) 이동하지 않고 부족한 점과 함께 완료 여부를 질문. 완료 신호가 없으면 질문하지 않음
- 자동 완료 시 `## 결과`는 작업 로그 기반으로 바로 기록 (확인 생략)
- 보고 형식: `<Task 제목>을 <상태>로 옮김 — 근거: <충족한 조건>`. 자동 완료면 기록한 `## 결과`도 함께 보여줌
- 사용자가 되돌리라고 하면 폴더를 원래 상태 폴더로 옮기고 `status`와 이번 전환에서 채운 날짜 필드를 이전 값으로 복원

**조회**
- 상태별로 Task 이름, `redmine`, `started`, 하위 작업 진행(`완료 수/전체 수`) 표시. 기본 범위는 `todo`와 `in_progress`

## 예전 형식 Task

frontmatter 없는 단일 `.md`나 폴더 (예: `in_progress/session3 openssl 3.5.6.md`).
- 상태 전환 시 파일이나 폴더를 그대로 이동하고 내용은 수정하지 않음 (날짜 기록 생략)
- 이동 후 새 형식 변환(폴더화, frontmatter 추가)을 제안. 승인 후에만 진행

## Common mistakes (새 형식 Task)

| 실수 | 수정 |
|---|---|
| 단일 `.md` 파일로 생성 | 항상 `<Task 이름>/task.md` |
| 날짜를 본문에 `+ 시작:` 식으로 기록 | frontmatter `started`/`completed` |
| 시작·완료일 기록을 생략 | 상태 전환마다 필수 |
| 폴더만 옮기고 `status` 미갱신 | 이동과 frontmatter 갱신은 한 묶음 |
| 완료 시 다음 연도 폴더로 이동 | 생성 연도 폴더 안에서만 이동 |
| Subtask 노트에 `status` 추가 | 상태는 상위 `task.md` 체크박스에만 |
| 하위 작업을 별도 Task로 `todo/`에 생성 | 상위 Task 폴더 안의 Subtask 노트로 생성 |
| `title: [rsmuxer] ...`처럼 따옴표 없이 기록 (YAML 목록으로 해석됨) | `title: "[rsmuxer] ..."` |
| `redmine: 48213`처럼 숫자 하나로 기록 | `redmine: [48213]` 목록 |
| 커밋 메시지의 `#번호`를 확인 없이 `redmine`에 추가 | 사용자 확인 후 추가 |
