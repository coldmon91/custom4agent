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
- 제목: `<컴포넌트> - <내용>` (예: `rsmuxer - 메모리 누수 조사`, `session3 - openssl 3.5.6 적용`)
  - 컴포넌트: `rsupport` skill의 서버 컴포넌트 이름, 버전 접미사 포함 가능(`session3`). 소문자
  - 사용자 말에서 컴포넌트를 특정할 수 없으면 생성 전에 사용자에게 확인
- 폴더 이름: 제목과 동일 (`rsmuxer - 메모리 누수 조사`). Obsidian이 거부하는 `[ ] # ^ | / \ :`가 제목에 있으면 제목과 폴더 이름 모두 공백으로 치환
  - 경로는 항상 따옴표로 감쌈 (공백 포함)
- Redmine 번호는 폴더 이름이 아닌 frontmatter `redmine`과 본문에만 기록

## task.md 템플릿

원본: `$V/Templates/task.md` (Obsidian Templates 플러그인과 공유).
생성 시 이 파일을 읽어 아래만 채우고 나머지 구조는 그대로 유지.
- `# ` 헤딩 → 제목. frontmatter에는 제목 필드가 없음 (제목 = 헤딩 = 폴더 이름)
- `redmine:` → 번호, `## 배경` 첫 항목 → `Redmine #<번호>` (번호가 있을 때만)

채운 예:

```markdown
---
status: todo
started:
end-date:
redmine: 48213
tags:
  - task
subtask:
git-commit:
---
# rsmuxer - 메모리 누수 조사

## 배경
- Redmine #48213
...
```

- 템플릿 파일이 없으면 생성을 중단하고 사용자에게 알림
- 값이 없는 필드도 키는 남김 (빈 값)
- `subtask`, `git-commit`은 YAML 목록 (`  - ` 들여쓰기 항목). 비어 있으면 키만
- `redmine`: 대표 이슈 번호 하나, 숫자만 (`redmine: 48213`). `[ ]`, `#`, 따옴표 없이. 없으면 빈 값
- 추가 관련 이슈: `## 배경`에 `- 관련: #<번호>`로 기록
- 사용자가 준 정보만 채움. 목표·배경을 추측해 쓰지 않음

## 동작

| 요청 | 폴더 | frontmatter |
|---|---|---|
| 생성 | `todo/`에 폴더 + `task.md` 생성 | `status: todo` |
| 시작 | `todo/` → `in_progress/` | `status: in_progress`, `started: 오늘` |
| 완료 | `in_progress/` → `done/` | `status: done`, `end-date: 오늘` |
| 로그 | 이동 없음 | 변경 없음 |
| 하위 작업 | 이동 없음 | `subtask` 목록 (아래 "하위 작업") |
| 작업 동기화 | 조건 충족 시 이동 (아래 "자동 상태 전환") | 이동 시 상태 전환과 동일 |
| 커밋·Redmine 연결 | 이동 없음 | `git-commit`, `redmine` (아래 "커밋과 Redmine") |
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
5. 완료 전 `status: done`이 아닌 Subtask 노트나 본문의 `- [ ]`가 남아 있으면 목록을 보여주고 완료 진행 여부를 확인. 진행해도 Subtask 노트 `status`와 체크박스는 그대로 둠
6. 완료 시 `## 결과`: 사용자가 결과를 말했으면 그대로 기록. 말하지 않았으면 작업 로그 기반 초안을 보여주고 확인 후 기록
7. 4~6의 확인 사항은 한 번에 모아서 질문

**로그**
- `## 작업 로그` 아래, `### 원인 분석` 앞에 날짜 헤딩 + bullet로 추가. 같은 날짜 헤딩이 있으면 그 아래에 이어 씀
- 사용자 문장을 요약하지 말고 쉼표·문장 단위로 나눠 원문 그대로 기록
- 원인으로 확인된 내용(근본 원인, 재현 조건)은 날짜 아래가 아닌 `### 원인 분석` 아래에만 기록 (원문 그대로). 헤딩이 없으면 `## 작업 로그` 끝에 추가
- 템플릿의 빈 bullet(`- `)은 첫 항목을 쓸 때 그 항목으로 교체

```markdown
## 작업 로그
### 2026-10-06
- valgrind 로 재현함
### 원인 분석
- 원인은 ConvertJob 소멸자에서 버퍼 해제 누락이었음
```

**자료 파일**

조사 자료·분석 결과·로그 발췌처럼 로그 bullet 몇 줄로 담기 어려운 기록은 별도 파일로 남겨도 됨.
- 위치: Task 폴더 안 (`<Task 폴더>/<주제>.md`). 로그·이미지 같은 첨부도 같은 폴더
- 이름: vault 안에서 유일하게. 생성 전 `fd -F "<주제>.md" "$V"`로 확인하고, 겹치면 앞에 컴포넌트를 붙임(`rsmuxer - ConvertJob 메모리 분석.md`). `task`와 Subtask 노트 이름은 사용 불가
- 형식: frontmatter 없이 `# <주제>`로 시작
- 연결: `## 작업 로그` 오늘 날짜 아래에 `- <한 줄 요약> → [[<주제>]]` 추가
- 상태(체크박스, `status`)는 두지 않음

