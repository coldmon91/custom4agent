---
name: analysis-root-cause
description: Use when the user reports a bug, crash (SIGSEGV, abort), wrong output, flaky test, regression, memory error (use-after-free, leak, ASan/TSan/Valgrind report), race or deadlock, intermittent or production-only failure, or anything whose root cause is not yet understood — even a bare "this is broken", "fix this bug", or "원인 찾아줘". Also use when asked to investigate, diagnose, or debug, when a fix is proposed without evidence of its cause, when handing a bug fix to another agent, or when an investigation is stuck.
---

# Root Cause Analysis

A disciplined, evidence-driven workflow for finding root causes instead of chasing symptoms.

## Why this matters

The default failure mode when debugging is to guess at a fix based on pattern-matching: "this kind of error usually means X, so let me change Y." When that guess is wrong, it produces plausible-looking patches that mask the real bug, introduce regressions, or fix the wrong layer of the stack.

The second failure mode is giving up early: "cannot reproduce" or "both hypotheses failed" treated as the end of the investigation.
A blocked method calls for a different method, not a stop.

This skill enforces three checkpoints — **Reproduce**, **Hypothesize**, **Verify** — each with an explicit artifact:

- **Reproduce** catches "bugs" that don't exist, or exist only under conditions nobody wrote down.
- **Hypothesize** catches fixes that target symptoms instead of causes.
- **Verify** catches fixes that appear to work but didn't address the hypothesized cause.

Do not skip stages, even when the bug seems obvious. Obvious bugs are exactly where this workflow pays for itself.

## Mode

Decide the mode from the request before starting:

- **Analysis mode** — the user asked for the cause ("원인 찾아줘", "고치지 마", a diagnosis or review). The investigation ends at a tested hypothesis plus a proposed fix direction. Edit no product code.
- **Fix mode** — the user asked for a fix. After the hypothesis is supported, state the planned fix and why it breaks the causal chain, get the user's approval, then apply and verify it.

## Bug-type guides

Some bug types need their own diagnosis steps and forbid specific fixes.
When the symptom matches, read the guide and apply it inside the loop.

- use-after-free, dangling pointer, double free, heap-use-after-free (ASan), access to an object after shutdown or from a late callback → [references/use-after-free.md](references/use-after-free.md)

No match → the loop alone.
Several match → start with the earliest visible symptom, and read another guide once the cause turns out to be its type.

<!-- Add a guide when a type has two of: its own diagnosis steps, a common band-aid fix to forbid, fix strategies that diverge at the ownership/sync/architecture level. -->

## The loop

```
┌─────────────┐      ┌───────────────┐      ┌──────────┐
│  REPRODUCE  │ ───> │  HYPOTHESIZE  │ ───> │  VERIFY  │
└─────────────┘      └───────────────┘      └──────────┘
        ▲                    ▲                     │
        │                    └── refuted ──────────┤
        │                                          │
        └──── symptom mismatch / new conditions ───┘
```

When verification refutes the hypothesis, return to Hypothesize — the repro still holds, but the theory did not.
After two consecutive refutations, follow "When hypotheses run out" below.

---

## Stage 1: Reproduce

**Goal:** a deterministic, minimal way to trigger the bug — or, when that is impossible, an explicit alternative basis for the investigation.

### Do these things

1. **Collect the report from what is available first** — the user's message, logs, tickets, code, history. Ask the user only for what you cannot find yourself: the exact action, the actual result (raw error text or exit code), the expected result, the environment (OS, runtime, commit/branch, deployed version), and whether the bug is new.
2. **Try to reproduce it yourself** before theorizing. Run the failing command and observe the raw output. Do not trust a paraphrase of the error.
3. **Confirm you are looking at what actually failed** — the deployed version, binary, config file, host, and process. The code you read may not be the code that crashed.
4. **Narrow the repro.** Strip inputs, flags, and code that aren't needed to trigger the bug.
5. **Check determinism.** Run the repro 3 – 5 times. If it is intermittent, raise the failure rate before moving on (loops, load, widened timing window — see [references/unblocking-techniques.md](references/unblocking-techniques.md)) so later verification has a usable baseline rate.

### Repro artifact

```
REPRO
-----
Environment: <OS, runtime, commit/branch, deployed version>
Repro type:  <local deterministic / local intermittent (N/M) / synthetic (forced by <how>) / none — evidence only (<sources>)>
Steps:
  1. <exact command or action>
  2. ...
Expected: <what should happen>
Actual:   <what does happen, including raw error text or exit code>
```

### No repro yet? Switch method

Failing to reproduce narrows the method; it does not end the investigation.
Work through these in order, doing every step your tools and permissions allow:

