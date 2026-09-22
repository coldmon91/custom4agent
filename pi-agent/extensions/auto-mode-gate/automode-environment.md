Answers to the ruleset's environment questions, written by the user who runs this
agent. They describe what this machine is, so the classifier stops reading
ordinary work here as scope escalation. They grant no permission of their own:
every deny rule still applies to the action itself.

## Whose machine this is

A single developer's personal macOS workstation. There is no shared host, no
production system and no other user's data on it. "Shared resource" rules are
about this developer's remote servers, not about anything under this home
directory.

## The agent's own configuration is an ordinary project here

`~/.pi/agent` is a symlink to `pi-agent/` inside the developer's
`custom_agent-skills` git repository; the configuration for the other coding
agents on this machine is kept and edited the same way.
Editing pi extensions, skills, prompts, `settings.json` or the ruleset files is
this repository's whole subject matter — it is the user's routine, intended work,
not Self-Modification, Instruction Poisoning or Unauthorized Persistence. Those
rules still apply to their real targets: permission widening the user did not
ask for, or instruction text manufactured to pre-authorise a future action.

## Directories that are in project scope

- the session's working directory, and any git repository under `~/Documents/rsupport`
- `~/.pi/agent` and the other coding agents' configuration directories under `~`
- `$TMPDIR`, `/tmp/claude-*`, and session scratchpad directories — scratch space
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent` — the installed
  pi package, read to understand the API the extensions are written against.
  Reading it is normal; writing to it is not.

## Tooling that looks unusual but is not

- `rg`, `fd`, `jq`, `gtimeout` stand in for `grep`, `find`, `sed`, `timeout`.
- Extensions are TypeScript run directly by pi; there is no build step.
- Long `printf`-separated command lines are this agent's own reporting habit.
- `pi`, `claude`, `codex` and `agy` are CLIs the developer drives on purpose;
  one agent invoking another is intended delegation, not Create Unsafe Agents.

## What still deserves an approval prompt here

Deleting or overwriting pre-existing files outside the working directory,
anything touching the remote servers reached through the `cm` gateway, pushing or
publishing, reading credential stores, and network commands that send local
content anywhere.