**하위 작업**

하위 작업 1개 = Task 폴더 안의 Subtask 노트 1개. 목록은 `task.md`의 `subtask`, 상태는 각 Subtask 노트의 `status`(`todo`/`done`)가 유일한 기록.
- 추가
  1. 원본 `$V/Templates/subtask.md`를 읽어 `parent:` → 상위 Task 이름(링크 없이 텍스트), `# ` 헤딩 → 하위 작업 이름. `status: todo`는 그대로
  2. `<Task 폴더>/<하위 작업 이름>.md`로 생성. 이름 규칙은 폴더 이름과 동일, 유일성 확인은 "자료 파일"과 동일, `task`는 사용 불가. 같은 경로가 있으면 덮어쓰지 않고 확인
  3. `task.md`의 `subtask`에 `  - "[[<하위 작업 이름>]]"` 추가. 큰따옴표 필수 (없으면 YAML이 중첩 목록으로 읽음)
- 완료: Subtask 노트 `status: done`, 그리고 상위 `task.md`의 `## 작업 로그` 오늘 날짜 아래에 `- [[<하위 작업 이름>]] 완료` 기록
- Subtask 노트는 폴더 이동 없음. `status` 값은 `todo`, `done` 두 가지만
- 하위 작업의 로그는 Subtask 노트의 `## 작업 로그`에 기록 (형식은 위 "로그"와 동일). 어느 하위 작업인지 불분명하면 상위 `task.md`에 기록

```markdown
subtask:
  - "[[valgrind로 재현]]"
  - "[[ConvertJob 소멸자 수정]]"
```

**커밋과 Redmine**

`task.md` frontmatter의 `git-commit`, `redmine`에 기록. Subtask 노트에는 `git-commit`이 없으므로 하위 작업의 커밋도 상위 `task.md`에 기록.

둘 다 선택 사항. 정보가 없으면 `git-commit`과 `redmine`을 비워 두고 사용자에게 묻지 않음. 후보 검색 결과가 없으면 언급 없이 넘어감.

커밋 기록 조건 (하나라도 해당하면 기록):
- 이 대화에서 해당 Task 작업으로 커밋함 → 바로 기록
- 사용자가 커밋 SHA·URL을 알려줌 → 바로 기록
- 로그 추가·완료 처리 시 이 대화에서 작업한 git 저장소(없으면 현재 작업 폴더)가 있고 Task에 Redmine 번호(`redmine`, `## 배경`의 `관련: #<번호>`)가 있음 → 번호마다 `git log --all --grep='#<번호>' --format='%h %ad %s' --date=short`로 후보 검색, 이미 기록된 SHA는 제외하고 사용자 확인 후 기록

커밋 항목 형식 (커밋 URL만, 날짜·메시지는 기록하지 않음):

```markdown
git-commit:
  - https://gitlab.rsupport.com/server/rsmuxer/-/commit/a1b2c3d
```

- URL: `git remote get-url origin`을 `https://<host>/<path>`로 정규화(`git@host:path.git` 포함, `.git` 제거) 후 host가 `github.com`이면 `/commit/<sha>`, host에 `gitlab`이 들어가면(사내 `gitlab.rsupport.com` 포함) `/-/commit/<sha>`
- 정렬: 새 항목은 목록 끝에 추가. 한 번에 여러 개면 커밋 날짜 오래된 순
- 원격이 없거나 host가 위 두 경우가 아니면 `  - a1b2c3d`처럼 SHA만 기록
- GitLab/GitHub API는 호출하지 않음. 로컬 git 정보만 사용

Redmine 번호 추가:
- 사용자가 말한 번호 → `redmine`이 비어 있으면 `redmine`에, 아니면 `## 배경`에 `- 관련: #<번호>`로 바로 추가
- 커밋 메시지·브랜치 이름의 `#<번호>` 중 Task에 없는 번호 → 사용자 확인 후 위 규칙대로 추가
- Task에 이미 있는 번호는 중복 추가하지 않음

**작업 동기화 (요청 없이 skill만 호출된 경우)**

사용자가 구체적인 Task 요청 없이 이 skill을 호출하면, 현재 대화에서 한 작업을 관련 Task에 반영.
1. 관련 Task 판별. `in_progress` Task를 우선 확인
   - 강한 근거: 대화·브랜치 이름·커밋 메시지의 Redmine 번호가 Task의 `redmine` 또는 `관련: #<번호>`에 있음, 또는 대화에서 Task 이름을 언급
   - 약한 근거: 작업 중인 저장소 이름이나 컴포넌트가 Task 제목의 `<컴포넌트> -` 접두사와 일치
