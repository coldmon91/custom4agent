---
name: lang-rust
description: Use whenever writing, modifying, reviewing, or debugging Rust code — any `.rs` file, `Cargo.toml`, or Cargo workspace — even for a one-line edit, and when the user asks about Rust idioms or anti-patterns. Covers panic defense (indexing, arithmetic overflow, unwrap/expect, as casts, RefCell conflicts), memory safety and undefined behavior, ownership, borrowing, lifetimes, trait-based API design, generics, async with tokio, error handling, testing, FFI, and unsafe. Keywords - Rust, Cargo, rustc, clippy, panic safety, borrow checker, systems programming.
---

# Rust

Rust 2024 edition. **Panic and memory safety come first**: when safety conflicts with idiom, brevity, or performance, safety wins.
The only exception is a less-safe construct the user explicitly authorised (e.g. `unwrap()` in a throwaway script) — note the trade-off when you use it.

Removing `unwrap`/`expect` does not eliminate panics. Safe Rust still panics via indexing, slicing, overflow, division by zero, `RefCell` conflicts, and explicit macros.

## Safety rules (production code)

**Panic avoidance**
- `v.get(i)` / `v.get(a..b)` / `str::get` instead of `v[i]` / `&v[a..b]` on possibly-out-of-range values
- `checked_*` / `saturating_*` / `wrapping_*` / `overflowing_*` instead of bare `+ - * / %` on untrusted or unbounded values; guard divisors with `checked_div` / `checked_rem`
- `?` with `Result`/`Option` — no `unwrap`/`expect` outside tests (see `references/error-handling.md`)
- `TryFrom` / `try_into` instead of `as` for narrowing conversions (`as` silently truncates)
- No `panic!` / `todo!` / `unimplemented!` / `unreachable!` on live paths; a truly unreachable arm gets a justifying comment
- Validate indices before `Vec::remove` / `insert` / `drain` / `split_off` / `swap`
- `RefCell::try_borrow` when a conflict is possible; avoid `Rc<RefCell<T>>` sprawl

**Invariants in types**
- Parse, don't validate: convert untrusted input into a validated type once, at the boundary
- Newtype (`struct UserId(u64)`), enum state machines, `NonZero*` so illegal states don't compile
- Smart constructor `fn new(..) -> Result<Self, _>` or `TryFrom` for validated types

**Concurrency**
- Prefer channels over shared state; otherwise `Arc<Mutex<T>>` / `Arc<RwLock<T>>` with minimal lock scope
- Never hold a lock guard across `.await`
- Decide an explicit poisoning policy — never blindly `lock().unwrap()`
- Acquire multiple locks in a globally consistent order
- No `unsafe impl Send/Sync` without a proven invariant

**`unsafe` and FFI**
- `#![forbid(unsafe_code)]` on crates that don't need it
- Isolate unavoidable `unsafe` in a small module behind a safe API; every block gets a `// SAFETY:` comment stating the upheld invariant
- FFI boundary: never let a panic unwind across it; pass only primitives, pointers, `#[repr(C)]` structs, or opaque handles; strings as pointer + length; memory is freed by the side that allocated it
- Wrap foreign handles in an owning Rust type whose `Drop` frees them

**Resources**
- Cleanup via RAII / `Drop`; teardown that can fail (e.g. `flush`) goes in an explicit method called before drop, since `Drop` cannot return errors

## Tooling

Crate root:

```rust
#![warn(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::arithmetic_side_effects,
    clippy::panic,
    clippy::todo,
    clippy::unimplemented,
)]
#![forbid(unsafe_code)] // where feasible
```

Don't put `#![deny(warnings)]` in the crate (new compiler versions break the build); fail on warnings in CI instead.

Validate before finishing:
- `cargo fmt --check` (follow the repo's `rustfmt.toml`)
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test`
- `cargo miri test` when `unsafe` is involved
- `cargo audit` / `cargo deny` for dependencies; `cargo fuzz` for parsers of untrusted input

## Review checklist

- [ ] `[i]` indexing or `[a..b]` slicing on possibly-out-of-range values
- [ ] Bare `+ - * / %` on untrusted or unbounded values
- [ ] `unwrap` / `expect` outside tests
- [ ] Truncating `as` casts
- [ ] Errors dropped via `let _ =` or an ignored `Result`
- [ ] Lock guards held across `.await` or nested lock acquisition
- [ ] `unsafe` blocks without `// SAFETY:`
- [ ] `RefCell` borrows that could conflict at runtime
- [ ] Fallible cleanup hidden in `Drop`

## References

| Topic | File | Load when |
|-------|------|-----------|
| Ownership | `references/ownership.md` | Lifetimes, borrowing, clone vs borrow, smart pointers, self-referential types |
| Traits | `references/traits.md` | Trait design, generics vs `dyn`, object safety, orphan rule, derive |
| Error Handling | `references/error-handling.md` | `Result`/`Option`, `?`, `thiserror` vs `anyhow` |
| Async | `references/async.md` | tokio, `spawn`, `select!`, channels, cancellation, async traits |
| Testing | `references/testing.md` | Unit/doc/integration tests, proptest, mockall, criterion |
