---
name: lang-rust
description: Panic-defense and memory-safety-first Rust skill for writing, reviewing, and debugging Rust code. Prioritises eliminating runtime panics (indexing, arithmetic overflow, unwrap/expect, RefCell conflicts) and undefined behavior above all else, then covers idiomatic ownership/borrowing/lifetimes, trait design, async with tokio, error handling, testing, idioms, anti-patterns, design patterns, and functional techniques. Use when building Rust applications, hardening code against panics, auditing for memory safety, solving ownership or borrowing issues, designing trait-based APIs, implementing async/await concurrency, creating FFI bindings, or when the user asks about Rust idioms, patterns, anti-patterns, or functional programming. Invoke for Rust, Cargo, panic safety, memory safety, ownership, borrowing, lifetimes, traits, generics, async Rust, tokio, FFI, unsafe, zero-cost abstractions, systems programming.
---

# Rust

Senior Rust expert covering Rust 2024 edition. **Safety comes first**: this skill treats panic defense and memory safety as the non-negotiable baseline, then builds reliable, high-performance software on top of Rust's ownership system, type system, and zero-cost abstractions.

## ⚠️ Safety-First Mandate (non-negotiable)

Before writing, modifying, or reviewing ANY Rust code, you MUST:

1. **Load `references/safe-rust.md` first** and apply its checklist to the work at hand.
2. **Scan every fallible path** for panic sources — indexing/slicing, bare arithmetic, `unwrap`/`expect`, `as` casts, division, `RefCell` borrows, lock guards, `unsafe`.
3. **Resolve conflicts in favour of safety.** When panic/memory safety conflicts with idiom, brevity, or performance, safety wins.

The only exception is when the user has explicitly authorised a less-safe construct (e.g. `unwrap()` in a throwaway script). Note the trade-off when you do.

## Always load first

| Topic | File | Why |
|-------|------|-----|
| **Safe Rust** | `references/safe-rust.md` | Panic avoidance, integer overflow, safe indexing, unsafe isolation, concurrency safety, CI tooling, safety review checklist. **Read before any code work.** |

## Core Workflow

1. **Identify panic paths & design for safety** — Scan for indexing, bare arithmetic, `unwrap`/`expect`, `as` casts, division, `RefCell`/lock usage, and `unsafe`; plan safe alternatives (`.get()`, `checked_*`, `?`, `TryFrom`) before writing
2. **Analyze ownership** — Design lifetime relationships and borrowing patterns; annotate lifetimes explicitly where inference is insufficient
3. **Design traits** — Create trait hierarchies with generics and associated types
4. **Implement safely** — Write idiomatic Rust with minimal `unsafe`; document every `unsafe` block with its safety invariants
5. **Handle errors** — Use `Result`/`Option` with `?` operator and custom error types via `thiserror` (libs) / `anyhow` (apps)
6. **Validate** — Run `cargo clippy --all-targets --all-features -- -D warnings`, `cargo fmt --check`, `cargo test`, and `cargo miri test` where applicable; fix all warnings before finalising

## Reference Guide

Load detailed guidance based on the topic at hand (`safe-rust.md` is always loaded first — see above):

### Implementation references

| Topic | File | Load when |
|-------|------|-----------|
| Ownership | `references/ownership.md` | Lifetimes, borrowing, smart pointers, `Pin` |
| Traits | `references/traits.md` | Trait design, generics, associated types, derive |
| Error Handling | `references/error-handling.md` | `Result`, `Option`, `?`, custom errors, `thiserror` |
| Async | `references/async.md` | `async`/`await`, tokio, futures, streams, concurrency |
| Testing | `references/testing.md` | Unit/integration tests, proptest, benchmarks |

### Conceptual references

| Topic | File | Load when |
|-------|------|-----------|
| Glossary | `references/glossary.md` | Defining ownership, borrowing, lifetime, trait, RAII, FFI |
| Principles | `references/principles.md` | KISS, YAGNI, DRY, composition over inheritance, encapsulating unsafety |
| Idioms | `references/idioms.md` | Borrowed types, `Default`, destructors, `mem::take`, on-stack dynamic dispatch, FFI idioms |
| Anti-Patterns | `references/anti-patterns.md` | `clone()` overuse, `#![deny(warnings)]`, deref polymorphism |
| Design Patterns | `references/design-patterns.md` | Behavioural, creational, structural, FFI patterns |
| Functional | `references/functional.md` | Generics as type classes, optics, paradigm trade-offs |

## Constraints

### MUST DO — P0 (panic & memory safety, non-negotiable)
- Use `.get()` / `.get_mut()` instead of `[i]` indexing and `&v[a..b]` slicing
- Use explicit arithmetic (`checked_*` / `saturating_*` / `wrapping_*` / `overflowing_*`) instead of bare `+ - * / %` on untrusted or unbounded values
- Propagate errors with `?`; return `Result`/`Option` — never `unwrap()`/`expect()` in production code
- Convert integers with `TryFrom` / `try_into`, never `as` (which silently truncates)
- No production `panic!` / `todo!` / `unimplemented!` / `unreachable!` on live paths
- Minimise `unsafe`; apply `#![forbid(unsafe_code)]` where feasible and document every remaining `unsafe` block with a `// SAFETY:` invariant
- Never hold a lock guard across `.await`; decide an explicit policy for lock poisoning
- Never create memory leaks or dangling pointers

### MUST DO — P1 (correctness & quality)
- Use the type system for compile-time guarantees; encode invariants so illegal states are unrepresentable (newtype, enum state machines, `NonZero*`)
- Handle all errors explicitly (`Result`/`Option`); never swallow with bare `let _ =`
- Add documentation with examples
- Run `cargo clippy -- -D warnings` and fix every warning
- Enable panic-catching lints: `clippy::unwrap_used`, `expect_used`, `indexing_slicing`, `arithmetic_side_effects`, `panic`, `todo`, `unimplemented`
- Use `cargo fmt` for consistent formatting
- Write tests including doctests

### MUST NOT DO
- Use `unwrap()` or `expect()` in production code
- Index/slice with `[]` on values that could be out of range
- Use bare arithmetic where overflow or divide-by-zero is possible
- Use `as` casts that can truncate (use `try_into`)
- Use `unsafe` without documenting safety invariants
- Ignore clippy warnings
- Mix blocking and async code incorrectly; hold locks across `.await`
- Skip error handling or swallow errors silently
- Use `String` when `&str` suffices; clone unnecessarily (use borrowing)

## Output Templates

When implementing Rust features, provide:
1. Type definitions (structs, enums, traits) that encode invariants
2. Implementation with panic-safe operations and proper ownership
3. Error handling with custom error types (`thiserror`/`anyhow`)
4. Tests (unit, integration, doctests) covering boundary/failure cases
5. Brief explanation of design decisions, calling out any residual panic risk

## Knowledge Reference

Rust 2024, Cargo, panic avoidance, integer overflow safety, safe indexing, safety review checklist, ownership/borrowing, lifetimes, traits, generics, async/await, tokio, `Result`/`Option`, `thiserror`/`anyhow`, serde, clippy, rustfmt, cargo-test, criterion benchmarks, MIRI, unsafe Rust, FFI, idioms, design patterns, anti-patterns, functional programming
