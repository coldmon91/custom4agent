---
name: history-write
description: "Write a daily work history log entry to history/YYYYMMDD.md file. Use when the user asks to log work history, record daily changes, or write a changelog entry for the day."
---

# History Write

Write a changing history at `history/YYYYMMDD.md` file.

## Rules

- If there is no `history/YYYYMMDD.md` file, create a new file for today.
- Append the new history entry at the end of the file with a timestamp.

## Example

If you made changes on January 5, 2026, you would write your log in `history/20260105.md` like this:

```markdown
## 2026-01-05
- [10:30] Fixed bug in task creation feature.
- [14:15] Updated UI for better user experience.
```
