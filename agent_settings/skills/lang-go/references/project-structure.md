# Project Structure and Modules

Official guidance: [Organizing a Go module](https://go.dev/doc/modules/layout). `golang-standards/project-layout` is a community repo, not endorsed by the Go team.

## Layout

- Start flat (`main.go` + one or two domain packages at the root); add `cmd/<app>/` when a second binary appears and directories only when a real boundary forces a split.
- Package by responsibility (`user`, `billing`), not by layer (`models`, `controllers`, `services`). No `util` / `common` / `helpers` packages.
- `internal/` is compiler-enforced: importable only by code under its **parent**. Nest it (`api/internal/`) to scope tighter. Default new code to `internal/`.
- `pkg/` has no compiler meaning — don't add it reflexively.
- Keep `cmd/<app>/main.go` thin: wiring only; logic lives in importable packages.
- Import cycles are a design smell: extract the shared type into a lower-level package, or depend on a consumer-defined interface.

## Modules

- The `module` path must equal the fetch path (`github.com/user/repo`).
- Default to one module; split only for independent versioning. Multi-module local dev → `go.work`; don't commit `go.work` in a published library.
- `replace` in a library's `go.mod` is ignored by consumers — use it only temporarily (fork, local sibling) and document why.
- `go.sum` already guarantees integrity; vendor (`go mod vendor`) only for hermetic or offline builds.
- `tools.go` behind `//go:build tools` with blank imports pins codegen tools (or the `tool` directive in Go 1.24+).

## Build details

- Build constraints: `//go:build linux && amd64`, `||`, `!windows`, custom tags via `-tags=`. Place above `package` with a blank line after; `// +build` is legacy.
- `//go:generate <cmd>` (no space after `//`) runs only via `go generate ./...`, never during `go build`.
- `-ldflags "-X pkg/path.Var=value"` works only on package-level **string** variables (not consts); it silently does nothing otherwise.
- `CGO_ENABLED=0` for a static binary on `scratch` / `alpine`; add `ca-certificates` for outbound TLS.
