# Error Handling in Rust

## Model

- `Result<T, E>` for recoverable failure; `Option<T>` for "value may be absent" (no error reason). `panic!` only for unrecoverable bugs/violated invariants, never for expected failure.
- Propagate with `?` — it applies `From::from` to the error, so it converts into the function's error type automatically. Prefer `?` over `match`+early-return.
- Directive (user pref): no `unwrap`/`expect` on live paths. In tests/prototypes/provably-unreachable cases, use `expect("why this can't fail")` with a reason, not bare `unwrap`.
- Convert `Option`↔`Result` at boundaries: `opt.ok_or(err)?` / `opt.ok_or_else(|| ...)?`; `res.ok()` to discard the error.

## Library vs application (the key decision)

- **Libraries → `thiserror`:** define an explicit, exhaustive error enum so callers can match on variants. Derive `#[derive(thiserror::Error, Debug)]`; each variant gets `#[error("...")]` (Display) and optionally `#[from]` for auto-conversion:
  ```rust
  #[derive(thiserror::Error, Debug)]
  enum DataError {
      #[error("not found: {0}")]
      NotFound(String),
      #[error("io error")]
      Io(#[from] std::io::Error),      // enables `?` on io::Error
      #[error("bad id {id}: {reason}")]
      InvalidId { id: u64, reason: String },
  }
  ```
  `#[from]` generates the `From` impl so `?` converts source errors for you; use `#[source]` to keep a cause without auto-conversion.
- **Applications / binaries → `anyhow`:** `anyhow::Result<T>` erases the concrete type and accumulates context. Use `.context("...")` / `.with_context(|| ...)` to annotate the failure site, `bail!("...")` for early return, `ensure!(cond, "...")` for guard checks.
- Don't expose `anyhow::Error` from a library's public API (callers can't match it); don't hand-roll enums in a binary where `anyhow` context suffices.

## Manual From impls

- When not using `thiserror`, implement `impl From<SourceErr> for MyErr` yourself to make `?` convert. `thiserror`'s `#[from]` replaces this boilerplate.

## Combinators (use over match for one-liners)

- `Option`: `map`, `and_then` (chain fallible), `filter`, `or`/`or_else`, `unwrap_or`/`unwrap_or_else` (lazy default), `ok_or`.
- `Result`: `map`, `map_err` (adapt error type), `and_then`, `or_else`. Use pattern `match`/`if let` when branches do real work, combinators when transforming.

## Avoid

- `String` (or `Box<dyn Error>` in libraries) as the error type — unstructured, callers can't match. `Box<dyn Error>` is acceptable in a quick binary/`main`.
- Silently swallowing: `let _ = fallible();` without a documented reason. Log or handle at boundaries.
- `try` blocks and `Backtrace`-in-struct patterns are nightly/unstable — don't depend on them for production.

## Best practices

- Add context as errors propagate up; log at the boundary, return errors from library code.
- Implement `std::error::Error` for custom types (thiserror does this) so they compose with the ecosystem.
- Document the error conditions of fallible public functions.