1. **Re-check the conditions.** Compare your environment with the failing one — version, config, data, load, timing, OS — and reproduce with the differences included.
2. **Force it synthetically.** When a candidate cause involves a timing window or resource condition, make it happen on purpose: inject a delay inside the suspect window, cap memory or file descriptors, inject faults, run under ASan/TSan/rr. A forced repro that matches the field symptom exactly counts; label it `synthetic`.
3. **Analyze from evidence.** Logs, core dumps, crash reports, metrics, timelines, and code reading can support a causal chain without a live repro. Set Repro type to `none — evidence only` and continue to Hypothesize.
4. **Instrument and wait.** Specify the logging, core dump, or trace setting that would capture the next occurrence, with its cost (disk, performance, privacy).

Return to the user only with what remains after these: hypotheses ranked most likely first, each paired with the concrete check that would confirm or refute it, marking which checks you already ran.

### Common failure modes at this stage

- Accepting a paraphrased error instead of the real one. "It crashes" and "it exits with SIGSEGV in `foo_handler` after the third request" are different bugs.
- Treating an intermittent bug as deterministic. If it fails 1 in 10 times, a single green run proves nothing.
- Reproducing a *similar* failure and assuming it's the same bug. Match the exact error, stack, and output.
- Declaring "stopping here" because the repro artifact is incomplete, instead of switching method.

---

## Stage 2: Hypothesize

**Goal:** a specific, testable claim about *why* the observed result happens — the causal chain, not just *what* happens.

### Do these things

1. **Gather evidence.** Read the code path involved, logs, stack traces, and related tests before proposing anything.
2. **Ask what changed and when it started** — code (`git log`, `git blame`), deploys, config, dependencies, data, traffic, infrastructure. A start time narrows the suspects faster than code reading.
3. **Apply a matching bug-type guide** (see "Bug-type guides") — its diagnosis steps belong here.
4. **State the hypothesis as a causal chain.** "There's a bug in the parser" is not a hypothesis; "when the input ends with a backslash, `tokenize()` enters the escape branch but never advances the cursor, looping forever at line 142" is.
5. **Push past the proximate cause.** For the last link, ask "why was this state possible?" Repeat until the answer is something you can change in design or structure — ownership, locking, a contract, validation at a boundary — not a guard just before the failing line.
6. **List alternatives and rank them** by likelihood × cost to test. If only one comes to mind, push harder. Prefer an experiment that discriminates between several hypotheses at once.
7. **Plan the cheapest test that could disprove the top hypothesis** — a log line, an assertion, a failing test, a forced timing window.

### Hypothesis artifact

```
HYPOTHESIS
----------
Claim: <specific causal statement — what, where, why>
Why possible: <the structural reason this state can occur at all>
Evidence so far: <what in the code/logs/history points here>
Alternatives (ranked): <other explanations, and why each ranks lower>
Test plan: <the cheapest experiment that would disprove this claim>
Predicted result if correct: <what you expect to see>
Predicted result if wrong: <what you'd see instead>
```

If both predictions are the same, the test does not discriminate. Refine until they differ.

### Common failure modes at this stage

- Jumping from symptom to fix without a causal chain. "The test fails, so add a retry" changes behavior without explaining the failure.
- Confirmation-seeking tests whose only imaginable outcome is "I was right."
- Blaming the most recently changed code by default. Recent changes are a prior, not a conclusion.
- Stopping at the line that crashed instead of asking why that line could be reached in that state.

---

## Stage 3: Verify

**Goal:** run the experiment and update beliefs based on what actually happens.

### Do these things

1. **Run the planned test.** Do not change it mid-run. Predicted-if-correct → supported. Predicted-if-wrong → refuted. Something unpredicted → inconclusive; return to Hypothesize with the new evidence.
2. **Toggle the cause when you can.** Neutralize the suspected cause and the symptom should disappear; restore it and the symptom should return. A toggle is stronger evidence than any single observation. In analysis mode, run code-changing experiments in a scratch copy or with the user's agreement, and revert them.
3. **Cross-check with tools** when the bug class allows — sanitizers, Valgrind, a debugger on a core dump, rr (see "Cross-checking with tools" in [references/unblocking-techniques.md](references/unblocking-techniques.md)). Tool output counts as evidence only once you state how it supports or refutes the hypothesis.
4. **Analysis mode ends here.** Report the cause, the confidence level, and a proposed fix direction.
5. **Fix mode:** propose the fix and how it breaks the causal chain, get approval, apply it, then run the original repro. For intermittent bugs, compare against the baseline rate (failing 3/10 before, 10/10 passes after is weak; 100/100 is better).
6. **Fix mode: check for regressions.** Run the surrounding test suite and consider adjacent code paths.

### Band-aid fixes

These hide the symptom while the cause stays, and are almost always wrong:

- A NULL or validity check just before the failing access, to skip it
- Catching the exception, panic, or error that undefined behavior surfaced as
- A flag variable tracking whether an object is still valid (the flag itself races)
- A sleep, retry, or reordering that happens to avoid the window
- Logging added while behavior stays the same

Using one requires stating why a root-cause fix is impossible, and labeling it a symptom-level patch in the report.

### Verification artifact

