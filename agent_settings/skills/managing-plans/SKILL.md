---
name: managing-plans
description: Use when creating, moving, or updating a document in a code repository's plans directory (`plans/` or `docs/plans/`) that is split into todo, in_progress, and done folders - a design doc, implementation plan, result doc, or idea backlog - or when work on a planned feature starts, is committed, or is pushed to the remote. Not for Obsidian task notes (managing-tasks).
---
# Managing Plans

## Overview

A plan document's folder is its work status.
Move the document when the status changes, and keep every reference to it pointing at the new path.

## When this applies

The plans directory is `plans/` or `docs/plans/` at the repo root, whichever exists.

| What is true | Action |
|---|---|
| The plans directory has `todo/`, `in_progress/`, `done/` | Follow this skill |
| It has none of them | This skill does nothing, unless the user asks to adopt the layout; then create the three folders and sort the existing documents by the table below |

## Layout

| Location | Holds | Moves in when |
|---|---|---|
| `list.md` (plans root) | Ideas not yet decided on | An idea comes up: add it as a `- [ ]` item |
| `todo/` | Work the user has decided to do, not yet started | The user decides to do it |
| `in_progress/` | Work started, not yet pushed | The first implementation change (code, script, config) is made |
| `done/` | Work whose implementation is pushed | The push is confirmed |

A new document from writing-plans or a design session goes in `todo/` once approved, even when another skill names the plans root as the save location.
When an `list.md` item is decided on, create its document in `todo/`, check the item (`- [x]`), and write the document path next to it.

## Done check

Done means the implementation commits are on a remote branch.

```bash
git fetch origin
git branch -r --contains <implementation-commit>   # lists origin/<branch> once pushed
```

- Committed but not pushed: stays in `in_progress/`.
- Repository with no remote: done once committed to the default branch.
- Moving with unchecked `- [ ]` items left: write the reason next to each item (replaced by a later document, carried over to the next stage, out of scope).
- An overview document split into stages moves after every stage is pushed; items it marks as out of scope do not count.
- A result document moves together with the plan it reports on.

## After a move

Update every reference to the old path across the repo: other plan documents, skills, READMEs, code comments.

```bash
rg -n '<plans-dir>/(todo/|in_progress/)?<name>\.md' -g '!.git' .
```

Run the same search after the update; it must return nothing.

## Naming

Follow the naming already used in the plans directory.
A new kind of document takes the pattern of the closest existing one.
