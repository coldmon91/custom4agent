---
name: gws
description: "Use when a task touches Google Workspace data — Gmail, Google Calendar, Drive, Sheets, Docs, Slides, Tasks, or Google Chat (메일 확인, 일정 조회, 구글챗 대화 조회, 드라이브 파일 찾기, 시트 읽기 등) — or when a `gws` command fails with 403 'insufficient authentication scopes' or an auth error."
---

# gws — Google Workspace CLI

## Overview

Google Workspace 작업은 로컬 CLI `gws` (`/opt/homebrew/bin/gws`, `@googleworkspace/cli`) 를 Bash 로 실행하여 처리한다.
claude.ai 의 Gmail / Google Calendar / Google Drive / Google Chat MCP 커넥터는 `gws` 가 실패하고 원인을 해결할 수 없을 때만 대체 수단으로 쓴다.

- 계정: 회사 Google Workspace 계정, GCP 프로젝트 `rsgclient`, OAuth 로그인 완료
- 실행 형태: `gws <service> <resource> [sub-resource] <method> --params '<JSON>' [--json '<JSON>']`
- 모든 호출은 `gtimeout 30 gws ...` 로 감싼다

## 권한 (현재 scope 기준)

| 서비스 | 권한 | 비고 |
|---|---|---|
| Gmail | 읽기·쓰기 (`gmail.modify`) | 발송·답장·라벨 가능 |
| Calendar, Drive, Sheets, Docs, Slides, Tasks | 전체 | |
| Chat | **읽기 전용** | space·메시지·멤버 조회만. `chat +send` 불가 |
| Meet, Keep, Forms, People, Classroom, Admin Reports, Apps Script | 없음 | scope 추가 필요 |

`gtimeout 30 gws auth status` 의 `scopes` 는 **저장된 로그인** 기준이다.
캐시된 access token 의 scope 와 다를 수 있다 (트러블슈팅 참조).

## Quick Reference

아래 명령은 모두 앞에 `gtimeout 30` 을 붙여 실행한다.

| 작업 | 명령 |
|---|---|
| 오늘/이번 주 일정 (공유 캘린더 포함 전체) | `gws calendar +agenda --today` / `--week` / `--days 3` |
| 안 읽은 메일 목록 | `gws gmail +triage --max 20 --query 'is:unread'` |
| 메일 본문 읽기 | `gws gmail +read --id <MSG_ID> --headers` |
| 스탠드업 요약 (일정 + 할 일) | `gws workflow +standup-report` |
| 주간 요약 | `gws workflow +weekly-digest` |
| Chat space 목록 | `gws chat spaces list --params '{"pageSize": 100}'` |
| Chat 최근 메시지 | `gws chat spaces messages list --params '{"parent": "spaces/<ID>", "pageSize": 20, "orderBy": "createTime desc"}'` |
| Chat 기간 필터 | `"filter": "create_time > \"2026-09-29T00:00:00+09:00\""` 를 params 에 추가 |
| Drive 파일 검색 | `gws drive files list --params '{"q": "name contains \"회의록\"", "pageSize": 20}'` |
| 시트 읽기 | `gws sheets +read --spreadsheet <ID> --range 'Sheet1!A1:D20'` |
| 할 일 목록 | `gws tasks tasklists list` → `gws tasks tasks list --params '{"tasklist": "<ID>"}'` |
| 파라미터 구조 확인 | `gws schema <service.resource.method>` (예: `chat.spaces.messages.list`) |
| 명령/옵션 확인 | `gws <service> --help`, `gws <service> +<helper> --help` |

- `+` 로 시작하는 명령은 편의 helper. 없는 기능은 raw API (`resource method --params`) 로 호출한다.
- 공통 옵션: `--format table|csv|yaml`, `--page-all` (자동 페이지네이션, NDJSON), `--dry-run` (전송 없이 요청 검증)

## 출력 다루기

- `Using keyring backend: keyring` 은 stderr 출력. JSON 파싱 시 `2>/dev/null | jq ...`
- 응답이 크면 `pageSize` 를 줄이고 jq 로 필요한 필드만 추린다. 메일·채팅 본문 전체를 그대로 덤프하지 않는다
  ```bash
  gtimeout 30 gws chat spaces list --params '{"pageSize": 100}' 2>/dev/null \
    | jq -r '.spaces[] | [.name, .displayName // "(DM)"] | @tsv'
  ```
