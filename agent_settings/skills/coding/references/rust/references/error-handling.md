# Error Handling in Rust

## Model

- `Result<T, E>` = failed, and here's why; `Option<T>` = value may be absent. `panic!` only for violated invariants, never for expected failure.
- `?` applies `From::from`, so it converts into the function's error type automatically.
- No `unwrap`/`expect` on live paths. In tests or provably-unreachable cases, use `expect("why this can't fail")` rather than bare `unwrap`.
- `Option` → `Result` at boundaries: `opt.ok_or(err)?` / `opt.ok_or_else(|| ..)?`.

## Library vs application

- **Libraries → `thiserror`:** an explicit enum callers can match on. `#[from]` generates the `From` impl so `?` converts source errors; `#[source]` keeps a cause without auto-conversion.
  ```rust
  #[derive(thiserror::Error, Debug)]
  enum DataError {
      #[error("not found: {0}")]
      NotFound(String),
      #[error("io error")]
      Io(#[from] std::io::Error),
      #[error("bad id {id}: {reason}")]
      InvalidId { id: u64, reason: String },
  }
  ```
- **Applications → `anyhow`:** `anyhow::Result<T>` plus `.context("..")` / `.with_context(|| ..)` at each failure site, `bail!` for early return, `ensure!` for guards.
- Never expose `anyhow::Error` or `Box<dyn Error>` from a library's public API (callers can't match it). `Box<dyn Error>` is acceptable only in a quick binary's `main`.

## Avoid

- `String` as an error type — unstructured, unmatchable.
- `let _ = fallible();` without a documented reason. Log or handle at the boundary; library code returns errors instead of logging.
- Nightly-only `try` blocks.
