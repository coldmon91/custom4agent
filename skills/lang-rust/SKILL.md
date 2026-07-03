---
name: lang-rust
description: Comprehensive Rust skill for writing, reviewing, and debugging idiomatic Rust code. Covers ownership/borrowing/lifetimes, trait design, async with tokio, error handling, testing, idioms, anti-patterns, design patterns, and functional techniques. Use when building Rust applications, solving ownership or borrowing issues, designing trait-based APIs, implementing async/await concurrency, creating FFI bindings, optimising for performance, or when the user asks about Rust idioms, patterns, anti-patterns, or functional programming in Rust. Invoke for Rust, Cargo, ownership, borrowing, lifetimes, traits, generics, async Rust, tokio, FFI, zero-cost abstractions, memory safety, systems programming.
---

# Rust

Senior Rust expert covering Rust 2024 edition. Specialises in building reliable, high-performance software using Rust's ownership system, type system, and zero-cost abstractions.

## Core Workflow

1. **Analyze ownership** — Design lifetime relationships and borrowing patterns; annotate lifetimes explicitly where inference is insufficient
2. **Design traits** — Create trait hierarchies with generics and associated types
3. **Implement safely** — Write idiomatic Rust with minimal `unsafe`; document every `unsafe` block with its safety invariants
4. **Handle errors** — Use `Result`/`Option` with `?` operator and custom error types via `thiserror`
5. **Validate** — Run `cargo clippy --all-targets --all-features`, `cargo fmt --check`, and `cargo test`; fix all warnings before finalising

## Reference Guide

Load detailed guidance based on the topic at hand:

### Implementation references

| Topic | File | Load when |
|-------|------|-----------|
| Ownership | `references/ownership.md` | Lifetimes, borrowing, smart pointers, `Pin` |
| Traits | `references/traits.md` | Trait design, generics, associated types, derive |
| Error Handling | `references/error-handling.md` | `Result`, `Option`, `?`, custom errors, `thiserror` |
| Async | `references/async.md` | `async`/`await`, tokio, futures, streams, concurrency |
| Testing | `references/testing.md` | Unit/integration tests, proptest, benchmarks |
| Safe Rust | `references/safe-rust.md` | Panic avoidance, integer overflow, safe indexing, unsafe isolation, safety review checklist |

### Conceptual references

| Topic | File | Load when |
|-------|------|-----------|
| Glossary | `references/glossary.md` | Defining ownership, borrowing, lifetime, trait, RAII, FFI |
| Principles | `references/principles.md` | KISS, YAGNI, DRY, composition over inheritance, encapsulating unsafety |
| Idioms | `references/idioms.md` | Borrowed types, `Default`, destructors, `mem::take`, on-stack dynamic dispatch, FFI idioms |
| Anti-Patterns | `references/anti-patterns.md` | `clone()` overuse, `#![deny(warnings)]`, deref polymorphism |
| Design Patterns | `references/design-patterns.md` | Behavioural, creational, structural, FFI patterns |
| Functional | `references/functional.md` | Generics as type classes, optics, paradigm trade-offs |
| Safe Rust | `references/safe-rust.md` | Panic avoidance, integer overflow, safe indexing, unsafe isolation, safety review checklist |

## Constraints

### MUST DO
- Use ownership and borrowing for memory safety
- Minimise `unsafe` code (document all `unsafe` blocks with safety invariants)
- Use type system for compile-time guarantees
- Handle all errors explicitly (`Result`/`Option`)
- Add documentation with examples
- Run `cargo clippy` and fix all warnings
- Use `cargo fmt` for consistent formatting
- Write tests including doctests

### MUST NOT DO
- Use `unwrap()` or `expect()` in production code
- Create memory leaks or dangling pointers
- Use `unsafe` without documenting safety invariants
- Ignore clippy warnings
- Mix blocking and async code incorrectly
- Skip error handling
- Use `String` when `&str` suffices
- Clone unnecessarily (use borrowing)

## Output Templates

When implementing Rust features, provide:
1. Type definitions (structs, enums, traits)
2. Implementation with proper ownership
3. Error handling with custom error types
4. Tests (unit, integration, doctests)
5. Brief explanation of design decisions

## Knowledge Reference

Rust 2024, Cargo, ownership/borrowing, lifetimes, traits, generics, async/await, tokio, `Result`/`Option`, `thiserror`/`anyhow`, serde, clippy, rustfmt, cargo-test, criterion benchmarks, MIRI, unsafe Rust, FFI, idioms, design patterns, anti-patterns, functional programming, panic avoidance, integer overflow safety, safe indexing, safety review checklist
