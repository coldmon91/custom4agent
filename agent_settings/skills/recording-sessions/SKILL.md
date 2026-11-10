---
name: recording-sessions
description: Global memory skill. Use when a session in any directory starts work in a repo, on a remote host, on a fault, or on agent or machine settings; when it has changed files or remote state, or reached findings or decisions no repo holds, and is about to give its final report; when the user asks what was done before, when, or why ('지난번에 뭐 했지', '언제 했었지'); or when updating a record in the memory store ~/session-records. Not for projects whose own instructions define a session record folder.
---

# Recording Sessions

## Overview

This is the global memory skill: it applies in every directory, and `~/session-records` is the memory store that every session writes to and recalls from.
One record folder per session that left something behind, kept outside every repo, so a later session can recall what was done, when, and why.
A record holds what a repo cannot: reasons, findings, dead ends, and state observed at the time.
The topic list below is used twice: to file a record, and to decide when to look records up.

## Root and layout

- Root, the memory store: `~/session-records` (local disk only; not inside a git repo or a cloud-synced folder)
- Folder: `~/session-records/{topic}/{YYMMDD}-{session-id}/` holding `overview.md` and `history.md`
  - `YYMMDD`: session start date (`date +%y%m%d`), fixed once created
  - `session-id`: the subject, 10 characters or fewer, lowercase letters, digits, `-`

## Topics

A new topic is added to this table, with its entry condition and keys, after the user approves it.

| Topic | Holds | Entry condition at the start of a task | `keys` name |
|---|---|---|---|
| `dev` | Code work inside a repo | The task will change or debug code and the working directory is inside a git repo | Files, modules, tests, commands |
| `server` | Server operation, incident analysis, security checks | The task names a remote host, or a fault in a server component | Host aliases, components, binaries |
| `ai` | AI tooling (agents, LLMs, MCP) | The task will change a skill, an instruction file, an MCP server, or a plugin | Tool, skill, server names |
| `task` | Work management and internal requests | The task names a work item or a ticket | Item names, ticket numbers |
| `mac` | Local machine, OS, apps, network | The task will change a local OS, app, or network setting | Apps, settings, interfaces |
| `etc` | None of the above | None; looked up only when the user asks about past work | Whatever a later task would name |

## Recall before work

Decide once, when a task arrives and before the first action on it. Take the first row that matches.

| What is true | Action |
|---|---|
| Project instructions define their own session record folder | Follow those instructions; this skill does nothing |
| A topic's entry condition is true | Run the two stages below for that topic |
| No entry condition is true (a question, an explanation, a single lookup) | No lookup |

1. Stage 1, one command: `rg -N -e '^# ' -e '^keys:' -e '^project:' ~/session-records/{topic} -g overview.md`
2. A record matches when its `keys` or title name something the task names: a host, component, file, tool, setting, or ticket. For `dev`, the record's `project` must also be this repo's root.
3. Stage 2, for matching records only: read `overview.md`, then `history.md` if the overview bears on the task.
4. With a match: before the first action, tell the user in one or two lines what the record holds that bears on this task, with its date and path.
5. With no match: open nothing and start the task.

A record states what was true on its date: check a file, flag, or host state it names before relying on it.

## Recall on request

When the user asks what was done before, when, or why:

- By project: `rg -l '^project: .*<repo-name>' ~/session-records -g overview.md`
- By key or subject: `rg -il '<keyword>' ~/session-records -g overview.md`
- By day worked: `rg -l '^## 2026-11-10' ~/session-records -g history.md`
- By month updated: `rg -l '^updated: 2026-11' ~/session-records -g overview.md`
- Date-ordered list: `cd ~/session-records && fd --min-depth 2 -d 2 -t d | sort -t/ -k2`

Read the matching `overview.md` files first, then open `history.md` only for the sessions that answer the question.
Say which record the answer came from and that it reflects the record's date.

## When to record

Decide once, right before the final report. Take the first row that matches.

| What is true of this session | Action |
|---|---|
| Project instructions define their own session record folder | Follow those instructions; this skill does nothing |
| A file, a config, or remote state was changed | Record |
| An investigation over several steps reached a finding or a decision that no repo file or commit holds | Record |
| None of the above (a question answered, a term explained, a single lookup) | No record and no folder |

## Recording steps

1. Look for an earlier record of the same work: `rg -il '<keyword>' ~/session-records -g overview.md`
   - Found: reuse that folder and keep its date prefix
   - Not found: `mkdir -p ~/session-records/{topic}/$(date +%y%m%d)-{session-id}`
2. Write `overview.md` and `history.md` in the formats below, in the user's language.
3. Set `updated` in `overview.md` to today on every later change inside the folder.
4. Give the record path in one line of the final report.

## overview.md

All four frontmatter fields are REQUIRED.

- `project`: the output of `git rev-parse --show-toplevel`, or `none` outside a repo
- `keys`: 1 to 6 identifiers a later task about the same thing would name, of the kind the topic table lists, spelled exactly as they appear in commands, paths, or config

```markdown
---
created: 2026-11-10
updated: 2026-11-10
project: /Users/me/src/relay-tool
keys: [pool.py, test_pool_shutdown]
---
# pool-race — flaky pool shutdown test

- Request: test_pool_shutdown fails about 1 run in 20
- Result: close() now joins worker threads; 0 failures in 1000 runs (a1b2c3d)
- Follow-up: decide whether event-loop callers need an async close()
```

## history.md

One `## YYYY-MM-DD` section per day worked; later work on the same day continues under that section.
Every line is one of these five kinds:

- `Finding`: what was observed, with its source (file:line, command, URL)
- `Decision`: what was chosen and why, and what was rejected and why
- `Dead end`: what was tried and why it did not work
- `State`: the measured state of a host or environment at that time
- `Pointer`: the commit hash, file path, or document that holds the detail

Anything a repo already holds (the diff, the commit message, the text of a design doc) enters the record as a `Pointer` line.
A credential enters the record as the name of the place it is stored.

```markdown
# pool-race history

## 2026-11-10
- Finding: 9 failures in 200 runs (`pytest -k pool_shutdown --count 200`)
- Dead end: raised the timeout in tests/conftest.py:41 from 2 s to 10 s; failure rate unchanged, reverted
- Finding: close() returns before workers drain the queue (relay/pool.py:118-140)
- Decision: join workers in close() with a 5 s bound; a sleep in the test was rejected because production callers keep the race
- Pointer: a1b2c3d "pool: join workers in close()"
```

## Session memory and fact memory

The memory store holds session memory: the course of one session, as its record.
A fact that stays true across sessions (a preference, a naming rule, a fixed constraint) goes to the agent's own per-project memory.

## Common mistakes

- A second dated folder for continued work: run recording step 1 first
- A folder for a question-only session: last row of the recording table
- Every record of a topic opened at task start: stage 2 is for matching records only
- `keys` paraphrased or translated: the spelling used in commands, paths, or config
- A diff or commit message restated in `history.md`: one `Pointer` line
- `updated` left at the creation date after later edits
- `project` missing or relative: absolute repo root, or `none`
