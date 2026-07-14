---
name: debugging
description: >
  Entry point for bug diagnosis and fixing. When the user requests debugging of
  crashes, undefined behavior, memory errors, concurrency issues, or unexpected
  behavior, this skill routes to the matching sub-reference guide (e.g.
  use-after-free) for the symptom. It also provides principles common to all
  debugging work (symptom vs root cause, reproduce-hypothesize-verify loop, no
  band-aid fixes). Trigger examples: "이 크래시 좀 봐줘", "SIGSEGV가 나는데 원인 찾아줘",
  "이미 해제된 포인터", "race condition", "deadlock", "메모리 누수", "NULL 역참조",
  "ASan/TSan/Valgrind 리포트", "AI agent에게 버그 수정을 위임할 지침이 필요해".
---

# Debugging Skill

Entry point and router for bug diagnosis and fixing.

## Role of this skill

1. **Provide common principles** — the reasoning procedure and forbidden patterns that apply to all debugging.
2. **Route to sub-guides** — select and read the references file matching the symptom/bug type.
3. **Standardize AI agent delegation** — a common template to prevent band-aid fixes when delegating bug fixes.

This skill itself does not hold detailed diagnosis/fix procedures for specific bug types. Those live in `references/<topic>.md`.

---

## Procedure

### Step 1: Classify symptom → select sub-guide

From the user's report, logs, or code, check for the signals below, and **read the matching references file first** and follow its procedure.

| Symptom / keyword | Reference file |
|-------------------|----------------|
| use-after-free, dangling pointer, double free, dereferencing a deleted object, heap-use-after-free (ASan), multithreaded memory bug, callback/event handling after shutdown | [`references/use-after-free.md`](references/use-after-free.md) |

If **no** entry matches — it's a topic without a references file yet. Apply only the "common principles" below, tell the user that a reference guide for this type is not yet written, and proceed with general debugging.

If **multiple** match — read the guide for the earliest-visible symptom first, but if another type turns out to be the real cause during analysis, read that guide too.

### Step 2: Apply common principles

Follow the sub-guide's procedure, but the principles below apply to all debugging.

---

## Common principles

### 1. Fix the root cause, not the symptom

A fix that blocks the **point just before** a crash/error is almost always wrong. A symptom is the surface of a deeper cause; masking the surface makes the cause reappear in another form or silently corrupt state.

```
Wrong thinking:    "crash on this line → guard this line"
Right thinking:    "crash on this line → why can this line be reached → prevent the reach itself"
```

### 2. Reproduce → hypothesize → verify loop

**Before** writing fix code, complete:

1. **Reproduce** — secure a minimal repro case. If the repro is unstable, suspect race condition / timing dependency first.
2. **Hypothesize** — form a hypothesis from the consistency between observed symptoms and code/logs. It must answer "why is this state possible."
3. **Verify** — decide what additional evidence should exist if the hypothesis is correct, and secure that evidence.

Fixing code without a hypothesis may make the symptom vanish through an accidental behavior change while the cause remains.

### 3. No band-aid fixes

The following patterns are almost always wrong fixes:

- Adding a NULL/validity check just before dereference/access to "safely skip"
- Swallowing exceptions/panics with try-catch or `Result` (undefined behavior is not an exception)
- Tracking "validity" with a flag variable (the flag itself races)
- Adding ordering/sleep/retry that happens to work
- Adding only logs while leaving behavior unchanged

These patterns are rarely justified; to justify one, you must be able to explicitly explain **why a root-cause fix is impossible**.

### 4. Verify with tools

When possible, cross-check hypotheses/fixes with these tools:

- **AddressSanitizer (ASan)** — heap-use-after-free, buffer overflow, double-free
- **ThreadSanitizer (TSan)** — data race
- **UndefinedBehaviorSanitizer (UBSan)** — UB in general
- **MemorySanitizer (MSan)** — use of uninitialized memory
- **Valgrind (memcheck/helgrind)** — memory / lock ordering issues
- **gdb/lldb + core dump** — inspect state at crash time
- **rr (record-replay)** — debugging races that are hard to reproduce deterministically

Do not conclude from tool output alone; state **how the result supports or refutes the hypothesis**.

### 5. Explain the structural justification of the fix

Once the fix is done, you should be able to answer:

- After the fix, can the code path producing that symptom **structurally no longer exist**?
- Not merely "it looks safe now," but can you explain "why it is no longer possible"?
- Does the newly introduced synchronization/ownership structure avoid **other races, deadlocks, or priority inversion**?

---

## When delegating debugging to an AI agent

When delegating a bug fix to another agent, pass along the common instructions below and direct it to explicitly consult the references file for that bug type.

```markdown
## Common debugging delegation instructions

1. Fix the root cause, not the symptom. Do not make minimal-change fixes
   such as adding defensive code just before the crash point.
2. Before fixing, state (a) reproduction, (b) hypothesis, (c) verification evidence.
3. Do not use these band-aid patterns:
   - NULL/validity check just before dereference
   - swallowing undefined behavior with try-catch / Result
   - tracking validity with a flag variable
   - accidentally avoiding it with sleep/retry/ordering
4. After the fix, explain that the path producing the symptom can no longer
   structurally exist.
5. Read the detailed guide for that bug type (references/<topic>.md) first
   and follow its procedure.
```

Once the bug type is identified, prefer the **delegation instruction template** inside that references file, as it is more specific.

---

## Criteria for expanding the references directory

Criteria for adding a new bug-type guide:

- **Is there a specialized diagnosis procedure** — when the type needs analysis steps of its own (e.g. UAF's Lifetime Map, deadlock's lock ordering graph) beyond the general reproduce-hypothesize-verify loop.
- **Are band-aid fixes common** — when there is a wrong-fix pattern agents/developers often fall into that needs explicit prohibition.
- **Are fix strategies varied** — when there is no single answer and choices diverge at the ownership/synchronization/architecture level.

If two or more of the three criteria apply, it is worth splitting into a separate references file.
