---
name: diataxis-docs
description: Use when writing, reviewing, or restructuring technical documentation — choosing what form a page should take, diagnosing a page that is hard to write or hard to follow, splitting an overloaded README or wiki page, naming doc pages or doc sections, or deciding what to improve next in a doc set. Covers tutorials, how-to guides, reference and explanation, and the boundaries between them.
---

# Diátaxis Documentation

## Overview

Four kinds of documentation answer four different user needs: **tutorials**, **how-to guides**, **reference**, **explanation**. Each has a different purpose and must be written a different way.

**Crossing or blurring those boundaries is the root of most documentation problems.** A page that is painful to write, or that readers bounce off, is almost always two kinds jammed into one.

Diátaxis is a **guide, not a plan**. Don't design the four-section structure up front — improve one small piece at a time and the structure emerges from the inside out.

## When to Use

- Writing a new doc page and unsure what form it should take
- A page resists writing, or readers can't follow it
- Auditing, splitting, or restructuring an existing doc set
- Naming a doc page or section
- Deciding what to improve next in documentation

**Not for:** prose style and grammar, docs-toolchain setup (Sphinx/MkDocs/Docusaurus), API-doc generators, release notes.

## The Compass — Use This First

Two questions decide the form. Nothing else is needed.

| If the content... | ...and serves the user's... | ...then it must belong to... |
|---|---|---|
| informs **action** | **acquisition** of skill | a **tutorial** |
| informs **action** | **application** of skill | a **how-to guide** |
| informs **cognition** | **application** of skill | **reference** |
| informs **cognition** | **acquisition** of skill | **explanation** |

Read the terms loosely: *action* = practical steps, doing · *cognition* = facts and ideas, thinking · *acquisition* = the user is **studying** · *application* = the user is **working**.

Ask it in whichever direction fits — *am I writing for x or y? is this text doing x or y? does the user need x or y?* — and at any zoom level, from a whole document down to one sentence.

The compass earns its keep exactly when intuition gives a fast answer and something still feels off. Stop and run the two questions.

## The Four Kinds

| Kind | Is | Serves | Must NOT contain | Detail |
|---|---|---|---|---|
| **Tutorial** | a lesson; a guided learning experience | study | explanation beyond one line, options, alternatives | [references/tutorials.md](references/tutorials.md) |
| **How-to guide** | directions toward a real-world goal | work | teaching, digression, exhaustive option lists | [references/how-to-guides.md](references/how-to-guides.md) |
| **Reference** | neutral technical description of the machinery | work | instruction, explanation, opinion, recommendation | [references/reference.md](references/reference.md) |
| **Explanation** | discussion *about* a topic; context and why | study | step-by-step instruction, technical description | [references/explanation.md](references/explanation.md) |

Whatever a kind must not contain, **link to it instead of inlining it**. That link is the whole technique.

The two axes behind the table: tutorials/how-to guides are about what the user **does**, reference/explanation about what the user **knows**; tutorials/explanation serve **study**, how-to guides/reference serve **work**.

## Working

The entire workflow — details in [references/workflow.md](references/workflow.md).

1. **Choose something** — the page in front of you. Don't hunt for the worst problem; pick at random if needed. Smaller than a page is better.
2. **Assess it** — What user need does this represent? How well does it serve that need? Do its language and logic match its mode?
3. **Decide** — What *single* next action produces an immediate improvement?
4. **Do it** — and consider it done. Commit or publish it. Then repeat.

Every step in the right direction is worth shipping immediately; don't batch. Documentation is **never finished but always complete** — appropriate to its current stage, with nothing missing.

## Red Flags

| Symptom | Diagnosis | Fix |
|---|---|---|
| A tutorial keeps pausing to explain *why* | explanation leaking into a tutorial | one-line reason, then link out |
| A "tutorial" offers options and alternatives at each step | it's a how-to guide | move it, or strip to one path |
| A page nobody can title | two kinds in one page | split it with the compass |
| Title is *Application performance monitoring* | doesn't say what the page does | *How to integrate application performance monitoring* |
| How-to organized around what a tool can do ("Using the Deploy button") | written from the machine's perspective | reframe around the user's goal |
| Reference contains "we recommend", tips, tradeoffs | opinion in reference | move to explanation, link back |
| Reference structure invented independently of the code | doesn't mirror the machinery | mirror the module/class/method structure |
| Explanation drifts into numbered steps | how-to leaking into explanation | extract a how-to guide |
| Empty `tutorials/`, `how-to/`, `reference/`, `explanation/` folders created up front | structure imposed from outside | delete them; create a heading when real content demands one |
| "Let's plan the whole doc set first" | using Diátaxis as a plan | one small improvement, then the next |

Diátaxis is wholly pragmatic — no exam, no need to buy the whole theory. Take the one idea that helps and apply it now.

---