2. 강한 근거로 Task가 1개면 바로 갱신. 약한 근거뿐이거나 후보가 여러 개면 후보를 보여주고 확인(작업 내용과 가장 가까운 Task를 첫 번째에 추천으로 표시). 후보가 없으면 새 Task 생성 여부를 질문
3. 갱신 내용
   - `## 작업 로그`: 오늘 날짜 아래에 이 대화에서 확인된 결과·결정을 항목별로 기록. 기존 로그와 중복되는 항목은 제외
   - `git-commit`, `redmine`: 위 "커밋과 Redmine" 규칙대로
   - 하위 작업: 이 대화에서 끝난 것이 확인된 Subtask 노트만 `status: done` (위 "하위 작업"의 완료 절차)
4. 아래 "자동 상태 전환" 판단
5. 확실한 항목은 먼저 반영하고, 확인이 필요한 항목(커밋 후보, Redmine 번호 등)만 모아서 한 번에 질문
6. 갱신 후 Task 이름과 추가한 항목을 사용자에게 보고

**자동 상태 전환 (작업 동기화에서만)**

조건이 충족되면 확인 없이 이동하고, 이동 절차는 "상태 전환"과 동일. 예전 형식 Task는 대상 아님.
- 시작 (`todo` → `in_progress`): 이 대화에서 해당 Task 작업(코드 수정, 조사 결과, 커밋 중 하나 이상)을 실제로 함
- 완료 (`in_progress` → `done`): `status: done`이 아닌 Subtask 노트와 본문의 `- [ ]`가 없고, 아래 중 하나 이상 충족
  - `subtask`에 Subtask 노트가 1개 이상 있고 모두 `status: done`
  - `redmine` 이슈가 해결·종료 상태 (`redmine` skill의 issue_get으로 조회). `redmine`이 비어 있으면 불충족
  - `## 목표`의 모든 항목이 이 대화에서 달성됐다는 근거(커밋, 테스트 통과 등)가 있음. `## 목표`가 비어 있으면 이 항목은 불충족
- 완료 신호(Redmine 이슈 해결, 목표 달성 근거, 사용자의 "거의 끝" 같은 언급)가 있으나 조건 일부가 부족하면(하위 작업 미완료, 목표 비어 있음 등) 이동하지 않고 부족한 점과 함께 완료 여부를 질문. 완료 신호가 없으면 질문하지 않음
- 자동 완료 시 `## 결과`는 작업 로그 기반으로 바로 기록 (확인 생략)
- 보고 형식: `<Task 제목>을 <상태>로 옮김 — 근거: <충족한 조건>`. 자동 완료면 기록한 `## 결과`도 함께 보여줌
- 사용자가 되돌리라고 하면 폴더를 원래 상태 폴더로 옮기고 `status`와 이번 전환에서 채운 날짜 필드를 이전 값으로 복원

**조회**
- 상태별로 Task 이름, `redmine`, `started`, 하위 작업 진행(`status: done`인 Subtask 노트 수/전체 수) 표시. 기본 범위는 `todo`와 `in_progress`

## 예전 형식 Task

frontmatter 없는 단일 `.md`나 폴더 (예: `in_progress/session3 openssl 3.5.6.md`).
- 상태 전환 시 파일이나 폴더를 그대로 이동하고 내용은 수정하지 않음 (날짜 기록 생략)
- 이동 후 새 형식 변환(폴더화, frontmatter 추가)을 제안. 승인 후에만 진행

## Common mistakes (새 형식 Task)

| 실수 | 수정 |
|---|---|
| 단일 `.md` 파일로 생성 | 항상 `<Task 이름>/task.md` |
| 날짜를 본문에 `+ 시작:` 식으로 기록 | frontmatter `started`/`end-date` |
| `title`, `created`, `completed` 필드 추가 | 템플릿에 없는 필드. 완료일은 `end-date` |
| 시작·완료일 기록을 생략 | 상태 전환마다 필수 |
| 폴더만 옮기고 `status` 미갱신 | 이동과 frontmatter 갱신은 한 묶음 |
| 완료 시 다음 연도 폴더로 이동 | 생성 연도 폴더 안에서만 이동 |
| 하위 작업을 본문 체크리스트(`## 하위 작업`)로 추가 | Subtask 노트 생성 + `subtask`에 링크 |
| 하위 작업을 별도 Task로 `todo/`에 생성 | 상위 Task 폴더 안의 Subtask 노트로 생성 |
| `subtask`에 `- [[이름]]` (따옴표 없음) | `- "[[이름]]"` |
| `## 커밋` 섹션이나 `git-commit`에 날짜·메시지·마크다운 링크 기록 | `git-commit`에 커밋 URL만 |
| 제목·폴더 이름에 `[ ]` 사용 (Obsidian이 거부) | `rsmuxer - ...` 형식 |
| `redmine: [48213]`, `redmine: "#48213"`처럼 기록 | `redmine: 48213` |
| 커밋 메시지의 `#번호`를 확인 없이 추가 | 사용자 확인 후 추가 |
