---
name: documentation-update
description: "Analyze changes from the current session and update project documentation accordingly. Use when the user asks to update docs after code changes, synchronize documentation with recent modifications, or maintain the doc directory structure."
---

# Documentation Update

Analyze changes from the current session and update documentation accordingly.

## Steps

1. **Identify Changes**
   - Summarize the work done in the current session.
   - Use `git diff` and `git status` to identify additional changes.
     - For unstaged files, only detect changes in source code files and `.md` files.
   - Compile a list of changed files with a brief summary of each change.

2. **Review Existing Documentation**
   - Check existing documents under the `./doc/` or `./docs/` directory.
   - Verify whether `./doc/overview.md` exists. If not, create it.

3. **Determine Documentation Updates**
   - Analyze whether the changes affect the content of existing documents.
   - Create new documents under `./doc/` if needed.
   - Update existing documents if additions or modifications are required.

4. **Review `./doc/overview.md`**
   - `overview.md` serves as the central reference guide for all documentation.
   - When documents are added, removed, or modified, review whether `overview.md` needs to be updated as well.
   - `overview.md` must include the purpose and path of each document.

5. **Report Results**
   - Summarize the list of updated documents and changes, then report to the user.

## Rules

- All documents must be located under the `./doc/` directory.
- `./doc/overview.md` serves as the index and reference guide for all other documents.
- Always review whether `overview.md` needs updating when any document changes.
- Avoid creating unnecessary documents; consolidate content into existing documents when possible.

## Document Structure

```
project/
├── plans/           # Work plans
│   └── feature-x.md
└── doc/            # Final documents
    ├── overview.md   # Document entry point (required)
    ├── protocols/
    └── api/
```

## overview.md Required Contents

- Project overview (one sentence)
- Document list with roles
- Document relationships and reading order