- `+` helper 는 기본 table 출력, 시각은 계정 시간대 (KST).
  raw API JSON 의 시각은 UTC (`...Z`) 이므로 사용자에게 KST (+09:00) 로 변환해 보여준다

## 쓰기 작업 규칙

조회(list/get/`+triage`/`+read`/`+agenda`) 외의 **모든 쓰기**는 실행 전 사용자 확인을 받는다.
대상: 메일 발송·답장·전달·라벨 변경, Chat 메시지 전송, 일정 생성·수정·삭제, Drive 파일 수정·공유·삭제, Sheets/Docs/Slides/Tasks 쓰기.
확인 요청에는 실행할 명령과 대상(수신자, space, 파일, 시각)을 그대로 보여준다.

- 메일은 가능하면 `gws gmail +send ... --draft` 로 초안을 먼저 만든다
- raw API 쓰기는 `--dry-run` 으로 요청을 먼저 검증한다
- scope 가 없는 작업 (예: Chat 메시지 전송, 필요 scope `chat.messages.create`) 은 바로 다른 수단으로 넘어가지 않는다.
  `gws` 권한 부족을 보고하고 두 선택지를 제시한다: (1) scope 추가 재로그인, (2) 해당 MCP 커넥터로 1회 처리

## 트러블슈팅

| 증상 | 원인 | 조치 |
|---|---|---|
| 403 `insufficient authentication scopes`, `auth status` 에 해당 scope **없음** | 로그인에 scope 누락 | 아래 scope 추가 재로그인 |
| 403 `insufficient authentication scopes`, `auth status` 에 해당 scope **있음** (재로그인 직후 흔함) | 예전 access token 캐시 (`~/.config/gws/token_cache.json`) 재사용 | 캐시 백업 후 재시도 (아래 명령) |
| `gws auth login` 이 끝나지 않음 | 브라우저 OAuth 콜백 대기 (자동으로 브라우저가 안 열릴 수 있음) | 출력의 `https://accounts.google.com/...` URL 을 사용자에게 전달 |
| API 가 disabled 라는 403 | GCP 프로젝트 `rsgclient` 에 해당 API 미활성 | 사용자에게 Cloud Console 에서 API 활성화 요청 |

**scope 추가 재로그인**
- 브라우저 인증이 필요한 대화형 명령이므로 사용자가 `! gws auth login --scopes "..."` 로 직접 실행하게 안내한다
- `--scopes` 는 기존 scope 를 **대체**한다. 현재 scope 전체 + 추가 scope 를 쉼표로 이어서 넘긴다 (빠뜨리면 기존 서비스가 막힘)
- 현재 scope 목록 (2026-09-29 기준, 변경 전 `gws auth status` 로 재확인):
  ```
  openid,email,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/documents,https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/presentations,https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/tasks,https://www.googleapis.com/auth/chat.spaces.readonly,https://www.googleapis.com/auth/chat.messages.readonly,https://www.googleapis.com/auth/chat.memberships.readonly
  ```
- 로그인 완료 후 토큰 캐시를 백업해야 새 scope 가 반영된다. 기존 백업을 덮어쓰지 않도록 시각을 붙인다
  ```bash
  mv ~/.config/gws/token_cache.json ~/.config/gws/token_cache.json.bak.$(date +%Y%m%d%H%M%S)
  ```

## Common Mistakes

- MCP 커넥터를 먼저 쓰기 → `gws` 를 먼저 쓴다
- `gws` 를 timeout 없이 실행 → `gtimeout 30`
- 재로그인만 하고 토큰 캐시를 그대로 두기 → 403 이 계속됨
- `--scopes` 에 새 scope 만 넣기 → 기존 Gmail/Drive 권한이 사라짐
- zsh 에서 `cmd="gmail +triage"; gws $cmd` → 단어 분리가 안 됨. 인자를 직접 쓰거나 `${=cmd}`
