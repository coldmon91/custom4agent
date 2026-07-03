# Shell / Bash Checklist

Check for:
- `main` function or script entry (shebang, sourcing)
- function definitions and calls
- trap handlers for signals
- `case` dispatch and subcommand parsing
- sourced helper scripts that register behavior

Useful search patterns:
- `#!/`, `source `, `. `, `trap `, `case `, `"$1"`, `main()`

## Dynamic Loading and Generated Code

Check for:
- `source`, `. file`, and `eval` patterns

Dynamic-specific guidance:
- Mark paths as low-confidence if sourced files or evaluated commands depend on environment or string-built commands.
