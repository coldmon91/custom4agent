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

## Table-Driven Tests

```go
package math

import "testing"

func Add(a, b int) int {
    return a + b
}

func TestAdd(t *testing.T) {
    tests := []struct {
        name     string
        a, b     int
        expected int
    }{
        {"positive numbers", 2, 3, 5},
        {"negative numbers", -2, -3, -5},
        {"mixed signs", -2, 3, 1},
        {"zeros", 0, 0, 0},
        {"large numbers", 1000000, 2000000, 3000000},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Add(tt.a, tt.b)
            if result != tt.expected {
                t.Errorf("Add(%d, %d) = %d; want %d", tt.a, tt.b, result, tt.expected)
            }
        })
    }
}
```

## Subtests and Parallel Execution

```go
func TestParallel(t *testing.T) {
    tests := []struct {
        name  string
        input string
        want  string
    }{
        {"lowercase", "hello", "HELLO"},
        {"uppercase", "WORLD", "WORLD"},
        {"mixed", "HeLLo", "HELLO"},
    }

    for _, tt := range tests {
        tt := tt // Capture range variable (unnecessary in modern Go; required in older toolchains)
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel() // Run subtests in parallel

            result := strings.ToUpper(tt.input)
            if result != tt.want {
                t.Errorf("got %q, want %q", result, tt.want)
            }
        })
    }
}
```

## Test Helpers and Setup/Teardown

```go
func TestWithSetup(t *testing.T) {
    // Setup
    db := setupTestDB(t)
    defer cleanupTestDB(t, db)

    tests := []struct {
        name string
        user User
    }{
        {"valid user", User{Name: "John", Email: "john@example.com"}},
        {"empty name", User{Name: "", Email: "test@example.com"}},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := db.SaveUser(tt.user)
            if err != nil {
                t.Fatalf("SaveUser failed: %v", err)
            }
        })
    }
}

// Helper function (doesn't show in stack trace)
func setupTestDB(t *testing.T) *DB {
    t.Helper()

    db, err := NewDB(":memory:")
    if err != nil {
        t.Fatalf("failed to create test DB: %v", err)
    }
    return db
}

func cleanupTestDB(t *testing.T, db *DB) {
    t.Helper()

    if err := db.Close(); err != nil {
        t.Errorf("failed to close DB: %v", err)
    }
}
```

## Mocking with Interfaces

```go
// Interface to mock
type EmailSender interface {
    Send(to, subject, body string) error
}

// Mock implementation
type MockEmailSender struct {
    SentEmails []Email
    ShouldFail bool
}

type Email struct {
    To, Subject, Body string
}

func (m *MockEmailSender) Send(to, subject, body string) error {
    if m.ShouldFail {
        return fmt.Errorf("failed to send email")
    }
    m.SentEmails = append(m.SentEmails, Email{to, subject, body})
    return nil
}

// Test using mock
func TestUserService_Register(t *testing.T) {
    mockSender := &MockEmailSender{}
    service := NewUserService(mockSender)

    err := service.Register("user@example.com")
    if err != nil {
        t.Fatalf("Register failed: %v", err)
    }

    if len(mockSender.SentEmails) != 1 {
        t.Errorf("expected 1 email sent, got %d", len(mockSender.SentEmails))
    }

    email := mockSender.SentEmails[0]
    if email.To != "user@example.com" {
        t.Errorf("expected email to user@example.com, got %s", email.To)
    }
}
```

## Benchmarking

```go
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {
        Add(100, 200)
    }
}

// Benchmark with subtests
func BenchmarkStringOperations(b *testing.B) {
    benchmarks := []struct {
        name  string
        input string
    }{
        {"short", "hello"},
        {"medium", strings.Repeat("hello", 10)},
        {"long", strings.Repeat("hello", 100)},
    }

    for _, bm := range benchmarks {
        b.Run(bm.name, func(b *testing.B) {
            for i := 0; i < b.N; i++ {
                _ = strings.ToUpper(bm.input)
            }
        })
    }
}

// Benchmark with setup
func BenchmarkMapOperations(b *testing.B) {
    m := make(map[string]int)
    for i := 0; i < 1000; i++ {
        m[fmt.Sprintf("key%d", i)] = i
    }

    b.ResetTimer() // Don't count setup time

    for i := 0; i < b.N; i++ {
        _ = m["key500"]
    }
}

// Parallel benchmark
func BenchmarkConcurrentAccess(b *testing.B) {
    var counter int64

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            atomic.AddInt64(&counter, 1)
        }
    })
}

// Memory allocation benchmark
func BenchmarkAllocation(b *testing.B) {
    b.ReportAllocs() // Report allocations

    for i := 0; i < b.N; i++ {
        s := make([]int, 1000)
        _ = s
    }
}
```