```
VERIFICATION
------------
Experiment run: <what you did>
Observed result: <what happened>
Matches prediction: <yes / no / partial — which branch>
Hypothesis status: <supported / refuted / inconclusive>
Confidence level: <1-5, see "Expressing confidence">

[Fix mode, if supported:]
Fix applied: <description, with file:line references>
Why the path is gone: <why the code path producing the symptom can no longer exist — not "looks safe now">
New risks checked: <races, deadlocks, or priority inversion the new locking/ownership could add, and how ruled out>
Repro result after fix: <N/N passes, or test now green>
Regression check: <what you ran, what passed>
```

### Common failure modes at this stage

- Declaring victory on one green run of an intermittent bug.
- Changing the test or repro while "verifying" so it passes for unrelated reasons.
- Stopping at "the symptom is gone." A symptom can disappear from timing changes, not because the causal chain was broken.

---

## When hypotheses run out

Trigger: two consecutive hypotheses refuted, or no testable hypothesis left.
Escalate in order, doing every step your tools allow, before reporting that nothing more can be checked:

1. **Re-verify premises.** List what you have assumed true and check each — running binary and config match the source you read, the failing host/process is the one you inspected, the log is from the failing run, "unchanged" dependencies really are unchanged. Checklist in [references/unblocking-techniques.md](references/unblocking-techniques.md).
2. **Name the shared assumption.** Refuted hypotheses often share one frame — same process, thread, host, or layer. Name it and generate hypotheses outside it.
3. **Widen observation.** Add logging or tracing at the boundaries of the suspect region so the next run shows which side the fault is on.
4. **Search mechanically.** Bisect commits, inputs, or config; diff a working setup against a failing one. These narrow the cause without needing a theory.
5. **Send an interim report**: what was ruled out and by which evidence, remaining hypotheses ranked, and the next check for each.

## When to loop back

- **Repro doesn't match the reported symptom** → "No repro yet? Switch method". Do not invent a repro.
- **Hypothesis refuted** → Hypothesize; on the second consecutive refutation → "When hypotheses run out".
- **Verification inconclusive** → Hypothesize with the new evidence.
- **Fix doesn't resolve the repro** → treat as a refuted hypothesis, even if the fix "seems right."

## Expressing confidence

A supported hypothesis is a belief updated by evidence, not a proven fact.
Never assert the root cause flatly — avoid "confirmed", "definitely", "clearly", or a bare "the cause is X". State a confidence level and rough probability, in the user's language.

Rate from the evidence gathered, not from whether a fix was applied:

1. **Very low** — hypothesis untested; at most one indirect clue.
2. **Low** — circumstantial evidence only (code reading, pattern match, timing fit); alternatives still open.
3. **Moderate** — a discriminating experiment or direct artifact (stack trace, core dump, sanitizer report) matches the predicted-if-correct outcome; some alternatives not yet ruled out.
4. **High** — multiple independent pieces of evidence agree (e.g. code path + trace + experiment); predicted-if-wrong did not occur; main alternatives ruled out. A toggle test, or a fix that removes the symptom in the repro, counts as one such piece.
5. **Very high** — all of High, plus deliberate attempts to disprove failed and, for intermittent bugs, enough runs to be statistically convincing (and a passing regression check in fix mode).

If no experiment has been run and no direct artifact (stack trace, core dump, sanitizer report, toggle result) exists, the level is 2 at most — however well the circumstantial evidence fits.

Probability bands follow the `analysis-synthesis` skill: L1 20-40%, L2 40-55%, L3 55-75%, L4 75-90%, L5 90%+ (never 100%).
Write both together, e.g. "Level 4 (high confidence, ~80%): X is likely the root cause."
At Level 3 or below, name the next check that would raise the level.

## Output format

```
## Root Cause: <one line, phrased as a probability — e.g. "Likely caused by X (level 4/5, ~80%)">

### Repro
<the repro artifact, including Repro type>

### Root cause
<the hypothesis as a causal chain including "why possible", prefixed with its confidence level>

### Ruled out
<refuted hypotheses and the evidence that refuted each>

### Open hypotheses and next checks
<REQUIRED at level 3 or below, or when the investigation is incomplete:
 ranked most likely first, each with a concrete check; mark checks already run>

### Fix
<fix mode: what changed (file:line) and why it breaks the causal chain
 analysis mode: proposed fix direction only>

### Verification
<experiments run, repro and regression results, final confidence level>
```

If the investigation is incomplete, state which stage you reached and what blocks the next one. Do not present an incomplete investigation as finished.

## Handing a bug fix to another agent

Put the instructions from [references/delegating-fixes.md](references/delegating-fixes.md) in the brief.
When a bug-type guide matches, add that guide's own template too; it is more specific.

## A note on user pressure

Users sometimes push for a quick fix: "just patch it, I'll deal with root cause later." You can do that, but be explicit: "I'm applying a symptom-level patch without verifying the root cause. The bug may recur or manifest elsewhere." Do not silently skip stages because the user sounds impatient — silent skipping is how patches accumulate and codebases decay.
