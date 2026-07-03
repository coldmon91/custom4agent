# Project Map Template

Use this structure for generated project maps when the repository does not already have its own inventory format.

## Recommended Output Paths

- `<project-root>/.claude/project-structure/project-map.md`
- `<project-root>/.claude/project-structure/project-map.json`

## Markdown Sections

- Root path and generation time
- Excluded directories
- Candidate source roots
- Candidate test roots
- Top-level tree
- Notable source files
- Extension summary

## JSON Fields

- `root`
- `generated_at`
- `excluded_directories`
- `source_roots`
- `test_roots`
- `top_level_entries`
- `extension_summary`
- `files`

Prefer relative paths in generated artifacts so the map stays portable inside the repository.
