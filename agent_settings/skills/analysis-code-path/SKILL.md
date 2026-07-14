---
name: analysis-code-path
description: >
  Analyze when a target line, function, method, or class can execute inside the current project,
  and detect unused functions, methods, types, variables, or structs across the codebase.
  Use for call paths, execution conditions, entry points, framework hooks, dead-code likelihood,
  and tool-backed unused-code detection (Go `deadcode`, Python `vulture`, Rust `cargo-udeps`,
  C/C++ `cppcheck`). Trigger when the user says things like "when is X executed", "trace callers",
  "find unused code", "what can I delete", "dead code analysis", "which functions are never called",
  or "clean up unused symbols". Supports Python, JavaScript/TypeScript, Go, C/C++, Java/Kotlin,
  Rust, and Shell. Do not use for cross-repo, production-only, or external-system behavior unless
  it is explicitly modeled in project code.
---

# Code Path Analyzer

## Purpose
Identify how a target code location can be reached, what conditions must hold for execution, which project-local entry points can trigger it, and whether the code is likely dead. Also serves as the entry point for **tool-backed unused-code detection** across Go, Rust, Python, and C/C++.

This skill is for **project-internal execution analysis** only.

## Use this skill when
- The user asks when a line, function, method, or class is executed.
- The user asks what input, client action, config, environment variable, feature flag, or event causes execution.
- The user asks for caller chains, entry points, handler registration paths, or callback registration paths.
- The user wants a dead-code assessment limited to the current project.
- The user asks to find unused code, dead code, unreferenced functions, deprecated code, or to clean up unused symbols ("find unused code", "what can I delete", "which functions are never called", "clean up unused symbols").

## Do not use this skill when
- The question depends mainly on external systems not modeled in the repository.
- The question is about runtime production telemetry, distributed traces, or infrastructure outside the repo.
- The user wants speculative behavior outside the current project scope.

## Required inputs
Prefer to get at least one of the following from the user prompt or current context:
- file path and line number
- function / method / class name
- code snippet
- a target symbol plus language/framework context

If the target is ambiguous, resolve it conservatively and call out every plausible target.

## Operating rules
- Keep analysis scope within the current project only.
- Prefer conservative static analysis: include plausible paths rather than hiding uncertainty.
- Separate **observed evidence** from **inference**.
- Mark unknowns explicitly.
- Never claim a path is impossible unless the project code makes that conclusion strong.
- If tests are the only callers, say so.
- If a target is referenced only by registration or reflection-like patterns, say that confidence is reduced.

## Script-backed execution rules
When this skill is active and shell access is available, explicitly use the matching helper script from `scripts/`.

### Language detection
Infer the primary language from the target file extension, the surrounding repository layout, or framework clues.
After detecting the language, open only the matching checklist file in `references/`.

Checklist mapping:
- Python -> `references/python.md`
- JavaScript / TypeScript -> `references/javascript_typescript.md`
- Go -> `references/go.md`
- C / C++ -> `references/c_cpp.md`
- Java / Kotlin -> `references/java_kotlin.md`
- Rust -> `references/rust.md`
- Shell / Bash -> `references/shell_bash.md`

### Required script selection
- Python target or Python-heavy repo: run `bash scripts/analyze_python.sh "<target>"`
- JavaScript / TypeScript target or JS/TS-heavy repo: run `bash scripts/analyze_js.sh "<target>"`
- Go target or Go-heavy repo: run `bash scripts/analyze_go.sh "<target>"`
- C / C++ target or C/C++-heavy repo: run `bash scripts/analyze_cpp.sh "<target>"`
- Rust target or Rust-heavy repo: run `bash scripts/analyze_rust.sh "<target>"`

### Multi-language rule
If the target crosses boundaries or the language is ambiguous, run **every relevant script**, then open only the matching checklist files for those languages and merge the evidence.

### Verification rule
After running the script:
1. Open the most relevant files reported by the script.
2. Confirm caller/callee relations in code.
3. Extract gating predicates and data origins from source.
4. Only then produce scenario and dead-code conclusions.

