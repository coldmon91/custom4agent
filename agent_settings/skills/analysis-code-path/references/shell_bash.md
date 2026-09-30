# Shell / Bash

## Entry points and registration
- Script entry (shebang `#!/`), a `main` function, `"$1"` / `case` subcommand dispatch
- `trap` signal handlers
- Sourced helpers that register behavior: `source`, `. file`

## Path-specific patterns
- `source`, `. file`, or `eval` with env-dependent or string-built commands: low confidence.
