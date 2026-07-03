# Project Structure and Module Management

Go layout is a design decision, not a template you copy. Packages are the unit of compilation, the unit of API surface, and the unit of import — so where code lives directly shapes what callers can depend on and how cycles form. The goal is a structure that maps to roles in the system, hides as much as possible behind `internal/`, and grows only when the flat shape stops carrying its weight.

## Core Principles

1. **Organize packages by responsibility, not by technical layer** — a package named `user` that owns the user type, its repository interface, and its service reads as a domain boundary; packages named `models`, `controllers`, `services` force every feature to spread across three directories and invite import cycles. Name a package for what it *provides*, and let the import graph follow the domain.
2. **Use `internal/` to minimize the public API surface** — anything under `internal/` is importable only by code rooted at `internal/`'s parent. This is compiler-enforced, not convention: it lets you refactor freely because nothing outside the module can pin to those packages. Default new code to `internal/`; promote to a public path only when an external consumer genuinely needs it.
3. **Start flat; do not over-structure early** — a new module is best served by a handful of packages (often just `main` plus one or two domain packages) at the repository root. Premature `cmd/internal/pkg/api/...` scaffolding creates empty ceremony and forces decisions before you know the shape of the system. Add directories when a package grows past comprehension or a real boundary appears, not before.
4. **Never create an import cycle** — Go forbids cyclic imports at compile time. Cycles are a design smell: they mean two packages actually want to be one, or a shared type belongs in a third, lower-level package. Break them by extracting the shared type, or by depending on an interface defined in the consuming package rather than the concrete type.
5. **Keep `cmd/` thin** — `cmd/<app>/main.go` should wire dependencies and call into `internal/`, nothing more. Business logic in `main` cannot be imported, tested in isolation, or reused by a second binary. Treat `main` as the assembly point, not the workshop.
6. **The module path must match where the repo is fetched from** — `module github.com/user/myproject` has to equal the import path the outside world uses (`go get github.com/user/myproject`). A mismatch makes the module unfetchable and breaks every downstream import.
7. **A package is a vocabulary, not a junk drawer** — avoid `util`, `common`, `helpers`, `misc`. They accumulate unrelated code, become import magnets, and tell the reader nothing. Put each helper next to the thing it serves, or name a package for the concept it owns (`retry`, `slug`, `httputil` scoped to one purpose).

## Decision Tables

### Single module vs multi-module (monorepo)

| Situation | Choose | Why |
| --- | --- | --- |
| One app, one team, shared release cadence | **Single module** | Simplest: one `go.mod`, one version, atomic refactors across packages |
| Several apps that always ship together | **Single module, multiple `cmd/`** | Shared internal code with zero cross-module plumbing |
| Components with independent version/release lifecycles | **Multi-module** | Each `go.mod` versions and tags separately |
| A library you publish for external consumers, plus its example/tooling apps | **Multi-module** | Consumers pull only the library module, not the tooling deps |
| Local development across those modules | **Multi-module + `go.work`** | Build against local checkouts without `replace` churn |

Default to a single module. Reach for multi-module only when independent versioning is a real requirement — it adds `go.mod` maintenance, cross-module dependency resolution, and release coordination cost.

### `internal/` vs `pkg/` vs root placement

| Goal | Place it in | Why |
| --- | --- | --- |
| Code that must not be imported outside this module | `internal/...` | Compiler-enforced privacy; free to refactor |
| A genuine public API for external modules to import | A descriptive top-level path (e.g. `slug/`, `httpclient/`) | Import path is the API; name it for the consumer |
| Small module, few packages, no privacy need yet | Repository root | Flat is readable; promote later |
| Shared code in a *multi-module* repo, private to that repo | `internal/` at a level above all consuming modules | One `internal/` tree shared by sibling modules |

`pkg/` is a community convention, not a Go language feature — it carries no compiler meaning. Many idiomatic projects (including the Go standard library and Kubernetes-era critiques) place public packages at the root instead. Use `pkg/` only if it genuinely declutters a crowded root; do not add it reflexively.

