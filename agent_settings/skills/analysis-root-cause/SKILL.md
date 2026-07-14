---
name: analysis-root-cause
description: Systematic bug investigation workflow that enforces a reproduce → hypothesize → verify loop instead of jumping to fixes. Use this skill whenever the user reports a bug, unexpected behavior, crash, flaky test, regression, "it works on my machine" issue, intermittent failure, or anything where the root cause is not yet understood — even if the user only says "this is broken" or "fix this bug". Also use when the user asks to investigate, diagnose, or debug something, or when a fix is being proposed without confirmed evidence of the underlying cause.
---

# Root Cause Analysis

A disciplined, evidence-driven workflow for finding root causes instead of chasing symptoms.

## Why this matters

The default failure mode when debugging is to guess at a fix based on pattern-matching: "this kind of error usually means X, so let me change Y." That approach sometimes works, but when it doesn't, it produces plausible-looking patches that mask the real bug, introduce regressions, or fix the wrong layer of the stack. The cost of skipping investigation is paid later, often by someone else.

This skill enforces three checkpoints — **Reproduce**, **Hypothesize**, **Verify** — and requires an explicit artifact at each one before moving on. The point is not bureaucracy; the point is that each checkpoint catches a different class of mistake:

- **Reproduce** catches "bugs" that don't exist, or exist only under conditions nobody wrote down.
- **Hypothesize** catches fixes that target symptoms instead of causes.
- **Verify** catches fixes that appear to work but actually didn't address the hypothesized cause.

Do not skip stages, even when the bug seems obvious. Obvious bugs are exactly where this workflow pays for itself — the overhead is small, and on the rare occasion that the "obvious" answer is wrong, you save a debugging session.

## The loop

```
┌─────────────┐      ┌───────────────┐      ┌──────────┐
│  REPRODUCE  │ ───> │  HYPOTHESIZE  │ ───> │  VERIFY  │
└─────────────┘      └───────────────┘      └──────────┘
        ▲                                          │
        │                                          │
        └──────── hypothesis wrong? loop back ─────┘
```

When verification disproves the hypothesis, return to Hypothesize (not Reproduce) — the repro still holds, but the theory about why did not.

---

## Stage 1: Reproduce

**Goal:** produce a deterministic, minimal way to trigger the bug. Without this, every later stage is guessing.

### Do these things

1. **Gather the report.** Ask the user — or extract from context — for: the exact command or action taken, the actual result (error text, wrong output, crash), the expected result, the environment (OS, runtime version, commit/branch), and whether the bug is new or old.
2. **Try to reproduce it yourself** in the available environment before theorizing. Run the failing command. Observe the actual output. Do not trust the user's paraphrase of the error — get the raw text.
3. **Narrow the repro.** Strip away anything that isn't needed to trigger the bug: unrelated inputs, config flags, surrounding code. A repro that requires 10 steps and 3 services is harder to reason about than one that requires 2 steps and a single process.
4. **Check for determinism.** Run the repro 3 – 5 times. If it fails sometimes and passes sometimes, that itself is a finding — the bug is timing, concurrency, or environment-dependent, and you should note this before proceeding.

### Repro artifact

Before leaving this stage, write down (in the conversation or a scratch file):

```
REPRO
-----
Environment: <OS, runtime, commit/branch>
Steps:
  1. <exact command or action>
  2. ...
Expected: <what should happen>
Actual:   <what does happen, including raw error text or exit code>
Determinism: <always / intermittent (N/M)>
```

If you cannot produce this artifact, **stop and say so**. Possible reasons: missing environment access, insufficient information from the user, or the bug does not actually reproduce. Each of those requires a different response (ask the user, request access, or report that the bug may not exist as described) — but all of them are better than proceeding on guesses.

### Common failure modes at this stage

- Accepting a paraphrased error instead of the real one. "It crashes" and "it exits with SIGSEGV in `foo_handler` after the third request" are different bugs.
- Treating an intermittent bug as a deterministic one. If it only fails 1 in 10 times, a single green run after a "fix" proves nothing.
- Reproducing a *similar* failure and assuming it's the same bug. Check that the symptoms match exactly (same error, same stack, same output).

---

## Stage 2: Hypothesize

**Goal:** form a specific, testable claim about *why* the repro produces the observed result — not just *what* happens, but the causal chain.

### Do these things

1. **Gather evidence.** Read the relevant code. Look at logs, stack traces, recent commits (`git log`, `git blame` on the suspect lines), related tests. Do not propose a hypothesis before reading the code path involved.
2. **State the hypothesis as a causal chain**, not a vague direction. "There's a bug in the parser" is not a hypothesis; "when the input contains a trailing backslash, `tokenize()` enters the escape branch but never advances the cursor, causing an infinite loop at line 142" is.
3. **List alternatives briefly.** If only one hypothesis comes to mind, push harder — there is almost always more than one possible explanation. Writing alternatives down makes it harder to fall in love with the first theory.
4. **Identify the cheapest way to test the hypothesis.** Can you add a log line? Print a variable? Check a precondition with an assertion? Write a failing test? The test should be able to *disprove* the hypothesis, not just confirm it.

### Hypothesis artifact

```
HYPOTHESIS
----------
Claim: <specific causal statement — what, where, why>
Evidence so far: <what in the code/logs/history points here>
Alternatives considered: <other explanations and why they seem less likely>
Test plan: <the cheapest experiment that would disprove this claim>
Predicted result if correct: <what you expect to see>
Predicted result if wrong: <what you'd see instead>
```

