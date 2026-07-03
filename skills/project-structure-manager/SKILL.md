---
name: project-structure-manager
description: Manage project directory layouts, source file placement, and naming decisions. Use when deciding where new code belongs, choosing a file name, renaming or moving modules to fit repository conventions, auditing folder structure, or refreshing a project map before refactoring.
---

# Project Structure Manager

## Overview

Keep repository layout decisions consistent and explicit.
Use this skill before creating new source files, moving modules, or cleaning up a project tree.

## Workflow

1. Identify the target project root and the active stack.
- Read project-level conventions first if the repository already defines them.
- Reuse existing directory and file naming patterns before inventing a new one.

2. Refresh the project map when structure decisions matter.
- Run `scripts/sync_project_map.py <project-root>`.
- Default output goes to `<project-root>/.claude/project-structure/`.
- Read `references/project-map-template.md` only when you need to adjust the generated artifact format.

3. Decide placement with the layout reference.
- Read `references/layout-rules.md`.
- Prefer extending an existing feature or domain directory.
- Create a new directory only when the change introduces a durable new area.

4. Decide the name with the naming reference.
- Read `references/naming-rules.md`.
- Match the dominant case style and suffix conventions in the repository.
- Name files after the feature, command, or exported responsibility they primarily hold.

5. Apply the change end to end.
- Create, move, or rename the files.
- Update imports, tests, generated manifests, and config references in the same change.
- Regenerate the project map after structural edits.

## Output Contract

When answering a structure question, include:

- The chosen target path
- The chosen file or directory name
- The existing neighboring paths that justify the choice
- Any follow-up edits required because of the move or rename

When making the change directly, perform the file updates instead of only recommending them.

## Resources

- `references/layout-rules.md`: placement and split heuristics
- `references/naming-rules.md`: file and directory naming heuristics
- `references/project-map-template.md`: expected shape of generated maps
- `scripts/sync_project_map.py`: generates a markdown and JSON inventory for the target repository
