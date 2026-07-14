# Testing and Benchmarking

Go's testing toolchain is built into the standard library: `go test` drives unit tests, benchmarks, fuzzing, and examples with no external runner. The goal is fast, deterministic, parallel-safe tests that verify observable behavior — not implementation details — and that catch races and regressions before they reach production.

## Core Principles

1. **Table-driven tests are the default** — one test body, many cases. Adding a case is a one-line change, the failure message points at the named case, and coverage of edge cases is visible at a glance instead of buried in copy-pasted functions.
2. **Always run with `-race` in CI** — `go test -race ./...`. The race detector only flags races it actually observes at runtime, so it must run against real concurrent paths. A passing test without `-race` proves nothing about thread safety.
3. **Isolate external dependencies behind interfaces** — depend on a narrow interface (`EmailSender`, `Clock`, `Store`), inject a fake or mock in tests. This keeps tests fast, deterministic, and free of network/disk/clock flakiness, and is the single biggest lever on test reliability.
4. **Test behavior, not implementation** — assert on observable outputs and side effects (return values, what the mock received), never on private fields or internal call sequences you don't have to. Tests coupled to implementation break on every refactor and stop catching real regressions.
5. **Use `t.Helper()` and `t.Cleanup()`** — `t.Helper()` makes failures point at the calling test line, not inside the helper. `t.Cleanup()` registers teardown that runs even on `t.Fatal`, composes across helpers, and runs in LIFO order — more robust than `defer` scattered across the test.
6. **Keep tests deterministic** — no dependence on wall-clock time, random seeds without fixing them, network, or goroutine scheduling order. Inject a clock, seed the RNG, and use `synctest` for time-based concurrent code. Flaky tests erode trust and get ignored.
7. **`t.Parallel()` requires per-test isolation** — parallel tests share package-level state. Only mark a test parallel if it touches no shared mutable global, and capture loop variables correctly (modern Go captures loop variables per-iteration automatically; older toolchains need a manual `tt := tt`).
8. **Benchmarks must defeat dead-code elimination** — assign results to a package-level sink or use `b.Loop()`, which keeps parameters and results alive. Otherwise the compiler optimizes the work away and you measure nothing.
9. **Use `testing.Short()` to separate fast from slow** — gate integration/E2E tests behind `testing.Short()` and/or build tags so `go test -short` stays fast for the inner dev loop while CI runs the full suite.

## Constructs (keyword-directed)

- Table-driven test — `[]struct{ name string; ...; want ... }` + `for _, tt := range tests { t.Run(tt.name, ...) }`. The default form. Failure message includes `tt.name`; add a case in one line.
- Subtests + parallel — `t.Run(name, func(t){ t.Parallel(); ... })`. Modern Go captures the loop var per-iteration automatically; only pre-1.22 toolchains need `tt := tt`. Only parallelize tests that touch no shared mutable global.
- Helpers/teardown — mark helpers `t.Helper()` (failures point at the caller). Prefer `t.Cleanup(fn)` over `defer` — it runs even on `t.Fatal`, composes across helpers, LIFO order. Use `t.TempDir()` for auto-cleaned temp dirs. `t.Fatalf` stops the test; `t.Errorf` continues (use `Errorf` inside table loops).
- Mocking — hand-write a struct implementing a narrow interface (`MockEmailSender{ SentEmails []Email; ShouldFail bool }`); assert on what it *received*, not internals. See decision table for manual mock vs `mockgen`/`moq` vs in-memory fake.
- Benchmarks — `for b.Loop() { ... }` (preferred: keeps inputs/results alive, defeats dead-code elimination, per-iteration setup runs once outside). Legacy `for i := 0; i < b.N; i++` needs a package-level sink to avoid elision. `b.ResetTimer()` after setup; `b.ReportAllocs()` for alloc counts; `b.RunParallel(func(pb){ for pb.Next(){...} })` for contention.
- Fuzzing — `func FuzzX(f *testing.F)`, seed with `f.Add(...)`, body `f.Fuzz(func(t, input){...})` asserting invariants (e.g. round-trip `Reverse(Reverse(x)) == x`). Run: `go test -fuzz FuzzX`.
- Race detector — `go test -race ./...`. Only catches races it *observes at runtime*, so it must exercise real concurrent paths; a green run without `-race` proves nothing about thread safety.
- Golden files — compare output to `testdata/expected.*`; gate regeneration behind a `flag.Bool("update", ...)` so `go test -update` rewrites goldens. `testdata/` is ignored by the Go tool.
- Integration tests — gate with `if testing.Short() { t.Skip() }` and/or a `//go:build integration` tag. Run subset: `go test -short`; run tagged: `go test -tags=integration`. Avoid `time.Sleep` for readiness — poll or inject a clock.
- Testable examples — `func ExampleX()` with a trailing `// Output:` (or `// Unordered output:` for maps) comment; verified by `go test` and shown in godoc.