The "predicted result if wrong" field matters: if the hypothesis predicts the same outcome under both true and false, the test isn't actually discriminating. Refine until the predictions differ.

### Common failure modes at this stage

- Jumping from symptom to fix without a causal chain. "The test fails, so let me add a retry" — that changes behavior without explaining why the test failed.
- Confirmation-seeking tests. If the only outcome you can imagine is "yes, I was right," the test won't teach you anything when you're wrong.
- Blaming the most recently changed code by default. Recent changes are a reasonable prior, not a conclusion.

---

## Stage 3: Verify

**Goal:** run the experiment. Update beliefs based on what actually happens.

### Do these things

1. **Run the test you planned.** Do not change the test mid-run to make it pass. If the predicted-if-correct outcome appears, the hypothesis is supported. If the predicted-if-wrong outcome appears, the hypothesis is refuted. If you see something you did not predict, neither has happened — note this and return to Hypothesize.
2. **If the hypothesis is supported**, only then propose a fix. The fix should address the specific causal step identified in the hypothesis, not paper over the symptom. Explain why the fix breaks the causal chain.
3. **Verify the fix against the original repro.** Run the repro artifact from Stage 1. For intermittent bugs, run it enough times to be confident (if it failed 3/10 times before, 10/10 passes after is weak; 100/100 is better).
4. **Check for regressions.** Run the surrounding test suite. Consider whether the fix could affect adjacent code paths.

### Verification artifact

```
VERIFICATION
------------
Experiment run: <what you did>
Observed result: <what happened>
Matches prediction: <yes / no / partial — which branch>
Hypothesis status: <supported / refuted / inconclusive>
Confidence level: <1-5, see "Expressing confidence, not certainty" below>

[If supported, continue:]
Fix applied: <description, with file:line references>
Repro result after fix: <N/N passes, or test now green>
Regression check: <what you ran, what passed>
```

### Common failure modes at this stage

- Declaring victory on a green run when the bug was intermittent. One pass is not evidence.
- Changing the test or the repro while "verifying" so it passes for unrelated reasons.
- Stopping at "the symptom is gone" without checking that the causal chain was actually broken. A symptom can disappear because of timing changes, not because the bug is fixed.

---

## Expressing confidence, not certainty

A "supported" hypothesis is a belief updated by evidence, not a proven fact. Never state the root cause with absolute language — avoid "confirmed", "definitely", "clearly", "the cause is X" as a bare assertion. State the conclusion as a probability and attach an explicit confidence level, in the user's language.

### Confidence level (1-5)

Rate confidence from the number and certainty of evidence gathered in Verify — not from how the hypothesis "feels":

1. **Very low** — 0-1 pieces of weak/indirect evidence; hypothesis untested or the experiment only partially matched the predicted-if-correct outcome. Express as roughly 20-40% likely.
2. **Low** — 1-2 circumstantial pieces of evidence; experiment inconclusive; alternative hypotheses not ruled out. Roughly 40-55% likely.
3. **Moderate** — 2+ pieces of direct evidence; experiment matched the predicted-if-correct outcome, but no regression check yet or some alternatives remain unruled-out. Roughly 55-75% likely.
4. **High** — Multiple independent pieces of evidence agree (e.g. code path + log/trace + experiment result); predicted-if-wrong outcome did not occur; fix verified against the repro. Roughly 75-90% likely.
5. **Very high** — All of High, plus regression check passed and (for intermittent bugs) the repro was re-run enough times to be statistically convincing; attempts to disprove the hypothesis failed. Roughly 90%+ likely — never state 100%; residual uncertainty always remains.

State both the level and the qualitative phrase together, e.g. "Level 4 (high confidence, ~80%): X is likely the root cause" — never "X is the root cause" as a flat fact.

## When to loop back

- **Repro fails to reproduce the bug the user reported** → return to the user with specifics. Do not invent a repro.
- **Hypothesis is refuted** → return to Hypothesize. The repro is still valid; the theory wasn't.
- **Verification is inconclusive** (unpredicted result) → return to Hypothesize with the new evidence.
- **Fix doesn't resolve the repro** → treat as refuted hypothesis, even if the fix "seems right."

## Output format

At the end of an investigation, summarize using this structure:

```
## Root Cause: <one-line summary, phrased as a probability, not a fact — e.g. "Likely caused by X (level 4/5, ~80%)">

### Repro
<the repro artifact>

### Root cause
<the verified hypothesis, stated as a causal chain, prefixed with its confidence level and rough probability — never asserted as bare fact>

### Fix
<what was changed and why it breaks the causal chain — include file:line references>

### Verification
<how you confirmed the fix works, including regression checks and the final confidence level>
```

If the investigation is incomplete (bug didn't reproduce, hypothesis not yet verified, access blocked), be explicit about which stage you got to and what's blocking the next one. Do not present an incomplete investigation as a finished one.

## A note on user pressure

Users sometimes push for a quick fix: "just patch it, I'll deal with root cause later." You can do that, but be explicit: "I'm applying a symptom-level patch without verifying the root cause. The bug may recur or manifest elsewhere." Do not silently skip stages because the user sounds impatient — silent skipping is how patches accumulate and codebases decay.
