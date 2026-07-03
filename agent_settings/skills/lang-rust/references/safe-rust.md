# Safe Rust

Rules for writing Rust that resists panics, undefined behavior, and silent logic bugs. Apply these by default when producing or reviewing Rust code.

## Core principle

Removing `unwrap`/`expect` reduces panic risk but does **not** eliminate it. Safe Rust still panics via indexing, arithmetic overflow, division by zero, slicing, `RefCell` borrow conflicts, and explicit macros. Treat every fallible operation as something to be made explicit.

## 1. Panic avoidance

- **No indexing.** Use `v.get(i)` / `v.get_mut(i)` instead of `v[i]`. Use `v.get(a..b)` instead of `&v[a..b]`. Use `str::get` for string slices (char-boundary safe).
- **Explicit arithmetic.** Replace bare `+ - *` with intent-revealing methods:
  - `checked_*` → returns `Option`, for "must not overflow"
  - `saturating_*` → clamps at bounds
  - `wrapping_*` → intentional modular wraparound
  - `overflowing_*` → value plus a `bool` flag
- **Guard division.** Use `checked_div` / `checked_rem` before `/` or `%` when the divisor could be zero.
- **Propagate with `?`.** Reserve `unwrap`/`expect` for tests, prototypes, or provably-unreachable cases documented with a comment. Library code returns `Result`.
- **No production `panic!` / `todo!` / `unimplemented!` / `unreachable!`** on live paths. If truly unreachable, justify it in a comment.
- **Watch collection methods** that panic on bad indices: `Vec::remove`, `insert`, `drain`, `split_off`, `swap`, etc. — validate the index first.

## 2. Error handling

- **Split by crate role:** libraries define explicit error enums with `thiserror`; applications use `anyhow` to add context and propagate.
- **`Option` vs `Result`:** `Option` = "no value"; `Result` = "failed, and here's why."
- **Never silently swallow errors.** Avoid `let _ = fallible();` without a reason. Log or handle.
- **Convert integers with `TryFrom` / `try_into`,** not `as` (which silently truncates).
- **"Parse, don't validate":** convert untrusted input into a validated type once, at the boundary, then trust the type.

## 3. Encode invariants in types (make illegal states unrepresentable)

- Use **enum state machines** so invalid state combinations don't compile.
- Use the **newtype pattern** (`struct UserId(u64)`) to prevent mixing semantically different primitives.
- **Validate at construction** via `TryFrom` or a smart constructor `fn new(...) -> Result<Self, _>`; after that, the value is always valid.
- Reach for standard constrained types: `NonZeroU32`, `NonNull`, etc.

## 4. Concurrency safety

- Prefer **message passing** (channels) over shared mutable state. When sharing is needed, use `Arc<Mutex<T>>` / `Arc<RwLock<T>>`.
- Keep **lock scopes minimal**; never hold a lock guard across an `.await` in async code (deadlock / `Send` issues).
- Handle **poisoning**: don't blindly `unwrap()` a `lock()` result — decide a policy.
- Prevent **deadlocks** by acquiring locks in a globally consistent order.
- Understand `Send` / `Sync`; avoid `unsafe impl` unless the invariant is proven.

## 5. Minimize and isolate `unsafe`

- Apply `#![forbid(unsafe_code)]` to crates that don't need it.
- If `unsafe` is unavoidable, isolate it in a small module and document each block with a `// SAFETY:` comment stating the upheld invariant.
- Wrap FFI boundaries in thin safe wrappers.

## 6. Ownership and lifetimes

- Prefer references over reflexive `.clone()`, but accept cloning when lifetime complexity outweighs the cost.
- Avoid `Rc<RefCell<T>>` sprawl — it moves borrow checking to runtime (panic risk). Use `try_borrow` when unsure.
- Avoid self-referential structs; use `Pin` or an index-based arena when needed.

## 7. Resource management

- Rely on RAII / `Drop` for cleanup rather than manual release.
- Errors that can occur during teardown (e.g. `flush` failure) must be handled explicitly **before** drop, since `Drop` cannot return errors.

## 8. Enforce with tooling

Add to the crate root:

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

Run in CI:

- `cargo clippy -- -D warnings` (warnings become errors)
- `cargo fmt --check`
- `cargo test`
- `cargo miri test` (detects undefined behavior)
- `cargo audit` / `cargo deny` (dependency vulnerabilities, licenses)
- `cargo fuzz` for parsers and any code handling untrusted binary input

## Priority order

When time is limited, the highest-leverage changes are:

1. Replace indexing and bare arithmetic with safe APIs (`.get()`, `checked_*`).
2. Adopt `?`-based propagation with `thiserror` (libs) / `anyhow` (apps).
3. Encode invariants in types so bad states can't be constructed.

Then enforce all of the above as CI errors via clippy so the rules stay applied across the whole codebase.

## Review checklist

When reviewing Rust, scan for:

- [ ] `[i]` indexing or `[a..b]` slicing on possibly-out-of-range values
- [ ] Bare `+ - * / %` on untrusted or unbounded values
- [ ] `unwrap` / `expect` outside tests
- [ ] `as` casts that can truncate (use `try_into`)
- [ ] Errors dropped via `let _ =` or ignored `Result`
- [ ] Lock guards held across `.await` or in nested lock acquisition
- [ ] `unsafe` blocks lacking `// SAFETY:` justification
- [ ] `RefCell` borrows that could conflict at runtime
- [ ] Cleanup logic relegated to `Drop` that can fail silently