Coverage: `go test -coverprofile=coverage.out` then `go tool cover -html=coverage.out`.

## Decision Tables

### Unit vs Integration vs E2E

| Level | Scope | Dependencies | Speed | Use when |
| --- | --- | --- | --- | --- |
| Unit | One function/type | All faked/mocked | Milliseconds | Verifying logic, edge cases, error paths — the bulk of your suite |
| Integration | A few real components | Real DB/queue (often containerized), no full system | Seconds | Verifying SQL, serialization, wiring across module boundaries |
| E2E | Whole system | Real or near-real environment | Seconds–minutes | Verifying critical user-facing flows end to end; keep few |

Gate integration/E2E behind `testing.Short()` and/or build tags so `go test -short` runs only unit tests.

### Table-Driven vs Individual Tests

| Choose | When |
| --- | --- |
| Table-driven | Same code path, varying inputs/expected outputs; many edge cases; the default |
| Individual `Test*` funcs | Each case needs distinct setup/teardown or assertion shape; flows differ structurally |
| Table with per-case hooks | Mostly uniform but a few cases need extra setup — add a `setup func(t *testing.T)` field |

### Manual mock vs Generated mock (mockgen) vs Fake

| Choose | When | Trade-off |
| --- | --- | --- |
| Manual mock | Small interface (1–3 methods), simple recording | Zero tooling; verbose for large interfaces |
| Generated mock (`mockgen`, `moq`) | Large/changing interfaces; need call assertions | Requires codegen step + `go:generate`; mocks drift if not regenerated |
| Fake (in-memory impl) | Stateful dependency (store, cache, clock) reused across many tests | More upfront code, but most realistic and reusable; preferred for repositories |

### Golden file vs Inline expected value

| Choose | When |
| --- | --- |
| Inline expected | Small, stable outputs (numbers, short strings, structs) — assertion is self-documenting |
| Golden file (`testdata/`, `-update` flag) | Large or formatted outputs (rendered HTML, JSON, code, reports) where inline is unreadable |

Keep golden inputs/outputs under `testdata/` (ignored by the Go tool) and review golden diffs in code review.

### When to use `t.Parallel()`

| Use `t.Parallel()` | Avoid `t.Parallel()` |
| --- | --- |
| Test touches no shared mutable global | Test mutates package-level state or process env |
| Independent fixtures (own DB tx, own temp dir) | Shared fixture without synchronization |
| I/O-bound tests that benefit from overlap | Order-dependent tests |

Pair with `-race`: parallelism is the most effective way to surface data races.

### Benchmark loop: `b.Loop()` vs `b.N`

| Choose | When |
| --- | --- |
| `for b.Loop() { ... }` | Default for new benchmarks; per-iteration setup/cleanup outside the loop runs once, and inputs/results are kept alive so the compiler cannot elide the work |
| `for i := 0; i < b.N; i++ { ... }` | Older toolchains, or existing benchmarks not yet migrated |

