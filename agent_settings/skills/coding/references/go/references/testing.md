# Testing and Benchmarking

## Tests

- Table-driven by default: `[]struct{ name string; ...; want ... }` + `t.Run(tt.name, ...)`. Use `t.Errorf` (continue) inside table loops; `t.Fatal` / `require` only for preconditions.
- Separate `Test*` functions only when cases need structurally different setup or assertions; a `setup func(*testing.T)` field covers the few-exceptions case.
- `t.Helper()` in helpers; `t.Cleanup()` over `defer` (runs on `t.Fatal`, LIFO, composes); `t.TempDir()` for temp dirs; fixtures in `testdata/` (ignored by the Go tool).
- `t.Parallel()` only for tests that touch no package-level state or process env. Go 1.22+ captures loop variables per iteration; older toolchains need `tt := tt`.
- Test observable behavior, not private fields or call order.
- Deterministic: no wall clock, `time.Sleep`, unseeded RNG, or network. Inject a clock; use `testing/synctest` for time-based concurrent code; poll instead of sleeping for readiness.
- Gate slow tests with `if testing.Short() { t.Skip() }` and/or `//go:build integration` (`go test -tags=integration`).
- Golden files under `testdata/`, regenerated behind an `-update` flag.
- `func ExampleX()` with `// Output:` (or `// Unordered output:`) is verified by `go test`.

## Test doubles

- Depend on a narrow consumer-defined interface; inject a double.
- Hand-written mock for 1 ~ 3 method interfaces; `mockgen` / `moq` via `go:generate` for large or changing ones; an in-memory fake for stateful dependencies (repositories, caches, clocks).

## Benchmarks and fuzzing

- `for b.Loop() { ... }` (Go 1.24+) — keeps inputs/results alive and runs setup once. Legacy `for i := 0; i < b.N; i++` needs a package-level sink plus `b.ResetTimer()` after setup.
- `b.ReportAllocs()`; `b.RunParallel` for contention.
- Fuzz: `func FuzzX(f *testing.F)`, seed with `f.Add(..)`, assert invariants inside `f.Fuzz(..)`; run `go test -fuzz FuzzX`.

## Commands

- `go test -race ./...` — always in CI; parallel tests surface more races
- `go test -run 'TestX/case' -v`, `-short`, `-bench . -benchmem`
- `go test -coverprofile=coverage.out` then `go tool cover -html=coverage.out`
