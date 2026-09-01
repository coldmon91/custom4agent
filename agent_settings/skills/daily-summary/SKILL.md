---
name: daily-summary
description: "Claude Code와 Codex로 작업한 내용을 로그 파일 기반으로 조회하고 요약한다. Use when the user asks to summarize today's work, review what was done today, or generate a daily work report."
---

# Daily Work Summary

오늘(currentDate 기준) Claude Code와 Codex의 세션 로그를 읽어 작업 내역을 요약한다.

## 데이터 수집 절차

### 1. Claude Code 히스토리 수집

`~/.claude/history.jsonl` 파일에서 대상 날짜의 항목을 추출한다.

```python
import json, datetime

today = datetime.date.today()
start_ms = int(datetime.datetime(today.year, today.month, today.day, 0, 0, 0).timestamp() * 1000)
end_ms   = int(datetime.datetime(today.year, today.month, today.day, 23, 59, 59).timestamp() * 1000)

entries = []
with open('/Users/cskim/.claude/history.jsonl') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        ts = obj.get('timestamp', 0)
        if start_ms <= ts <= end_ms:
            entries.append({
                'time': datetime.datetime.fromtimestamp(ts / 1000).strftime('%H:%M'),
                'project': obj.get('project', '').replace('/Users/cskim', '~'),
                'text': obj.get('display', ''),
            })
```

각 항목의 `text`가 `/`로 시작하는 slash command이면 별도로 분류한다.

### 2. Codex 세션 수집

`~/.codex/sessions/YYYY/MM/DD/*.jsonl` 에서 대상 날짜 경로의 파일을 읽는다.

```python
import glob, os

session_dir = f'/Users/cskim/.codex/sessions/{today.year}/{today.month:02d}/{today.day:02d}/'
files = sorted(glob.glob(session_dir + '*.jsonl'))

codex_sessions = []
for fpath in files:
    cwd = ''
    user_messages = []

    with open(fpath) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            payload = obj.get('payload', {})

            # cwd 추출
            if obj.get('type') == 'session_meta':
                cwd = payload.get('cwd', '').replace('/Users/cskim', '~')

            # user 메시지 추출 (시스템 프롬프트 제외)
            elif obj.get('type') == 'response_item' and isinstance(payload, dict):
                if payload.get('role') == 'user':
                    content = payload.get('content', '')
                    if isinstance(content, list):
                        for c in content:
                            if isinstance(c, dict) and c.get('type') == 'input_text':
                                text = c.get('text', '')
                                if (not text.startswith('# AGENTS') and
                                    not text.startswith('<environment') and
                                    not text.startswith('<stdin>')):
                                    user_messages.append(text)
                    elif isinstance(content, str):
                        if (not content.startswith('# AGENTS') and
                            not content.startswith('<environment')):
                            user_messages.append(content)

    if user_messages:
        codex_sessions.append({
            'cwd': cwd,
            'messages': user_messages,
        })
```

## 요약 작성 규칙

수집된 데이터를 바탕으로 아래 형식으로 요약한다.

### 출력 형식

```
# 작업 요약 — YYYY-MM-DD

## Claude Code (총 N개 입력)

### 프로젝트별 작업
| 프로젝트 | 주요 작업 |
|----------|-----------|
| ~/path | 작업 설명 |

## Codex (총 N개 세션)

| 작업 경로 | 주요 내용 |
|-----------|-----------|
| ~/path | 내용 요약 |

## 요약

오늘 진행한 작업의 핵심을 3 ~ 5줄로 서술.
```

### 그룹핑 기준
- 동일 프로젝트 경로에서 30분 이내 연속된 입력은 하나의 작업 블록으로 묶는다.
- `/clear`, `/reload-plugins` 같은 housekeeping 명령은 별도 언급 없이 생략한다.
- 텍스트가 잘린 경우(메시지가 80자 이상) 내용을 축약해서 표현한다.

## 주의사항

- 로그 파일이 없거나 오늘 항목이 없으면 "오늘 기록된 작업이 없습니다."라고 응답한다.
- 민감 정보(토큰, 비밀번호, OAuth code 등)가 포함된 항목은 [REDACTED]로 표시한다.
- 응답은 한국어로 작성한다.
