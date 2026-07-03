# Naming Rules

Use this reference when choosing file names, module names, and directory names.

## General Rules

- Prefer names that describe the domain role, not the implementation detail.
- Match the naming style already dominant in the repository.
- Keep names stable when moving code. Rename only when the old name is actively misleading.
- Avoid filler names such as `misc`, `temp`, `new`, `final`, `helper`, and `stuff`.

## Directory Names

- Use short plural nouns for collections when the repository already does that.
- Use a feature or domain name for directories that hold related code.
- Avoid deep nesting unless each level adds a real navigation benefit.

## File Names

- Use the repository's existing case convention:
- `snake_case` in Python-heavy repositories
- `kebab-case` for many frontend and config ecosystems
- `PascalCase` only when the repository already names files after classes or components that way
- Name a file after its primary exported type, feature, or command.
- Reserve suffixes such as `.test`, `.spec`, `.stories`, or `.fixture` for the repository's established tooling.

## Module Naming Heuristics

- Prefer `billing_service.py` over `service.py` when the scope is domain-specific.
- Prefer `user_routes.ts` over `routes.ts` when the routes belong to one feature.
- Prefer `sync_project_map.py` over `script.py` when the command has a specific responsibility.

## Rename Triggers

Rename a file or directory when:

- The current name no longer matches the responsibility.
- The file holds logic for a different feature than its siblings.
- The path causes frequent navigation mistakes or duplicate names elsewhere.

Do not rename only for aesthetic consistency if the churn would be larger than the benefit.
