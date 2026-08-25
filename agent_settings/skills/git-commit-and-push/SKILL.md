---
name: git-commit-and-push
description: "Summarize changes and commit, then push to the remote repository."
---

# Procedure

1. Run `git status` and `git diff HEAD` to inspect the working tree.
   - If there is nothing to commit, tell the user and stop.
   - If changes are already staged, ask whether to use them as-is or re-select files.
2. Inspect the changes to be committed for inappropriate content
   (secrets, credentials, personal data, debug leftovers, unrelated files).
   If found, report it to the user and do not commit.
3. If the changes may cause side effects (behavior, performance, compatibility,
   integration), report them to the user before committing.
4. Write a concise commit message summarizing the changed files and the key
   modifications, derived from the diff against the previous commit.
   - Do not include a `Co-Authored-By:` trailer.
5. Commit, then push to the tracking remote branch.
   - If the current branch has no upstream, use `git push -u origin <branch>`.
   - If the push is rejected, report the reason to the user and do not force-push.