### Flat layout vs structured layout (when to split folders)

| Signal | Action |
| --- | --- |
| New project, unknown shape | Start flat: `main.go` + 1 ~ 2 domain packages at root |
| A single package exceeds comfortable comprehension (many unrelated types) | Split by responsibility into separate packages |
| You add a second binary | Introduce `cmd/<app>/` per binary |
| You want to hide implementation from external importers | Move it under `internal/` |
| You have config/proto/deploy artifacts cluttering the root | Add `configs/`, `api/`, `deployments/` as needed |
| You are adding a directory "because real projects have it" | Stop — add structure to solve a felt problem, not to match a template |

### Vendoring vs module proxy/cache

| Situation | Choose | Why |
| --- | --- | --- |
| Default for most projects | **Module cache + proxy** (`GOPROXY`) | Smaller repo, faster checkouts, reproducible via `go.sum` |
| Hermetic/air-gapped or audited builds | **Vendoring** (`go mod vendor`) | Dependencies committed in `vendor/`; build with no network |
| CI that must not reach the network | **Vendoring** | `go build -mod=vendor` (auto-detected when `vendor/` exists) |
| Large team wanting reproducibility without huge repos | **Private proxy** (Athens, GOPROXY mirror) | Central cache, no `vendor/` bloat |

`go.sum` already guarantees integrity; vendoring is about *availability and auditability*, not security. Don't vendor by default just for safety.

### When to use a `replace` directive

| Situation | Use `replace`? | Note |
| --- | --- | --- |
| Local development against an un-tagged sibling module | Yes, temporarily | Or prefer `go.work` for multi-module local dev |
| Pointing at a fork while a fix is upstreamed | Yes, with a tracking issue | Remove once the fix is released |
| Pinning a transitive dep to a patched version | Yes | Document why inline |
| A published library's `go.mod` | **No** | `replace` in a library is ignored by consumers and breaks their builds; it only applies to the main module |

For local multi-module work, prefer `go.work` over committing `replace` lines — `go.work` is not committed in libraries and won't leak into consumers' builds.

## Standard Project Layout

