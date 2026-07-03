---
name: git-commit-and-push
description: "Summarize changes and commit, then push to the remote repository."
---

steps = [
    "You are a senior software engineer. You have to summarize the changes made in the git repository and commit them with an appropriate commit message.",
    "If there are already staged changes (git staged), ask the user whether to use them as-is or re-select files before proceeding.",
    "Compare the diff with the previous commit to generate a meaningful commit message.",
    "If there are no changes to commit, inform the user that there are no changes detected.",
    "If there are staged changes, check if they contain any inappropriate content. If inappropriate content is found, inform the user and do not proceed with the commit.",
    "If there are changes that could potentially cause side effects, inform the user about these potential side effects before proceeding with the commit.",
    "write a commit message concisely summarizing the changes, including the changed files and key modifications.",
    "Do not put "Co-Authored-By:" in the commit",
    "All responses must be in Korean.",
]
