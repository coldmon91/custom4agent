---
name: lang-go
description: Use whenever writing, modifying, reviewing, or debugging Go code — any `.go` file, `go.mod`, or Go module — even for a one-line edit. Covers goroutines, channels, and concurrency, idiomatic error handling, generics and interfaces, gRPC or REST microservices, pprof performance tuning, CLI tools, benchmarks, and table-driven tests.
license: MIT
metadata:
  author: https://github.com/Jeffallan
---

# Go

## Rules

**Errors**
- Handle every error; `_ =` on an error needs a justifying comment
- Wrap with context: `fmt.Errorf("load config %s: %w", path, err)`; inspect with `errors.Is` / `errors.As`, never string matching
- Sentinel errors (`var ErrNotFound = errors.New(..)`) or typed errors for conditions callers branch on
- `panic` only for programmer bugs, never for expected failure

**Context and goroutines**
- `ctx context.Context` is the first parameter of every blocking or I/O function; never store it in a struct
- Every goroutine has an owner, an exit path (`ctx.Done()`, channel close), and a waiter (`WaitGroup` / `errgroup`)
- Bound concurrency (`errgroup.SetLimit(n)`, semaphore) — never spawn per item without a limit
- Shared state: unexported fields plus locking methods, mutex declared directly above the fields it guards (see `references/concurrency.md`)

**API shape**
- Accept interfaces, return concrete types; define interfaces in the consumer package
- Document every exported identifier
- Configuration via functional options or config struct, not hardcoded values

## Validate before finishing

- `gofmt -l .` (or `goimports`) — no output
- `go vet ./...`
- `golangci-lint run` when the repo configures it
- `go test -race ./...` — the only net for data races (Go has no compile-time lock checking)

## References

| Topic | File | Load when |
|-------|------|-----------|
| Concurrency | `references/concurrency.md` | Goroutines, channels, select, sync primitives, errgroup, leaks |
| Interfaces | `references/interfaces.md` | Interface design, typed nil, receivers, functional options |
| Generics | `references/generics.md` | Type parameters, constraints, generics vs interfaces |
| Testing | `references/testing.md` | Table-driven tests, fakes, benchmarks, fuzzing |
| Project Structure | `references/project-structure.md` | Package layout, `internal/`, `go.mod`, `go.work`, build tags |
