# Onboarding — First-time setup

Run when the config file (`~/.config/managing-tasks/setting.json`) is missing, the vault has no Task structure, or the user asks for setup. `tasks` is shorthand for the command in "Script" of SKILL.md.

## 1. Vault path

- If `tasks config` succeeds, show the current setting. If the user named a different vault, confirm before changing it
- No config file → ask for the vault path. Do not guess
- Folder names default to `Tasks` and `Templates`. Pass them as options only when the user named others

## 2. Run

```bash
tasks init --vault "<vault path>" [--tasks <folder>] [--templates <folder>] --agent claude
```

If the config exists, run without `--vault`. Existing targets are skipped, and existing files are never overwritten.
Stages in `steps`: config file → this year's status folders and templates folder → template copies (`task.md`, `subtask.md`) → `Tasks.base` (Task list table, timeline, kanban views) → sample Task `sample - 첫 Task` (task-id fixed to `1900-000001`).

| Result | Response |
|---|---|
| `vault_missing`, `not_obsidian_vault` (no `.obsidian/`) | Stop and recheck the vault path |
| `conflict` (config points to another vault) | Show the current value. If the user wants to change it, fix only `vault` in `setting.json`, then rerun without `--vault` |
| `config_missing` | `--vault` was omitted. Go to step 1 |
| Stage `outcome: differs` | The file differs from the skill original (`references/`). Read both, show the difference, do not overwrite |

## 3. Guidance

- Report per stage: `created`, and `skipped` or `differs`
- Tell the user to set Obsidian Settings > Core plugins > Templates folder to the `templates` value. Do not edit `.obsidian/` config files
- Check "Required plugins" below and guide the user
- Ask the user to confirm the sample shows in the "할 일" (To do) view of `Tasks.base`. If not needed, the sample folder can be deleted

## Required plugins

- **Task Manager Bases View** (community plugin, id `task-manager-bases-view`): registers the "타임라인" (timeline) view (`tm-timeline`) of `Tasks.base`. Required
  - Must be enabled, not just installed. When disabled, that view shows "알 수 없는 뷰 유형으로 뷰가 설정됨 tm-timeline" (view set to unknown type tm-timeline)
  - Desktop only, Obsidian 1.10.2 or later
  - Read-only check: if `.obsidian/plugins/task-manager-bases-view/` is missing, not installed. If present but the id is absent from `.obsidian/community-plugins.json`, disabled
  - Not installed or disabled → guide install/enable in Settings > Community plugins. If Restricted mode is on, turn it off first
- The "칸반" (kanban) view (`kanban`) needs a plugin that registers that view type. Without it, only that view is missing
- The user installs and enables plugins. Do not edit `.obsidian/` files
- For the error above, check only this section, not the whole init