### Failure rule
If a script is missing, fails, or returns weak results:
- fall back to direct in-project search
- continue analysis conservatively
- explicitly say script assistance was unavailable or inconclusive

## Workflow

### 1) Resolve the target
- Find the precise symbol or code region.
- If the user gave a line number, inspect nearby symbol boundaries.
- Identify whether the target is:
  - function
  - method
  - constructor
  - class
  - callback
  - handler
  - code block / line range

### 2) Build local evidence
Use project-local search aggressively.
Prefer fast code search and symbol-aware navigation.
Look for:
- definitions
- references
- callers
- registrations
- routes
- event subscriptions
- interface implementations
- inheritance and overrides
- compile-time guards and feature flags
- asynchronous registrations (promises, futures, channels, listeners)
- dynamic dispatch patterns (reflection, string-based lookup, plugin loading)
- error handlers and exception paths

### 3) Trace upward to project entry points
For each caller chain, keep tracing toward project-local entry points such as:
- `main` or equivalent script entry
- CLI subcommands and commands
- HTTP / RPC route handlers
- background workers and queue consumers
- schedulers / cron-like registration
- signal handlers and trap handlers (shell)
- async task spawning and event listeners
- plugin hooks and dynamic loading
- framework lifecycle hooks (Rails callbacks, Spring bean init, Django signals)
- test entry points

If no entry point is found, mark the path as partial.
If only async registration exists (promise callback, listener subscription), note that timing and conditions are external to static analysis.

### 4) Extract execution conditions
For each path, collect the conditions required to reach the target.
Include:
- `if`, `switch`, `match`, guard clauses
- config checks and feature flags (both compile-time and runtime)
- environment variable checks
- authentication / authorization gates
- type checks, nil / null checks, guard assertions
- error handling branches (try-catch, Result/Option, ctx.Done())
- exception handler paths (which branches catch vs. propagate?)
- async callback and event listener registration (when is listener active?)
- decorator / annotation conditions (Spring profiles, Rails environments)
- dynamic dispatch guards (does plugin/module need to be registered?)

Represent conditions as a concise list of predicates.
Distinguish compile-time gates (unconditionally active vs. dead in build) from runtime gates (may vary per execution).

### 5) Trace data origins for key predicates
For each high-value predicate, trace where the controlling value comes from, limited to the project:
- CLI args
- HTTP params / headers / body
- config files
- env vars
- local storage / DB access code
- queue message fields
- socket / connection metadata
- framework context objects

If the origin leaves the repo boundary, say so.

### 6) Infer scenarios
Synthesize execution scenarios from the collected paths.
Each scenario should include:
- target
- path summary
- entry point
- required conditions
- controlling inputs / config
- confidence

### 7) Assess dead-code likelihood
Consider the target **likely dead** only when evidence strongly suggests one or more of the following:
- no callers found
- no project-local path from an entry point
- guarded by conditions that appear permanently disabled in-repo (e.g., `#ifdef NEVER_DEFINED`)
- only referenced in deleted / unreachable branches
- only present in tests or examples, not runtime code
- feature flag always disabled by default in production config

Consider the target **not dead but low-confidence reachable** when:
- only dynamic registration patterns exist (imports, decorators, service loaders)
- reflection / plugin loading / string-based lookup is involved
- interface dispatch exists without a concrete in-project caller chain
- callback registered only in async paths or event listeners
- exception handler path that requires specific error type
- runtime feature flag could enable it
- build tag or compile-time condition can variably include / exclude the code

In these cases, report the confidence as medium or low and list the conditions that make the path possible.

## Language-specific checklist
The language-specific checklist is maintained in `references/`.

Rules:
- Detect the language before opening any checklist file.
- Open only the checklist file that matches the detected language.
- If the target crosses languages or detection stays ambiguous, open only the checklist files for the relevant candidate languages.
- Do not load unrelated checklist files.

## Asynchronous and Concurrency Patterns

For execution paths involving async/await, promises, channels, and concurrent tasks:

### Promise and Async-Await Chains
- Language-specific async/await patterns belong in the matching file under `references/`.
- Track callbacks registered via `.then()`, `.catch()`, `.finally()`
- Identify event loop or runtime that drives execution
- Mark confidence as reduced if callback chain is long or conditional

### Channel and Queue Consumers
- Language-specific channel and queue patterns belong in the matching file under `references/`.
- Trace where data enters the channel and what triggers loop continuation
- Document backpressure / flow control gates if present

### Scheduled and Delayed Execution
- Language-specific scheduling patterns belong in the matching file under `references/`.
- Mark scheduled paths with execution time windows

## Error Control Flow

Error handling branches can significantly affect reachability:

### Exception and Error Branches
- Language-specific error-control patterns belong in the matching file under `references/`.
- try-catch-finally blocks and their branches
- Whether exceptions escape to caller or are caught
- finally blocks always execute before return / throw
- Panic or recovery behavior may change whether execution continues or terminates.
- Trace the concrete failure source before treating an error-only branch as reachable.

## Dynamic Loading and Generated Code

Dynamic dispatch reduces static analysis confidence:

### Import and Module Loading
- Language-specific loading patterns belong in the matching file under `references/`.
- Mark paths as low-confidence if target is loaded by string name or environment-dependent logic

### String-Based Dispatch
- Language-specific dispatch patterns belong in the matching file under `references/`.
- Trace where string keys originate (user input, config, database)

### Code Generation and Templates
- SQL / GraphQL generated queries: trace where template variables come from
- Language-specific ORM and macro patterns belong in the matching file under `references/`.
- Run-time bytecode / template compilation: mark as low-confidence if logic is non-obvious

### Reflection and Introspection
- Language-specific reflection or introspection patterns belong in the matching file under `references/`.
- Identify all possible targets if register of implementations exists in code
- Otherwise mark as uncertain

## Conditional Compilation and Feature Flags

Build-time and runtime feature gates must both be evaluated:

### Compile-Time Guards
- Language-specific compile-time guard patterns belong in the matching file under `references/`.
- Determine which configurations are active by reading build files, Makefiles, Cargo.toml, build.gradle
- Mark paths as conditionally reachable if feature must be enabled

### Runtime Feature Flags
- Language-specific runtime feature flag patterns belong in the matching file under `references/`.
- Trace whether flag origin is environment-controlled (external) or code-configurable (internal)
- If flag can be toggled in running system, mark as uncertain timing

### Version-Dependent Behavior
- Language-specific version assumptions belong in the matching file under `references/`.
- Mark explicitly if analysis depends on framework version assumptions
- Recommend checking framework version in requirements.txt, pom.xml, Gemfile, etc.

## Unused Code Detection Mode