> **Not an official standard.** The layout below follows the widely cited [`golang-standards/project-layout`](https://github.com/golang-standards/project-layout) repository. That repo is a **community convention, not maintained or endorsed by the Go team** — its name is misleading and the Go team has explicitly distanced itself from it. Treat it as one reasonable starting point for larger applications, not a rule. For small projects, a flat root is more idiomatic (see the *Flat layout vs structured layout* table above). Only `internal/` and `cmd/` carry meaning recognized by the Go toolchain; the rest are organizational choices.

```
myproject/
├── cmd/                    # Main applications
│   ├── server/
│   │   └── main.go        # Entry point for server
│   └── cli/
│       └── main.go        # Entry point for CLI tool
├── internal/              # Private application code
│   ├── api/              # API handlers
│   ├── service/          # Business logic
│   └── repository/       # Data access layer
├── pkg/                   # Public library code
│   └── models/           # Shared models
├── api/                   # API definitions
│   ├── openapi.yaml      # OpenAPI spec
│   └── proto/            # Protocol buffers
├── web/                   # Web assets
│   ├── static/
│   └── templates/
├── scripts/               # Build and install scripts
├── configs/              # Configuration files
├── deployments/          # Docker, K8s configs
├── test/                 # Additional test data
├── docs/                 # Documentation
├── go.mod               # Module definition
├── go.sum               # Dependency checksums
├── Makefile             # Build automation
└── README.md
```

## go.mod Basics

```go
// Initialize module
// go mod init github.com/user/project

module github.com/user/myproject

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/lib/pq v1.10.9
    go.uber.org/zap v1.26.0
)

require (
    // Indirect dependencies (automatically managed)
    github.com/bytedance/sonic v1.9.1 // indirect
    github.com/chenzhuoyu/base64x v0.0.0-20221115062448-fe3a3abad311 // indirect
)

// Replace directive for local development
replace github.com/user/mylib => ../mylib

// Retract directive to mark bad versions
retract v1.0.1 // Contains critical bug
```

## Module Commands

```bash
# Initialize module
go mod init github.com/user/project

# Add missing dependencies
go mod tidy

# Download dependencies
go mod download

# Verify dependencies
go mod verify

# Show module graph
go mod graph

# Show why package is needed
go mod why github.com/user/package

# Vendor dependencies (copy to vendor/)
go mod vendor

# Update dependency
go get -u github.com/user/package

# Update to specific version
go get github.com/user/package@v1.2.3

# Update all dependencies
go get -u ./...

# Remove unused dependencies
go mod tidy
```

## Internal Packages

```go
// internal/ packages can only be imported by code in the parent tree

myproject/
├── internal/
│   ├── auth/           # Can only be imported by myproject
│   │   └── jwt.go
│   └── database/
│       └── postgres.go
└── pkg/
    └── models/         # Can be imported by anyone
        └── user.go

// This works (same project):
import "github.com/user/myproject/internal/auth"

// This fails (different project):
import "github.com/other/project/internal/auth" // Error!

// Internal subdirectories
myproject/
└── api/
    └── internal/       # Can only be imported by code in api/
        └── helpers.go
```

## Package Organization

```go
// user/user.go - Domain package
package user

import (
    "context"
    "time"
)

// User represents a user entity
type User struct {
    ID        string
    Email     string
    CreatedAt time.Time
}

// Repository defines data access interface
type Repository interface {
    Create(ctx context.Context, user *User) error
    GetByID(ctx context.Context, id string) (*User, error)
    Update(ctx context.Context, user *User) error
    Delete(ctx context.Context, id string) error
}

// Service handles business logic
type Service struct {
    repo Repository
}

// NewService creates a new user service
func NewService(repo Repository) *Service {
    return &Service{repo: repo}
}

func (s *Service) RegisterUser(ctx context.Context, email string) (*User, error) {
    user := &User{
        ID:        generateID(),
        Email:     email,
        CreatedAt: time.Now(),
    }
    return user, s.repo.Create(ctx, user)
}
```

## Multi-Module Repository (Monorepo)

```
monorepo/
├── go.work              # Workspace file
├── services/
│   ├── api/
│   │   ├── go.mod
│   │   └── main.go
│   └── worker/
│       ├── go.mod
│       └── main.go
└── shared/
    └── models/
        ├── go.mod
        └── user.go

// go.work
go 1.21

use (
    ./services/api
    ./services/worker
    ./shared/models
)

// Commands:
// go work init ./services/api ./services/worker
// go work use ./shared/models
// go work sync
```

## Build Tags and Constraints

```go
// +build integration
// integration_test.go

package myapp

import "testing"

func TestIntegration(t *testing.T) {
    // Integration test code
}

// Build: go test -tags=integration

// File-level build constraints
//go:build linux && amd64

package myapp

// Multiple constraints
//go:build linux || darwin
//go:build amd64

// Negation
//go:build !windows

// Common tags:
// linux, darwin, windows, freebsd
// amd64, arm64, 386, arm
// cgo, !cgo
```

## Makefile Example

```makefile
# Makefile
.PHONY: build test lint clean run

# Variables
BINARY_NAME=myapp
BUILD_DIR=bin
GO=go
GOFLAGS=-v

# Build the application
build:
	$(GO) build $(GOFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/server

# Run tests
test:
	$(GO) test -v -race -coverprofile=coverage.out ./...

# Run tests with coverage report
test-coverage: test
	$(GO) tool cover -html=coverage.out

# Run linters
lint:
	golangci-lint run ./...

# Format code
fmt:
	$(GO) fmt ./...
	goimports -w .

# Run the application
run:
	$(GO) run ./cmd/server

# Clean build artifacts
clean:
	rm -rf $(BUILD_DIR)
	rm -f coverage.out

# Install dependencies
deps:
	$(GO) mod download
	$(GO) mod tidy

# Build for multiple platforms
build-all:
	GOOS=linux GOARCH=amd64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/server
	GOOS=darwin GOARCH=amd64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 ./cmd/server
	GOOS=windows GOARCH=amd64 $(GO) build -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe ./cmd/server

# Run with race detector
run-race:
	$(GO) run -race ./cmd/server

# Generate code
generate:
	$(GO) generate ./...

# Docker build
docker-build:
	docker build -t $(BINARY_NAME):latest .

# Help
help:
	@echo "Available targets:"
	@echo "  build         - Build the application"
	@echo "  test          - Run tests"
	@echo "  test-coverage - Run tests with coverage report"
	@echo "  lint          - Run linters"
	@echo "  fmt           - Format code"
	@echo "  run           - Run the application"
	@echo "  clean         - Clean build artifacts"
	@echo "  deps          - Install dependencies"
```

## Dockerfile Multi-Stage Build

```dockerfile
# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o server ./cmd/server

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy binary from builder
COPY --from=builder /app/server .

# Copy config files if needed
COPY --from=builder /app/configs ./configs

EXPOSE 8080

CMD ["./server"]
```

## Version Information

```go
// version/version.go
package version

import "runtime"

var (
    // Set via ldflags during build
    Version   = "dev"
    GitCommit = "none"
    BuildTime = "unknown"
)

// Info returns version information
func Info() map[string]string {
    return map[string]string{
        "version":    Version,
        "git_commit": GitCommit,
        "build_time": BuildTime,
        "go_version": runtime.Version(),
        "os":         runtime.GOOS,
        "arch":       runtime.GOARCH,
    }
}

// Build with version info:
// go build -ldflags "-X github.com/user/project/version.Version=1.0.0 \
//   -X github.com/user/project/version.GitCommit=$(git rev-parse HEAD) \
//   -X github.com/user/project/version.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Go Generate

```go
// models/user.go
//go:generate mockgen -source=user.go -destination=../mocks/user_mock.go -package=mocks

package models

type UserRepository interface {
    GetUser(id string) (*User, error)
    SaveUser(user *User) error
}

// tools.go - Track tool dependencies
//go:build tools

package tools

import (
    _ "github.com/golang/mock/mockgen"
    _ "golang.org/x/tools/cmd/stringer"
)

// Install tools:
// go install github.com/golang/mock/mockgen@latest

// Run generate:
// go generate ./...
```

## Configuration Management

```go
// config/config.go
package config

import (
    "os"
    "time"

    "github.com/kelseyhightower/envconfig"
)

type Config struct {
    Server   ServerConfig
    Database DatabaseConfig
    Redis    RedisConfig
}

type ServerConfig struct {
    Host         string        `envconfig:"SERVER_HOST" default:"0.0.0.0"`
    Port         int           `envconfig:"SERVER_PORT" default:"8080"`
    ReadTimeout  time.Duration `envconfig:"SERVER_READ_TIMEOUT" default:"10s"`
    WriteTimeout time.Duration `envconfig:"SERVER_WRITE_TIMEOUT" default:"10s"`
}

type DatabaseConfig struct {
    URL          string `envconfig:"DATABASE_URL" required:"true"`
    MaxOpenConns int    `envconfig:"DB_MAX_OPEN_CONNS" default:"25"`
    MaxIdleConns int    `envconfig:"DB_MAX_IDLE_CONNS" default:"5"`
}

type RedisConfig struct {
    Addr     string `envconfig:"REDIS_ADDR" default:"localhost:6379"`
    Password string `envconfig:"REDIS_PASSWORD"`
    DB       int    `envconfig:"REDIS_DB" default:"0"`
}

// Load loads configuration from environment
func Load() (*Config, error) {
    var cfg Config
    if err := envconfig.Process("", &cfg); err != nil {
        return nil, err
    }
    return &cfg, nil
}
```

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Over-structuring a new project (`cmd/internal/pkg/api/...` from day one) | Start flat at the root; add directories when a real boundary appears |
| Creating an import cycle between two packages | Extract the shared type into a lower-level package, or depend on an interface defined in the consumer |
| Reflexively adding a `pkg/` directory | `pkg/` has no compiler meaning; place public packages at the root unless `pkg/` genuinely declutters |
| `util` / `common` / `helpers` catch-all packages | Put each helper next to what it serves, or name a package for the concept it owns |
| Module path differs from the repo URL (`module foo` for `github.com/user/foo`) | Set `module github.com/user/foo` to match `go get` path exactly |
| Assuming `internal/` is global privacy | `internal/` is importable by everything under its *parent*; nest it deeper (`api/internal/`) to scope tighter |
| Business logic living in `cmd/<app>/main.go` | Keep `main` thin (wire + call); move logic into importable `internal/` packages |
| One giant package holding the whole app | Split by responsibility into cohesive packages with clear, minimal exported surfaces |
| `replace` directive committed in a published library | Libraries' `replace` is ignored by consumers; use `go.work` for local dev instead |
| Vendoring "for safety" by default | `go.sum` already guarantees integrity; vendor only for hermetic/offline/audited builds |
| Naming a package for its layer (`controllers`, `models`) | Name it for the domain it owns (`user`, `billing`); let the import graph follow domains |

## Checklist

Before creating a new package or module, answer:

- [ ] **Does this package have one clear responsibility?** — if you can't name it without `util`/`common`, the boundary is wrong
- [ ] **Should this be `internal/`?** — default to private; only make it public if an external module truly needs it
- [ ] **Am I adding structure to solve a real problem, or to match a template?** — flat until a felt boundary forces a split
- [ ] **Will this create an import cycle?** — check the direction of dependencies before adding the import
- [ ] **Does this really need to be a separate module?** — only if it has an independent version/release lifecycle
- [ ] **Does the module path match the repository URL?** — required for the module to be fetchable
- [ ] **Is `cmd/<app>/main.go` staying thin?** — wiring only; logic belongs in importable packages
- [ ] **For local multi-module work, am I reaching for `go.work` instead of committed `replace`?** — keeps consumers' builds clean

## Cross-References

Within the lang-go skill:

- See [interfaces.md](interfaces.md) for package boundaries, interface placement (define interfaces in the consumer), and breaking import cycles with abstractions.
- See [testing.md](testing.md) for `_test` package conventions, build-tag-gated integration tests, and where test data and fixtures belong.
- See [concurrency.md](concurrency.md) for the structure of goroutine-owning packages and `x/sync` placement.

External, authoritative documentation:

- [Go Modules Reference](https://go.dev/ref/mod) — the canonical, Go-team-maintained spec for `go.mod`, `go.sum`, `go.work`, the toolchain directive, `replace`/`retract`, and module resolution.
- [Organizing a Go module](https://go.dev/doc/modules/layout) — the **official** Go team guidance on directory layout (the document to trust over any "standard layout" repo).
- [Effective Go: Package names](https://go.dev/doc/effective_go#names) — idiomatic package naming.
- [`golang-standards/project-layout`](https://github.com/golang-standards/project-layout) — popular but **community-maintained and not endorsed by the Go team**; useful as a checklist for large apps, not a rule.

## Quick Reference

### Commands

| Command | Description |
|---------|-------------|
| `go mod init` | Initialize module |
| `go mod tidy` | Add/remove dependencies |
| `go mod download` | Download dependencies |
| `go get package@version` | Add/update dependency |
| `go build -ldflags "-X ..."` | Set version info |
| `go generate ./...` | Run code generation |
| `GOOS=linux go build` | Cross-compile |
| `go work init` | Initialize workspace |

### Directory roles

| Directory | Meaning | Recognized by toolchain? |
|-----------|---------|--------------------------|
| `internal/` | Importable only within the parent tree | **Yes** (compiler-enforced) |
| `cmd/<app>/` | One `main` package per binary; keep thin | Convention (only `main` semantics are language-level) |
| `pkg/` | Optional bucket for public packages | No — purely organizational |
| `api/` | API contracts (OpenAPI, `.proto`) | No |
| `configs/`, `deployments/`, `scripts/` | Config, deploy, build artifacts | No |
| repo root | Idiomatic home for a small module's packages | n/a |
