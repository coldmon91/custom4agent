# Delegating a Bug Fix

Include this block in the brief when another agent will fix a bug.

```markdown
## Bug fix instructions

1. Fix the root cause, not the symptom. Do not add defensive code just before the failing line.
2. Before editing, state (a) the repro, (b) the hypothesis as a causal chain, including why
   that state is possible at all, (c) the evidence supporting it.
3. Do not use these band-aid fixes:
   - a NULL or validity check just before the access
   - catching the exception, panic, or error that undefined behavior surfaced as
   - a flag variable tracking validity
   - a sleep, retry, or reordering that happens to avoid the window
4. After the fix, explain why the code path producing the symptom can no longer exist.
5. Run the original repro and the surrounding tests. For an intermittent bug, compare
   against the failure rate measured before the fix.
```