When the user asks to find unused code, dead code, or unreferenced symbols (not just a single target's reachability), switch into this mode. It is tool-backed and uses a stricter classification scheme.

### Classification
Classify each candidate as exactly one of:

- `UNUSED` — statically confirmed and no edge case applies
- `UNKNOWN` — not safely provable because of dynamic lookup, external use, conditional compilation, or similar ambiguity

Never invent a third category. When in doubt, use `UNKNOWN`.

### Stage 1 — Scope first
Start with the smallest reasonable scope. Do not jump to whole-repo analysis unless the user asked for it or the narrower scope is insufficient.

- If the user named a file, class, function, directory, or module, analyze that first.
- If no scope was given and clarification would materially change the result, ask one short question.
- Otherwise, begin with the most relevant subdirectory rather than the whole repository.

Detect the language for the current scope only:

```bash
# Go
ls go.mod go.sum 2>/dev/null

# Rust
ls Cargo.toml Cargo.lock 2>/dev/null

# Python
ls setup.py pyproject.toml requirements.txt 2>/dev/null

# C/C++
fd -e c -e cc -e cpp -e cxx -e h -e hh -e hpp . <scope> | head -5
```

Infer `library_mode` conservatively:

- Go: `package main` + `func main()` → `library_mode=no`; otherwise `yes`
- Rust: `src/main.rs` present → `no`; `[lib]` without `[[bin]]` → `yes`; both → `yes`
- Python: `console_scripts` entry → `no`; package-only layout → `yes`
- C/C++: `main()` present → `no`; `add_library(` without `add_executable(` → `yes`; both → `yes`

Decide exclusions before running tools:

- Always exclude vendor, generated, build output, and cache directories.
- Add project-specific exclusions only when obvious from layout or user input.

Emit a short setup summary at the end of Stage 1:

```text
Scope: <path or symbol set>
Language: <language>
library_mode: <yes|no>
Excluded: <comma-separated paths>
```

Do not read language reference files during Stage 1.

### Stage 2 — Analyze one language
Analyze one language at a time for the scope chosen in Stage 1. Now open only the matching reference file (which contains both code-path checklists and the tool-backed unused-code section):

- `references/python.md`
- `references/javascript_typescript.md`
- `references/go.md`
- `references/c_cpp.md`
- `references/java_kotlin.md`
- `references/rust.md`
- `references/shell_bash.md`

Do not load unrelated reference files.

### Primary tools

| Language | Primary tool | Fallback |
|----------|--------------|---------|
| Go | `deadcode` | targeted search only |
| Rust | `cargo +nightly udeps` + compiler `dead_code` warnings | `cargo check` warnings |
| Python | `vulture` | targeted search only |
| C/C++ | `cppcheck --enable=unusedFunction` | compiler `-Wunused` hints |

If the primary tool is missing, report the install command to the user and stop unless a narrower manual review is still useful.

### Classification rules

Before marking a symbol `UNUSED`, reject that label if any of these apply:

- The symbol name appears in string-based lookup or reflection paths.
- The symbol is referenced from config, build, registration, or generated code.
- The file is behind build tags, feature flags, or conditional compilation.
- The symbol is public/exported and `library_mode=yes`.
- The symbol is a virtual override, trait impl member, interface implementation, framework hook, callback, FFI export, or plugin entry.
- The tool output is only suggestive and not conclusive.

If any condition matches, use `UNKNOWN`. Do not report symbols that are clearly used.

### Output for detection mode

Default output is a short summary, not a file.

```text
UNUSED: <count>
UNKNOWN: <count>
Top candidates:
- <symbol> — <reason>
- <symbol> — <reason>
```

Keep the default report small. Prefer the most actionable items first.

Write `unused_code_report.json` only if the user asks for a saved report or explicitly agrees after seeing the summary. When requested:

- write at repository root as `unused_code_report.json`
- use only `UNUSED` and `UNKNOWN`
- keep file paths relative to repo root
- never fabricate line numbers
- sort by `file`, then `line`

### What not to do

- Do not analyze the entire repository by default when the request is narrower.
- Do not read every reference file up front.
- Do not treat public/exported symbols as `UNUSED` in library mode.
- Do not treat conditional or generated code as strong evidence of dead code.
- Do not produce a large JSON report unless the user asked for it.

## Output format
Return a structured report in this order:

1. **Target resolved**
   - exact symbol / file / line range

2. **Reachability summary**
   - reachable / likely reachable / uncertain / likely dead

3. **Call paths**
   - one bullet per path, from entry point toward target

4. **Execution conditions**
   - grouped by path

5. **Scenario list**
   - entry point
   - triggering input / state / config
   - why it reaches the target
   - confidence: high / medium / low

6. **Dead-code assessment**
   - evidence for and against

7. **Unknowns / limits**
   - dynamic dispatch, reflection, generated code, external systems

## Reporting style
- Be precise and compact.
- Prefer concrete symbol names and file paths.
- Quote exact conditions when useful.
- Distinguish facts from inference.
- Do not overstate certainty.

## Optional tool usage inside the repo
Prefer repository-local tools when available:
- fast text search
- symbol/reference lookup
- AST-aware tools
- language server outputs
- ctags / call hierarchy tools
- build-tag / macro inspection tools

## Good default heuristic
When multiple partial paths exist:
- rank paths with explicit entry points higher
- rank direct calls higher than inferred dispatch
- rank framework registration higher than string-based lookup
- downgrade confidence when the last mile depends on reflection, plugin loading, or generated code
