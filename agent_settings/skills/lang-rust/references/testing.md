# Testing in Rust

## Unit tests

- `#[cfg(test)] mod tests { use super::*; }` — colocate unit tests in the source file; `#[cfg(test)]` keeps them out of the release build. This is the only place unit tests belong (they can reach private items).
- `#[test]` marks a test fn. `#[should_panic(expected = "substr")]` asserts a panic containing `substr` — keep `expected` specific or it hides the wrong panic.
- `#[ignore]` skips by default; run with `cargo test -- --ignored`. Use for slow/expensive tests.
- A test fn may return `Result<(), E>` so you can use `?` instead of `unwrap`; returning `Err` fails the test.
- Assertions: `assert!`, `assert_eq!`, `assert_ne!`. All take a trailing custom-message format string. Prefer `assert_eq!` over `assert!(a == b)` — it prints both values on failure.

## Doctests

- Code fences in `///` doc comments compile and run under `cargo test`. Keeps examples honest.
- Fence annotations: ` ```should_panic `, ` ```ignore ` (don't run), ` ```no_run ` (compile but don't execute), ` ```compile_fail `, ` ```text ` (not Rust). Hide setup lines from rendered docs with a leading `# `.
- Gotcha: doctests run against the **public** API only, as an external crate would — private items aren't visible.

## Integration tests

- Files in `tests/` are each compiled as a **separate crate** that links your lib as an external dependency — they exercise only the public API. Good for end-to-end workflows.
- Shared helpers go in `tests/common/mod.rs` (the `mod.rs` form, not `tests/common.rs`, so it isn't treated as its own test crate).

## Async tests

- `#[tokio::test]` replaces `#[test]` for `async fn`. `#[tokio::test(flavor = "multi_thread", worker_threads = 2)]` when the test needs real parallelism.
- Wrap flaky/slow awaits in `tokio::time::timeout` so a hang fails instead of stalling CI.

## Property-based testing — proptest / quickcheck

- Reach for `proptest` when testing algebraic properties (round-trips, invariants, commutativity) rather than fixed examples; it shrinks failing cases to a minimal counterexample.
- `proptest! { #[test] fn p(x in strategy) { prop_assert!(...) } }` — inputs come from `Strategy`s (ranges, regex strings, `prop::collection::vec`, `.prop_map` to build structs).
- Use for parsers, serializers, and pure algorithmic code; not worth it for I/O-bound logic.

## Mocking — mockall

- `#[automock]` on a trait generates `MockYourTrait`; set expectations with `.expect_method().with(eq(..)).times(n).returning(|..| ..)`.
- Directive: design against traits at boundaries so unit tests inject mocks; don't mock what you can construct cheaply for real.

## Benchmarking — criterion

- Use `criterion` (stable) over the built-in `#[bench]` (nightly-only). Add to `[dev-dependencies]` and declare the bench with `harness = false`:
  ```toml
  [dev-dependencies]
  criterion = "0.5"

  [[bench]]
  name = "my_benchmark"
  harness = false
  ```
- `criterion_group!` + `criterion_main!` wire up `benches/*.rs`. Wrap inputs/outputs in `black_box(..)` to stop the optimizer folding the work away.
- `benchmark_group` + `bench_with_input` / `BenchmarkId` to sweep sizes; `iter_batched(setup, routine, BatchSize::_)` when each iteration needs fresh, non-reusable state.

## Snapshot testing — insta

- `insta::assert_snapshot!` (or `assert_json_snapshot!`) for large/structured output you don't want to hand-assert. Review changes with `cargo insta review`, run via `cargo insta test`.

## Coverage & fuzzing (exact invocations)

- Coverage: `cargo llvm-cov --html` (preferred, LLVM source-based) or `cargo tarpaulin --out Html`.
- Fuzzing: `cargo fuzz init` then `cargo fuzz run <target>`; target is `fuzz_target!(|data: &[u8]| { ... })` with `#![no_main]` + `libfuzzer_sys`. Use for parsers and any code consuming untrusted bytes.

## cargo test invocations (keep literal)

- `cargo test` — run all; `cargo test <substr>` — filter by name substring.
- `cargo test -- --nocapture` — show `println!` output (captured by default on pass).
- `cargo test -- --ignored` — run only `#[ignore]` tests; `--include-ignored` for both.
- `cargo test -- --test-threads=1` — serialize (tests run in parallel by default; watch shared global/file state).
- `cargo test --all-features` (or `--doc` / `--test <name>` / `--lib`) to scope what runs.

## Best practices

- Test edge cases: empty, boundary, and max values.
- Use RAII (`Drop`) or fixtures for setup/teardown so cleanup runs even on panic; prefer the `tempfile` crate over hand-managed temp paths.
- Run clippy over test code too; measure coverage but treat it as a floor, not a goal.
