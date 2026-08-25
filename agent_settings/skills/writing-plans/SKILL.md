---
name: writing-plans
description: "Use when a spec or design doc is approved and a multi-step implementation is about to begin, before touching code. Produces a bite-sized implementation plan with exact file paths, interfaces, and a runnable verification command per step. Trigger when the user says things like \"이제 구현 계획 세워줘\", \"작업 순서 정리해줘\", \"이 스펙대로 구현 계획서 작성해줘\", \"write an implementation plan\", or right after the brainstorming skill produces an approved design spec. Do NOT trigger for single-file mechanical edits, bug fixes with a known cause, or when no spec/design exists yet — run brainstorming first."
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste.
Document everything they need to know: which files to touch for each task, the code itself, docs they might need to check, and how to confirm the change actually works.
Give them the whole plan as bite-sized tasks.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain.
Assume they will not figure out on their own how to run or exercise what they just built — spell out the command.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming.
If it wasn't, suggest breaking this into separate plans — one per subsystem.
Each plan should produce working, verifiable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for.
This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure — but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition.
Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own verification cycle and is worth a fresh reviewer's gate.
When drawing task boundaries: fold setup, configuration, scaffolding, and documentation steps into the task whose deliverable needs them; split only where a reviewer could meaningfully reject one task while approving its neighbor.
Each task ends with an independently verifiable deliverable.

## Bite-Sized Task Granularity

**Each step is one action (2 ~ 5 minutes):**
- "Implement the minimal change" — step
- "Run it and confirm the expected behavior" — step

The verification step is not optional and is never "check that it looks right".
It names an exact command and an exact observable result, so the engineer knows without judgment whether the step succeeded.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Implement this plan task-by-task, in order. Steps use checkbox (`- [ ]`) syntax for tracking — mark each one done as you finish it.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Spec:** [path to the spec/design doc this plan implements — the plan
argues from the spec, so the spec travels with it; executors read both]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `<exact/path/to/new/file>`
- Modify: `<exact/path/to/existing/file>:<start>-<end>`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write the implementation**

```<language>
<the actual code — not a description of it>
```

- [ ] **Step 2: Verify**

Run: `<exact command>`
Expected: `<exact observable result>`
````

Every `<...>` above is a slot you fill in, not text to copy.
The language, file extensions, and verification command all come from the plan header's **Tech Stack**.
Depending on the deliverable it may be a build (`cargo build`, `go build ./...`), a type check, a CLI invocation with sample input, a `curl` against a running endpoint, or a log line to look for.
Whatever it is, write the literal command and the literal expected output.

## No Placeholders

Every step must contain the actual content an engineer needs.
These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Verify it works" / "confirm the output looks correct" (without a literal command and expected result)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it.
This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline.
No need to re-review — just fix and move on.
If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/plans/<filename>.md`. Two execution options:**

**1. Subagent-driven (recommended)** — dispatch a fresh subagent per task, review the diff between tasks, fast iteration

**2. Inline execution** — execute tasks in this session, batching with checkpoints for review

**Which approach?"**

**If subagent-driven chosen:**
- One subagent per task, with the task block and the spec path in its prompt. It sees only its own task, so the task's **Interfaces** block must carry every name and type it needs.
- Rate each task's implementation difficulty (Level 1 ~ 5) and dispatch the matching agent type (`impl-l1-2` / `impl-l3-4` / `impl-l5`), which owns its own model and effort. State the Level and a one-line rationale in the dispatch prompt.
- Reasoning effort cannot be passed as a dispatch argument — it comes from the agent type's own definition (`.claude/agents/*.md` frontmatter). If a Level band has a dedicated agent type that presets both model and effort, select it via `subagent_type`; otherwise the subagent inherits the session default.
- Review the resulting diff before dispatching the next task. Do not batch dispatches across tasks that depend on each other.

**If inline execution chosen:**
- Work task-by-task in order, marking `- [ ]` → `- [x]` as each step completes.
- Stop at each task boundary for review before starting the next one.
