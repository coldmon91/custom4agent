---
name: analysis-code-path
description: >
  Use when the user asks when a line, function, method, or class can execute in the current project,
  who calls it, what input, config, or flag triggers it, or whether code is dead or unused
  ("when is X executed", "trace callers", "find unused code", "dead code analysis",
  "what can I delete", "which functions are never called"). Covers Python, JavaScript/TypeScript,
  Go, C/C++, Java/Kotlin, Rust, and Shell. Not for cross-repo, production telemetry, or
  external-system behavior.
---

# Code Path Analyzer

Static, project-internal analysis with two modes:
- **Reachability**: how one target is reached, under which conditions, and whether it is dead.
- **Unused detection**: tool-backed search for unused symbols across a scope.

## Rules
- Scope is the current repository. When a value's origin leaves the repo, say so.
- Separate observed evidence from inference, and mark unknowns.
- Stay conservative: keep plausible paths, and never call a path impossible without strong in-repo evidence.
- State it when tests are the only callers.
- Detect the language first, then open only its reference file below. For a cross-language target, open each relevant one.

| Language | Reference | Unused-code tool |
|----------|-----------|------------------|
| Python | `references/python.md` | `vulture` |
| JavaScript / TypeScript | `references/javascript_typescript.md` | targeted search |
| Go | `references/go.md` | `deadcode` |
| C / C++ | `references/c_cpp.md` | `cppcheck --enable=unusedFunction` + `-Wunused` |
| Java / Kotlin | `references/java_kotlin.md` | targeted search |
| Rust | `references/rust.md` | compiler `dead_code` / `unused_*` lints |
| Shell / Bash | `references/shell_bash.md` | targeted search |

## Mode 1: Reachability

1. **Resolve the target**: exact symbol and line range. For a line number, find the enclosing symbol. If ambiguous, list every plausible target.
2. **Collect references**: `rg -n '<symbol>'` in the repo, then open the hits to confirm callers, registrations, overrides and implementations, and dynamic dispatch (patterns in the reference file).
3. **Trace to entry points**: follow each caller chain up to a project-local entry point such as `main`, a CLI command, an HTTP/RPC route, a worker or consumer, a scheduler, a signal handler, a framework hook, or a test. With no entry point, mark the path partial. A test-only path is reported, but it does not make the target live.
4. **Extract conditions**: branches, guards, config / env / feature flags, auth gates, and error branches. Separate compile-time gates (fixed per build) from runtime gates (vary per run). For key predicates, trace the value's origin (CLI arg, request, config file, env var, DB, queue message).
5. **Judge**: give each path a confidence and the target a dead-code verdict.

Cross-language notes:
- An error-only branch is reachable only when its failure source is explained. `finally` / `defer` run on every exit.
- For async, callback, and scheduled paths, state the trigger and time window; registration timing is outside static analysis.
- A flag that can change while the system runs makes timing uncertain. State any framework-version assumption.

### Confidence
- **High**: explicit entry point and a direct call chain.
- **Medium**: one or more hops through framework registration or interface / trait / virtual dispatch.
- **Low**: the last hop depends on reflection, string-keyed dispatch, plugin loading, generated code, or macros.

### Dead-code verdict
- **Likely dead** only with strong evidence: no references, no path from any entry point, a guard disabled everywhere in the repo (e.g. `#ifdef NEVER_DEFINED`), or references only from tests, examples, or commented-out code.
- **Not dead, low-confidence reachable** when only dynamic registration, reflection, interface dispatch without a concrete caller, an async callback, a runtime flag, or a build tag could enable it.

### Output
Repeat this block for each target.
1. Target resolved: symbol / file / line range
2. Reachability: reachable (a confirmed path exists, even if gated) / likely reachable / uncertain / likely dead
3. Call paths: one line per path, entry point -> target
4. Conditions: per path, quoting exact predicates
5. Scenarios: entry point, triggering input / state / config, confidence
6. Dead-code assessment: evidence for and against
7. Unknowns / limits: dynamic dispatch, reflection, generated code, external systems

## Mode 2: Unused Code Detection

Use when asked for unused or dead symbols across a scope rather than one target.

### Classification
Each candidate is exactly one of:
- `UNUSED`: the tool or search confirms no use, and no rejection rule applies.
- `UNKNOWN`: removal cannot be proven safe.

When in doubt, use `UNKNOWN`. Do not report symbols that are clearly used.

### Steps
1. **Scope**: start with what the user named (file, directory, module); otherwise the most relevant subdirectory, not the whole repo. Ask one short question only when the scope would materially change the result.
2. **library_mode**: `no` only when the scope builds executables alone (Go `package main`, Rust `src/main.rs` without `[lib]`, Python `console_scripts`, C/C++ `add_executable` without `add_library`). Any library target, including lib + bin, means `yes`.
3. **Exclusions**: vendor, generated, build output, and cache directories.
4. **Run the tool** from the table as its reference file describes. If it is missing, report the install command and stop, unless a manual review of a small scope is still useful.
5. **Apply the rejection rules**, then report.

### Rejection rules: use `UNKNOWN` if any applies
- The name appears in string-based lookup or reflection.
- It is referenced from config, build files, registration, or generated code.
- It sits behind build tags, feature flags, or conditional compilation.
- It is public / exported and `library_mode=yes`.
- It is a virtual override, trait impl member, interface implementation, framework hook, callback, FFI export, or plugin entry.
- The tool output is only suggestive, not conclusive.

The reference file lists language-specific cases.

### Output
```text
Scope: <path>  Language: <language>  library_mode: <yes|no>  Excluded: <paths>
UNUSED: <count>
UNKNOWN: <count>
Top candidates:
- <symbol> (<file>:<line>): <reason>
```

Write `unused_code_report.json` at the repo root only when the user asks for it: `UNUSED` / `UNKNOWN` only, repo-relative paths, real line numbers, sorted by file then line.
