---
name: daily-summary
description: "Claude Code, Codex, pi, Hermes로 작업한 내용을 로그 파일 기반으로 조회하고 요약한다. Use when the user asks to summarize today's (or a given day's) work, review what was done today, or generate a daily work report."
---

# Daily Work Summary

대상 날짜(기본: 오늘, 로컬 시간)의 Claude Code · Codex · pi · Hermes 사용자 입력을 모아 작업 내역을 요약한다.

## 데이터 수집

이 skill 디렉터리의 수집 스크립트를 실행한다.
표준 라이브러리만 사용하므로 별도 설치가 필요 없다.

```bash
timeout 60 python3 -I <skill_dir>/scripts/collect_logs.py              # 오늘
timeout 60 python3 -I <skill_dir>/scripts/collect_logs.py --date 2026-11-16
```

출력은 JSON이다.

```json
{"date": "2026-11-17",
 "sources": {
   "claude_code": {"entries": [{"time": "09:41", "project": "~/path", "session": "...", "text": "..."}], "error": null},
   "codex":  {...},
   "pi":     {...},
   "hermes": {...}}}
```

- `hermes` 항목에는 입력 채널(`cli`, `gui`, `local`, 메신저 등)을 담은 `channel` 필드가 추가된다.
- `error`가 null이 아니면 해당 도구 로그를 읽지 못한 것이다. 요약에 그 사실을 한 줄로 밝힌다.
- `text`는 500자에서 잘린다.

### 수집 출처

- Claude Code: `~/.claude/history.jsonl`
- Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl` (AGENTS.md · environment 등 주입 컨텍스트 제외)
- pi: `~/.pi/agent/sessions/*/*.jsonl` (임시 디렉터리 `/private/tmp`, `/private/var/folders` 등에서 돈 자동 실행 세션 제외)
- Hermes: `~/.hermes/state.db`의 `messages` 테이블 (읽기 전용으로 열기)

## 요약 작성 규칙

### 출력 형식

```
# 작업 요약 — YYYY-MM-DD

## Claude Code (총 N개 입력)
| 프로젝트 | 주요 작업 |
|----------|-----------|
| ~/path | 작업 설명 |

## Codex (총 N개 세션)
| 작업 경로 | 주요 내용 |
|-----------|-----------|

## pi (총 N개 세션)
| 작업 경로 | 주요 내용 |
|-----------|-----------|

## Hermes (총 N개 세션)
| 채널 · 작업 경로 | 주요 내용 |
|------------------|-----------|

## 요약
오늘 진행한 작업의 핵심을 3 ~ 5줄로 서술. 여러 도구에 걸친 같은 작업은 하나로 묶는다.
```

- 입력이 없는 도구 섹션은 생략한다.

### 그룹핑 기준
- 동일 프로젝트 경로에서 30분 이내 연속된 입력은 하나의 작업 블록으로 묶는다.
- `/clear`, `/reload-plugins`, `/exit`, `:q` 같은 housekeeping 입력은 별도 언급 없이 생략한다.
- 80자 이상인 메시지는 내용을 축약해서 표현한다.

## 주의사항

- 모든 도구에 해당 날짜 항목이 없으면 "오늘 기록된 작업이 없습니다."라고 응답한다.
- 민감 정보(토큰, 비밀번호, OAuth code 등)가 포함된 항목은 [REDACTED]로 표시한다.
- 응답은 한국어로 작성한다.
