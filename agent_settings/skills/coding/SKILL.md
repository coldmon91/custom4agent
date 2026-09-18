---
name: coding
description: Read when writing OR modifying code - including edits, refactoring, bug fixes, and reviews - for socket programming, multi-threading, or any other programming task. Trigger whenever you are about to add, change, or delete source code, even for a small one-line edit.
---

# Coding Rules

## Before Modifying Code

- Discovery of every caller/reference before edit.
- Impact review per call site: signature, return, error contract, side effects, thread-safety, performance.
- Public API: compatibility report and approval first.
- Update of all call sites in the same change; no partial migration.

## Socket Programming

- Fragmented arrival of TCP/TLS/UDP reads (e.g. 1000 bytes sent as 500+500).
- Length-prefixed header: header read first, then body read per its length.

## Multi-Thread Programming

- Shared mutable state belongs in a lock-owning wrapper, so unlocked access cannot compile —
  not a bare member plus a separate mutex, which relies on the editor noticing the pairing.
- Never infer thread-safety from a name, or from a declaration you have not actually resolved.
  With deep inheritance, typedef chains, or heavy templates, tracing the type is unreliable —
  make the compiler or a sanitizer answer instead.
- C++ -> `lang-cpp/references/concurrency.md`; Go -> `lang-go/references/concurrency.md`
