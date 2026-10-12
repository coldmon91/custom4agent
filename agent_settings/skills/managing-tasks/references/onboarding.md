# Onboarding — managing-tasks 처음 설정

설정 파일이 없거나 vault에 Task 구조가 없을 때, 또는 사용자가 처음 설정을 요청할 때 아래 순서로 진행.
- 각 단계는 대상이 이미 있으면 건너뜀. 기존 파일·폴더는 덮어쓰지 않음
- 끝나면 단계별로 만든 것과 건너뛴 것을 보고

```bash
R="<SKILL.md가 있는 폴더>/references"
```

## 1. 설정 파일

- 설정 파일이 이미 있으면 현재 값을 보여주고 건너뜀. 사용자가 다른 vault를 말했으면 바꾸기 전에 확인
- 없으면 vault 경로를 사용자에게 물음. 추측하지 않음
- 절대 경로로 저장 (`~`는 `$HOME`으로 펼치고 끝의 `/`는 제거)
- 경로가 없거나 `.obsidian/` 폴더가 없으면(Obsidian vault 아님) 다시 확인
- `tasks`·`templates`는 기본값 `Tasks`, `Templates`. 사용자가 다른 이름을 말했을 때만 바꿈

```bash
S=~/.config/managing-tasks/setting.json
if [ ! -e "$S" ]; then
  VAULT="<vault 절대 경로>"
  [ -d "$VAULT/.obsidian" ] && mkdir -p "$(dirname "$S")" &&
    jq -n --arg v "$VAULT" '{vault: $v, tasks: "Tasks", templates: "Templates"}' > "$S"
fi
V="$(jq -r .vault "$S")"; T="$V/$(jq -r .tasks "$S")"; TPL="$V/$(jq -r .templates "$S")"
[ -d "$V/.obsidian" ] || echo "Obsidian vault 아님: $V"
```

- 마지막 확인이 실패하면 여기서 멈추고 사용자에게 vault 경로를 다시 확인. 2단계 이후는 진행하지 않음 (없는 경로에 `Tasks/`가 생기는 것을 막음)

## 2. 기본 디렉토리

```bash
Y="$(date +%Y)"
mkdir -p "$T/$Y/todo" "$T/$Y/in_progress" "$T/$Y/done" "$TPL"
```

## 3·4. 템플릿 사본과 base

- 템플릿 사본: skill 원본을 Obsidian Templates 플러그인용으로 `$TPL/`에 복사
- base: Task 목록 보기(진행 중·할 일·완료 표, 타임라인, 칸반)용 Obsidian Bases 파일을 `$T/`에 복사
- 이미 있으면 덮어쓰지 않고, 원본과 다를 때만 `diff`를 보여줌

```bash
copy_or_diff() {  # <원본> <대상>
  if [ -e "$2" ]; then diff -q "$1" "$2" >/dev/null || diff "$1" "$2"
  else cp "$1" "$2"; fi
}
copy_or_diff "$R/task.md" "$TPL/task.md"
copy_or_diff "$R/subtask.md" "$TPL/subtask.md"
copy_or_diff "$R/Tasks.base" "$T/Tasks.base"
```

- Obsidian 설정 > 코어 플러그인 > Templates의 템플릿 폴더를 `templates` 값으로 지정하라고 안내. `.obsidian/` 설정 파일은 직접 고치지 않음
- `tasks`가 `Tasks`가 아니면 새로 복사한 `Tasks.base`의 `file.inFolder("Tasks")`를 그 값으로 바꿈
- 커뮤니티 플러그인이 필요한 보기: "타임라인"(`tm-timeline`)은 Task Manager Bases View 플러그인, "칸반"(`kanban`)은 이 보기 형식을 등록하는 플러그인. 플러그인이 없으면 그 보기만 표시되지 않음. 안내만 하고 설치하지 않음

## 5. 샘플 Task

SKILL.md "생성" 절차로 `sample - 첫 Task` 생성 (`agent-session` 포함).
- `task-id`: 계산하지 않고 `"1900-000001"` 고정. 실제 연도의 번호와 겹치지 않게 함
- 컴포넌트 확인 규칙은 적용하지 않음 (샘플 전용 이름)
- `## 배경` 첫 항목: `- managing-tasks 설정 확인용 샘플. 필요 없으면 폴더째 삭제`
- 같은 이름의 Task가 있으면 건너뜀
- 생성 후 Obsidian에서 `Tasks.base`의 "할 일" 보기에 샘플이 보이는지 사용자에게 확인 요청
