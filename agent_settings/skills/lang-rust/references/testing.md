# Testing in Rust

## Unit and doc tests

- Colocate unit tests in `#[cfg(test)] mod tests { use super::*; }` — the only place that can reach private items.
- Test fns may return `Result<(), E>` to use `?` instead of `unwrap`.
- `#[should_panic(expected = "substr")]` — keep `expected` specific or it hides the wrong panic.
- Prefer `assert_eq!` over `assert!(a == b)` — it prints both values on failure.
- Doctests run against the **public** API only. Fences: `should_panic`, `no_run`, `compile_fail`, `ignore`, `text`; hide setup lines with a leading `# `.

## Integration tests

- Each file in `tests/` is a separate crate using only the public API.
- Shared helpers go in `tests/common/mod.rs` (not `tests/common.rs`, which would become its own test crate).

## Async tests

- `#[tokio::test]`; add `flavor = "multi_thread", worker_threads = 2` when real parallelism is needed.
- Wrap slow awaits in `tokio::time::timeout` so a hang fails instead of stalling CI.

## Tools

- **proptest** — for properties (round-trips, invariants) of parsers, serializers, pure algorithms; shrinks to a minimal counterexample. Not worth it for I/O-bound logic.
- **mockall** — `#[automock]` on a boundary trait; don't mock what you can construct cheaply for real.
- **criterion** — over nightly `#[bench]`. Declare `[[bench]] harness = false`; wrap inputs/outputs in `black_box`; `iter_batched` when each iteration needs fresh state.
- **insta** — snapshot large/structured output; review with `cargo insta review`.
- Coverage: `cargo llvm-cov --html`. Fuzzing: `cargo fuzz run <target>` with `fuzz_target!(|data: &[u8]| ..)`.

## Practices

- Cover empty, boundary, and max values.
- Tests run in parallel by default — watch shared global/file state (`--test-threads=1` to serialize).
- Setup/teardown via RAII so cleanup runs even on panic; use the `tempfile` crate for temp paths.