## Fuzzing

```go
func FuzzReverse(f *testing.F) {
    // Seed corpus
    testcases := []string{"hello", "world", "123", ""}
    for _, tc := range testcases {
        f.Add(tc)
    }

    f.Fuzz(func(t *testing.T, input string) {
        reversed := Reverse(input)
        doubleReversed := Reverse(reversed)

        if input != doubleReversed {
            t.Errorf("Reverse(Reverse(%q)) = %q, want %q", input, doubleReversed, input)
        }
    })
}

// Fuzz with multiple parameters
func FuzzAdd(f *testing.F) {
    f.Add(1, 2)
    f.Add(0, 0)
    f.Add(-1, 1)

    f.Fuzz(func(t *testing.T, a, b int) {
        result := Add(a, b)

        // Properties that should always hold
        if result < a && b >= 0 {
            t.Errorf("Add(%d, %d) = %d; result should be >= a when b >= 0", a, b, result)
        }
    })
}
```

## Test Coverage

```go
// Run tests with coverage:
// go test -cover
// go test -coverprofile=coverage.out
// go tool cover -html=coverage.out

func TestCalculate(t *testing.T) {
    tests := []struct {
        name     string
        input    int
        expected int
    }{
        {"zero", 0, 0},
        {"positive", 5, 25},
        {"negative", -3, 9},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := Calculate(tt.input)
            if result != tt.expected {
                t.Errorf("Calculate(%d) = %d; want %d", tt.input, result, tt.expected)
            }
        })
    }
}
```

## Race Detector

```go
// Run with: go test -race

func TestConcurrentAccess(t *testing.T) {
    var counter int
    var wg sync.WaitGroup

    // This will fail with -race if not synchronized
    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            counter++ // Data race!
        }()
    }

    wg.Wait()
}

// Fixed version with mutex
func TestConcurrentAccessSafe(t *testing.T) {
    var counter int
    var mu sync.Mutex
    var wg sync.WaitGroup

    for i := 0; i < 10; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            mu.Lock()
            counter++
            mu.Unlock()
        }()
    }

    wg.Wait()

    if counter != 10 {
        t.Errorf("expected 10, got %d", counter)
    }
}
```

## Golden Files

```go
import (
    "os"
    "path/filepath"
    "testing"
)

func TestRenderHTML(t *testing.T) {
    data := Data{Title: "Test", Content: "Hello"}
    result := RenderHTML(data)

    goldenFile := filepath.Join("testdata", "expected.html")

    if *update {
        // Update golden file: go test -update
        os.WriteFile(goldenFile, []byte(result), 0644)
    }

    expected, err := os.ReadFile(goldenFile)
    if err != nil {
        t.Fatalf("failed to read golden file: %v", err)
    }

    if result != string(expected) {
        t.Errorf("output doesn't match golden file\ngot:\n%s\nwant:\n%s", result, expected)
    }
}

var update = flag.Bool("update", false, "update golden files")
```

## Integration Tests

```go
// integration_test.go
// +build integration

package myapp

import (
    "testing"
    "time"
)

func TestIntegration(t *testing.T) {
    if testing.Short() {
        t.Skip("skipping integration test in short mode")
    }

    // Long-running integration test
    server := startTestServer(t)
    defer server.Stop()

    time.Sleep(100 * time.Millisecond) // Wait for server

    client := NewClient(server.URL)
    resp, err := client.Get("/health")
    if err != nil {
        t.Fatalf("health check failed: %v", err)
    }

    if resp.Status != "ok" {
        t.Errorf("expected status ok, got %s", resp.Status)
    }
}

// Run: go test -tags=integration
// Run short tests only: go test -short
```

## Testable Examples

```go
// Example tests that appear in godoc
func ExampleAdd() {
    result := Add(2, 3)
    fmt.Println(result)
    // Output: 5
}

func ExampleAdd_negative() {
    result := Add(-2, -3)
    fmt.Println(result)
    // Output: -5
}

// Unordered output
func ExampleKeys() {
    m := map[string]int{"a": 1, "b": 2, "c": 3}
    keys := Keys(m)
    for _, k := range keys {
        fmt.Println(k)
    }
    // Unordered output:
    // a
    // b
    // c
}
```

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
