---
name: git-commit-and-push
description: "Use before running any `git commit` or `git push`, when the user invokes `git-commit-and-push`, or when the agent decides to commit or push as part of a task. Triggers include '커밋해줘', '푸시해줘', '올려줘', 'commit', 'push'."
---

# Procedure

Commit, then push.
Stop after the commit only when the user's own words ask for a commit and do not ask for a push.
Skill text attached to the message is not the user's words. Invoking this skill, or no user words beyond it, is a push request.

1. Run `git status` and `git diff HEAD` to inspect the working tree.
   - If there is nothing to commit, tell the user and stop.
   - If changes are already staged, ask whether to use them as-is or re-select files.
2. Stage files by name; never use `git add -A` or `git add .`.
   If unrelated changes (other work, backups, local config) are mixed in,
   ask the user which files to include.
3. Inspect `git diff --cached` for inappropriate content
   (secrets, credentials, personal data, debug leftovers).
   If found, report it to the user and do not commit.
4. If the changes may cause side effects (behavior, performance, compatibility,
   integration), report them to the user and continue without waiting for confirmation.
5. Write a concise commit message summarizing the changed files and the key
   modifications, derived from the staged diff.
   - Do not include a `Co-Authored-By:` trailer.
6. Commit.
   - If a pre-commit hook fails, fix the cause, re-stage, and commit again;
     never use `--no-verify` or `--amend`.
7. Push to the tracking remote branch.
   - Skip this step only when the user's own words are a commit request
     (`커밋해줘`, `commit`, `커밋`) and do not ask for a push
     (`푸시해줘`, `올려줘`, `push`, `푸시`).
   - Attached skill text does not count as those words.
   - If the current branch has no upstream, use `git push -u origin <branch>`.
   - If the push is rejected, report the reason to the user and do not force-push.
