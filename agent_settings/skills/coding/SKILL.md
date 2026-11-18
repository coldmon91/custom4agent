---
name: coding
description: Read when writing, modifying, reviewing, debugging, or explaining code - including edits, refactoring, and bug fixes - in any language. Trigger whenever you are about to add, change, or delete source code, even for a small one-line edit. Covers socket programming, multi-threading, and language guides for C++ (`.cpp`, `.h`, CMake), Go (`.go`, `go.mod`), Rust (`.rs`, `Cargo.toml`), Swift (`.swift`), and Python (`.py`, `pyproject.toml`, uv/ruff/ty setup, pip/Poetry migration).
---

# Coding Rules

## Language Guides

Read the matching guide before editing, reviewing, or explaining code, alongside these rules.
Each guide links its own deeper references.

- C++ (`.cpp`, `.cc`, `.cxx`, `.h`, `.hpp`, CMake) -> `references/cpp/overview.md`
- Go (`.go`, `go.mod`) -> `references/go/overview.md`
- Rust (`.rs`, `Cargo.toml`) -> `references/rust/overview.md`
- Swift (`.swift`, Swift package) -> `references/swift/overview.md`
- Python (`.py`, `pyproject.toml`, uv/ruff/ty setup) -> `references/python/overview.md`

## Before Modifying Code

- Discovery of every caller/reference before edit.
- Impact review per call site: signature, return, error contract, side effects, thread-safety, performance.
- Public API: compatibility report and approval first.
- Update of all call sites in the same change; no partial migration.

## Naming and Commenting

- Name functions and variables so the intent is visible in the name itself.
- If the name alone cannot convey the intent, supplement it with a comment.
- If the name already conveys the intent, add no explanatory comment for it.
- State the next tasks when work remains.

## Socket Programming

- Fragmented arrival of TCP/TLS/UDP reads (e.g. 1000 bytes sent as 500+500).
- Length-prefixed header: header read first, then body read per its length.

## Multi-Thread Programming

- Shared mutable state belongs in a lock-owning wrapper, so unlocked access cannot compile —
  not a bare member plus a separate mutex, which relies on the editor noticing the pairing.
- Never infer thread-safety from a name, or from a declaration you have not actually resolved.
  With deep inheritance, typedef chains, or heavy templates, tracing the type is unreliable —
  make the compiler or a sanitizer answer instead.
- C++ -> `references/cpp/references/concurrency.md`; Go -> `references/go/references/concurrency.md`;
  Rust -> `references/rust/overview.md` (Concurrency), `references/rust/references/async.md` (Shared state);
  Swift -> `references/swift/references/async-concurrency.md`
