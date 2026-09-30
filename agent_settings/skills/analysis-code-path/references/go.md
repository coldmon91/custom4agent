# Go

## Entry points and registration
- `func main(` in `package main`, `func init(` (including side-effect imports `import _`)
- HTTP / RPC: `http.HandleFunc`, `Handle(`, router `GET(` / `POST(`, `ServeHTTP`, `grpc.Register`, `Register*Server`
- Goroutines `go f(...)`, worker / consumer loops, middleware wrapping
- Interface method implementations
- Tests: `TestXxx`, `BenchmarkXxx`, `FuzzXxx`

## Path-specific patterns
- Channels: trace where data enters and what keeps the consumer loop running. Note backpressure gates.
- Timers: `time.After`, `time.Tick`. State the time window.
- Cancellation: `ctx.Done()` branches. Trace the cancel source (timeout, explicit cancel, parent context).
- `recover()` can change whether execution continues: mark the path uncertain.
- `plugin.Open` / `plugin.Lookup`: low confidence.
- Build tags: `//go:build`, `// +build`. Determine active tags from build commands and Makefiles.

## Unused code: deadcode

```bash
go install golang.org/x/tools/cmd/deadcode@latest
deadcode -test ./...                   # roots: main, init, and (-test) test executables
deadcode -json ./... | jq -r '.[] | .Funcs[] | "\(.Position.File):\(.Position.Line) \(.Name)"'
deadcode -whylive=<pkg.Func> ./...     # show a call path from main to a function
```

- The listed packages must include a `main` package, or it fails with `no main packages`. For library-only code, use `-test` or targeted search.
- Generated files (`Code generated ... DO NOT EDIT.` header) are skipped by default; `-generated` includes them. Filter generated files without that header by hand: `*.pb.go`, `*.gen.go`, `*_generated.go`, `zz_*.go`.
- Exported functions in non-`main` packages may be imported by other modules: `UNKNOWN` when `library_mode=yes`.
- Extra check: `staticcheck ./...` (U1000 reports unused code).

### Edge cases: `UNKNOWN`
- Package uses `reflect` (`MethodByName`, `FieldByName`, `ValueOf`): its unexported symbols
- Method whose name and signature match an interface method (runtime dispatch possible)
- File with `GOOS` / `GOARCH` or custom build tags
- File using cgo (`import "C"`): may be called from C
- Package used with `plugin.Open` / `plugin.Lookup`: its exported symbols
- Referenced by `//go:linkname`

```bash
rg -n 'reflect\.|import "C"|//go:build|// \+build|plugin\.(Open|Lookup)|go:linkname' -g '*.go' <scope>
```
