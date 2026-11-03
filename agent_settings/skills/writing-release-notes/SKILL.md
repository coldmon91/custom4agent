---
name: writing-release-notes
description: Use when writing or updating release notes or a CHANGELOG.md from git history for a version or commit range — '릴리스 노트', '릴리즈 노트', '변경 이력', 'CHANGELOG 갱신', '이번 버전 변경사항 정리', 'release notes'. Readers are internal QA and operations staff.
---

# Writing Release Notes

## Overview

A release note tells QA what to verify and operations what to do when deploying.
Each entry is one line stating one change, with the commit hashes as evidence.

## Steps

1. **Range** — default `$(git describe --tags --abbrev=0)..HEAD`. No tag, or the user named another range → use the user's range; if none was given, ask.
2. **Collect** — `git log --no-merges --format='%h %s' <range>` and `git diff --stat <range>`. For a commit whose subject does not state the change (`update`, `fix`, `wip`), read `git show <hash>`.
3. **Group** — commits that touch the same target are described by their final state. Changes that cancel out within the range produce no entry.
4. **Filter** — keep a change only if it passes the inclusion test below.
5. **Classify** — put each kept change in one of 추가 / 변경 / 수정 / 제거 / 보안. Then, for each kept change that requires an action, add one action line to 운영 영향.
6. **Write** — `CHANGELOG.md` at the repo root. Insert the new version section above the newest existing one; leave older sections untouched. If the file does not exist, create it with `# Changelog` as the only header line.
7. **Check** — every line matches its contract; 운영 영향 is present.

## Inclusion test

A change gets an entry only when QA would add or change a test case for it, or operations must act on it.

## Version section template

```markdown
## [<version>] - <YYYY-MM-DD>

### 운영 영향
- <target>: <action> 필요 (<hash>)

### 추가
- <target>: <change> (<hash>)

### 변경

### 수정

### 제거

### 보안
```

- `<version>`: from the user; when not given, use `Unreleased` and omit the date.
- 운영 영향 is always present; when no change requires an action, its only line is `- 없음`.
- Other sections appear only when they have entries, in the order above.

## Line contracts

Change line: `- <target>: <change, noun-phrase ending> (<hash>[, <hash>])`
Action line: `- <target>: <action> 필요 (<hash>[, <hash>])`

- A target that first appears within the range gets exactly one 추가 line stating what it is for; its individual features get no line.
- Any other target gets at most one change line per section: the change that most affects QA. Its other changes get no line.
- One action line states one action; every required action gets its own line.
- `<target>` is the component, command, config file, or feature name the reader knows.
- `<change>` states the observable outcome, not the implementation.
- `<action>` is what a person does during deployment: install, run first-time setup, update a config value, migrate data, re-login, grant a permission, restart, check a value. A change for which no such action can be written gets no action line.
- Hashes are short hashes from step 2; up to three, the most representative ones.

## Example

```markdown
## [2.0.1] - 2026-11-03

### 운영 영향
- `recorder.ini`: 기존 설정의 `upload_timeout` 값 확인 필요 (a1b2c3d)
- uploader: Node.js 22.18 이상 설치 필요 (d4e5f6a)

### 추가
- uploader: 업로드 실패 시 3회 재시도 (b7c8d9e, f0a1b2c)

### 변경
- `recorder.ini`: `upload_timeout` 기본값 30초 → 60초 (a1b2c3d)
- uploader: 실행 환경 Node.js 22.18 이상 (d4e5f6a)

### 수정
- session: 종료 시 임시 파일 미삭제 문제 수정 (c3d4e5f)
```
