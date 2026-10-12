# Onboarding — managing-tasks 처음 설정

설정 파일(`~/.config/managing-tasks/setting.json`)이 없거나 vault에 Task 구조가 없을 때, 또는 사용자가 처음 설정을 요청할 때 진행.
`tasks`는 SKILL.md "스크립트"의 명령 줄임.

## 1. vault 경로

- `tasks config`가 성공하면 현재 설정을 보여줌. 사용자가 다른 vault를 말했으면 바꾸기 전에 확인
- 설정 파일이 없으면 vault 경로를 사용자에게 물음. 추측하지 않음
- `tasks`·`templates` 폴더 이름은 기본값 `Tasks`, `Templates`. 사용자가 다른 이름을 말했을 때만 옵션으로 넘김

## 2. 실행

```bash
tasks init --vault "<vault 경로>" [--tasks <폴더>] [--templates <폴더>] --agent claude
```

설정이 이미 있으면 `--vault` 없이 실행. 대상이 있으면 건너뛰고, 기존 파일은 덮어쓰지 않음.
`steps`의 단계: 설정 파일 → 올해 상태 폴더와 템플릿 폴더 → 템플릿 사본(`task.md`, `subtask.md`) → `Tasks.base`(Task 목록 표·타임라인·칸반 보기) → 샘플 Task `sample - 첫 Task`(task-id `1900-000001` 고정).

| 결과 | 대응 |
|---|---|
| `vault_missing`, `not_obsidian_vault` (`.obsidian/` 없음) | 멈추고 vault 경로를 다시 확인 |
| `conflict` (설정이 다른 vault를 가리킴) | 현재 값을 보여주고, 사용자가 바꾸기로 하면 `setting.json`의 `vault`만 고친 뒤 `--vault` 없이 재실행 |
| `config_missing` | `--vault` 누락. 1단계로 |
| 단계 `outcome: differs` | 기존 파일이 skill 원본(`references/`)과 다름. 두 파일을 읽어 차이를 보여주고, 덮어쓰지 않음 |

## 3. 안내

- 단계별로 만든 것(`created`)과 건너뛴 것(`skipped`, `differs`)을 보고
- Obsidian 설정 > 코어 플러그인 > Templates의 템플릿 폴더를 `templates` 값으로 지정하라고 안내. `.obsidian/` 설정 파일은 직접 고치지 않음
- 커뮤니티 플러그인이 필요한 보기: "타임라인"(`tm-timeline`)은 Task Manager Bases View 플러그인, "칸반"(`kanban`)은 이 보기 형식을 등록하는 플러그인. 없으면 그 보기만 표시되지 않음. 안내만 하고 설치하지 않음
- Obsidian에서 `Tasks.base`의 "할 일" 보기에 샘플이 보이는지 확인 요청. 필요 없으면 샘플 폴더째 삭제해도 됨