With `b.N` you must still guard against dead-code elimination by assigning results to a sink; `b.Loop()` handles this for you.

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Running tests without `-race` | Always `go test -race ./...` in CI |
| `t.Parallel()` flaky from shared state | Give each parallel test isolated fixtures; never mutate package globals |
| Loop variable captured by reference (older toolchains) | Add `tt := tt` before `t.Run`, or use a modern Go toolchain where it's automatic |
| Assertion lib that panics on first failure (e.g. `require` in a loop) | Use `assert`-style (continue) inside table loops; reserve `require`/`t.Fatal` for preconditions |
| Benchmark work optimized away | Assign result to a package-level sink, or use `b.Loop()` |
| Counting setup in benchmark timing | `b.ResetTimer()` after setup, or put setup before `b.Loop()` |
| Tests depend on wall clock / `time.Sleep` | Inject a clock; for concurrent code use `synctest` with its fake clock |
| Tests depend on network/external services | Mock behind an interface; gate real ones behind `-short`/build tags |
| Goroutines leak across tests | Verify with `go.uber.org/goleak` in `TestMain` or per-test |
| Hard-coded paths instead of `testdata/` | Use `testdata/` (tool-ignored) and `t.TempDir()` (auto-cleaned) |
| Teardown skipped on `t.Fatal` | Use `t.Cleanup()` instead of trailing `defer` |
| Asserting on private fields / call order | Assert on observable behavior so refactors don't break tests |

## Checklist

Before writing or merging a test, answer:

- [ ] **Does it run under `-race`?** — and does CI run `go test -race ./...`?
- [ ] **Is it deterministic?** — no reliance on wall clock, unseeded RNG, network, or scheduling order
- [ ] **Is it parallel-safe?** — if `t.Parallel()`, no shared mutable state; loop vars handled
- [ ] **Does it test behavior, not implementation?** — assertions on outputs/side effects, not internals
- [ ] **Are external dependencies isolated?** — mocked/faked behind interfaces
- [ ] **Does teardown always run?** — `t.Cleanup()` / `t.TempDir()` rather than fragile `defer`
- [ ] **Do helpers call `t.Helper()`?** — failures point at the test, not the helper
- [ ] **Is coverage meaningful?** — error paths and edge cases covered, not just the happy path
- [ ] **Are slow tests gated?** — `testing.Short()` / build tags so `go test -short` stays fast
- [ ] **For benchmarks: is work observable?** — sink or `b.Loop()` so the compiler can't elide it

## Cross-References

- -> See [concurrency.md](concurrency.md) — `go.uber.org/goleak` for goroutine-leak detection in tests, and `-race` guidance for concurrent code
- -> See [interfaces.md](interfaces.md) — designing narrow interfaces at consumption points so dependencies are mockable/fakeable
- -> [go.dev — `testing` package](https://pkg.go.dev/testing) — full API for `T`, `B`, `F`, `Helper`, `Cleanup`, `Short`
- -> [go.dev — Go Fuzzing tutorial](https://go.dev/doc/tutorial/fuzz) — writing and running fuzz tests
- -> [go.dev — More predictable benchmarking with `testing.B.Loop`](https://go.dev/blog/testing-b-loop) — why and how to use `b.Loop()`
- -> [go.dev — Testing concurrent code with `synctest`](https://go.dev/blog/synctest) — deterministic testing of time-based concurrent code

## Quick Reference

| Command | Description |
|---------|-------------|
| `go test` | Run tests |
| `go test -v` | Verbose output |
| `go test -run TestName` | Run specific test |
| `go test -bench .` | Run benchmarks |
| `go test -cover` | Show coverage |
| `go test -race` | Run race detector |
| `go test -short` | Skip long tests |
| `go test -fuzz FuzzName` | Run fuzzing |
| `go test -cpuprofile cpu.prof` | CPU profiling |
| `go test -memprofile mem.prof` | Memory profiling |
