# Go Checklist

Check for:
- `main`
- `http.HandleFunc`, router registrations, middleware wrapping
- goroutine launches with `go `
- interface method implementations
- init functions
- worker / consumer loops
- build tags

Useful search patterns:
- `func main(`, `func init(`, `http.HandleFunc`, `Handle(`, `GET(`, `POST(`, `go `
- `//go:build`, `+build`

## Async and Concurrency Patterns

Check for:
- `<-chan` consumers and goroutines launched with `go`
- `time.After`, `time.Tick`

Async-specific guidance:
- Trace where channel data enters and what triggers loop continuation.
- Document backpressure or flow-control gates if present.
- Mark scheduled paths with execution time windows.

## Error Control Flow

Check for:
- `context.Context` propagation and cancellation checks
- `ctx.Done()` and cancellation-driven branches
- `defer` blocks and `recover()` usage

Error-specific guidance:
- Trace parent context and cancel sources such as timeout or explicit cancel.
- `defer` always runs before function exit.
- Mark the path as uncertain if panic recovery changes whether execution continues.

## Dynamic Loading and Generated Code

Check for:
- `plugin` package usage and dynamic loading of shared objects

Dynamic-specific guidance:
- Mark paths as low-confidence if loading depends on file names, environment, or external plugins.

## Conditional Compilation and Feature Flags

Check for:
- `//go:build` and `+build` tags
- internal flag packages or environment checks
- version assumptions in `go.mod` and build files

Feature-flag guidance:
- Determine which build tags are active from build files and commands.
- Trace whether runtime flags come from external environment or internal configuration.
- If the flag can change in a running system, mark timing as uncertain.

## Unused Code Detection (Go)

### Required tool

```bash
# Install
go install golang.org/x/tools/cmd/deadcode@latest

# Verify
deadcode -version
```

`deadcode` is the Go team's call-graph-based analyzer. Do not substitute with grep-based approaches — accuracy is insufficient for real codebases.

### Running the tool

```bash
# Basic run (entry point: main package)
deadcode ./...

# Include test code
deadcode -test ./...

# JSON output (easier to parse)
deadcode -json ./...

# Specify a custom entry point package
deadcode -whylive=pkg/server ./...
```

Parse JSON output:

```bash
deadcode -json ./... | jq '.[] | {name: .name, position: .posn}'
```

Output fields:
- `.name` — fully qualified function/method name
- `.posn` — location in `file.go:line:col` format

### Entry points

`deadcode` automatically treats the following as entry points:
- `main()` in `package main`
- `TestXxx`, `BenchmarkXxx`, `FuzzXxx` (with `-test` flag)
- `init()` — including side-effect imports

Additional entry points to check manually:

```bash
# Exported symbols (importable by external packages)
grep -rn "^func [A-Z]" --include="*.go" .

# RPC / gRPC handlers
grep -rn "proto.RegisterServer\|grpc.Register" --include="*.go" .

# HTTP handlers
grep -rn "http.HandleFunc\|router\." --include="*.go" .
```

Exported symbols in non-`main` packages may be imported externally. Ask the user whether this repo is consumed as a library before marking them UNUSED.

### Edge cases → classify as UNKNOWN

**1. reflect usage**
```bash
grep -rn "reflect\." --include="*.go" .
```
If `reflect.ValueOf`, `MethodByName`, `FieldByName`, etc. appear in the same package → all unexported symbols in that package are UNKNOWN.

**2. Interface implementations**
```bash
grep -rn "type .* interface" --include="*.go" .
```
Even if `deadcode` marks a method as unreachable, if its name and signature match any interface method → classify as UNKNOWN (runtime dispatch possible).

**3. Build tags**
```bash
grep -rn "//go:build\|// +build" --include="*.go" .
```
Symbols in files with `GOOS`, `GOARCH`, or custom build tags → UNKNOWN.

**4. cgo**
```bash
grep -rn "import \"C\"" --include="*.go" .
```
Symbols in files that use cgo → UNKNOWN (may be called from C code).

**5. Plugin system**
```bash
grep -rn "plugin.Open\|plugin.Lookup" --include="*.go" .
```
Exported symbols in packages used with Go's plugin system → UNKNOWN.

**6. `//go:linkname`**
```bash
grep -rn "go:linkname" --include="*.go" .
```
Symbols referenced via `go:linkname` → UNKNOWN.

### Exclusion patterns

```bash
# Files not automatically excluded by deadcode — filter manually
vendor/

# Generated file patterns
*.pb.go           # protobuf
*.gen.go          # general codegen
*_generated.go    # mockgen, etc.
zz_*.go           # controller-gen
```

### Supplementary tools

```bash
# Detect unused packages (compiler catches most, but useful for verification)
go vet ./...

# staticcheck — catches additional patterns
staticcheck ./...
```
