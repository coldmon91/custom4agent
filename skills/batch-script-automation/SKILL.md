---
name: batch-script-automation
description: "Automate repetitive file operations by writing and executing a Python script instead of performing them one-by-one. Trigger this skill whenever a task involves applying the same operation to multiple files or multiple locations within files — including but not limited to: bulk string replacement, file renaming, file moving/copying, permission changes, header/footer insertion, encoding conversion, log cleanup, config migration, CSV/JSON field transformation, or any find-and-modify pattern across a codebase. Also trigger when the user says things like 'change all X to Y', 'rename every file that…', 'move files matching…', 'update all configs', 'batch process', or describes any task that would require touching more than 3 files in the same way. Even if the user doesn't explicitly ask for a script, USE THIS SKILL whenever you detect a repetitive multi-file operation — do NOT perform the edits one at a time."
---

# Batch Script Automation

When a task requires applying the same operation to multiple files (or multiple locations), **always write a Python script** to do it in one shot. Never open files one by one to make repetitive edits manually.

## Why This Matters

Manually editing files one at a time is slow, error-prone, and wastes context window. A script is faster, auditable, and reproducible. It also lets you do a dry-run first to verify scope before committing changes.

---

## Core Workflow

Follow these four phases every time. Do not skip the dry-run.

### Phase 1 — Scope & Conditions (Think Before You Act)

Before writing any code, clearly define:

1. **Target scope**: Which files or directories? Use glob patterns or explicit lists.
   - Example: `src/**/*.ts`, `./config/*.yaml`, specific file list
2. **Match condition**: What exactly triggers the operation?
   - For string replacement: exact string, regex pattern, case sensitivity
   - For file operations: name pattern, extension, date, size, content match
3. **Exclusions**: What should be left untouched?
   - Example: `node_modules/`, `.git/`, generated files, test fixtures, vendored code
4. **Edge cases**: Think about these before writing the script:
   - Partial matches (replacing "app" shouldn't affect "application" unless intended)
   - Binary files (skip them)
   - Symlinks (follow or skip?)
   - Encoding issues (UTF-8 assumed unless otherwise stated)
   - Files currently open or locked

**Present the scope to the user and confirm before proceeding.** A quick summary like:

> "I'll replace `APPLE` → `apple` in all `.py` files under `src/`, excluding `src/vendor/` and test files. This is case-sensitive and matches the exact string only. Want me to proceed?"

### Phase 2 — Write the Script

Write a self-contained Python script with the following requirements:

- **Dry-run by default**: `--dry-run` (default ON), `--execute` to apply
- **Parameterized**: Accept operation parameters via argparse (don't hardcode paths)
- **Per-file error handling**: Catch exceptions per-file, skip and collect errors
- **Logging**: Print every change as `filepath:line  'old' → 'new'` (prefix `[DRY-RUN] ` in dry-run mode)
- **Summary at the end**:
  ```
  === DRY-RUN Summary ===
  Files scanned:  N
  Files affected: N
  Total changes:  N
  Errors: N (if any)
  ```

### Phase 3 — Dry-Run & Review

1. Run the script in dry-run mode first (the default).
2. Review the output: check the number of affected files and changes make sense.
3. Spot-check a few entries — do the reported changes look correct?
4. If anything looks off, adjust the script and re-run dry-run.
5. Show the dry-run summary to the user.

### Phase 4 — Execute & Verify

1. Run with `--execute` to apply changes.
2. After execution, verify results:
   - Spot-check 2 ~ 3 modified files to confirm correctness
   - If it was a string replacement, do a quick `grep` to confirm no remaining instances
   - If it was file moves/renames, verify the files exist at their new locations
3. Report the final summary to the user.

---

## Safety Checklist

Before executing (not dry-running), mentally verify:

- [ ] Scope is not too broad (not accidentally including the entire filesystem)
- [ ] Exclusions cover generated files, vendor directories, and version control
- [ ] The match condition is specific enough (no unintended partial matches)
- [ ] Binary files are skipped
- [ ] Dry-run output looks correct and the number of changes is reasonable
- [ ] If destructive (delete/overwrite), a backup or git status is clean so changes can be reverted

---

## Anti-Patterns — Do NOT Do These

1. **One-by-one editing**: Never open each file individually with `str_replace` or `sed` in a loop across many files. Write a single Python script instead.
2. **Skipping dry-run**: Never go straight to `--execute`. Always preview first.
3. **Hardcoded paths**: Make the script accept parameters so it's reusable.
4. **No summary**: Always print what was done at the end.
5. **Overly broad scope**: `**/*` without exclusions is dangerous. Always define boundaries.
6. **Ignoring errors**: Catch exceptions per-file and report them; don't let one bad file kill the whole batch.
