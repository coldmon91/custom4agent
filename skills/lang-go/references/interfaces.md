# Interface Design and Composition

In Go, interfaces are satisfied implicitly: a type implements an interface simply by having the right methods, with no `implements` declaration. This makes interfaces a tool for the *consumer*, not the producer — the package that uses a behavior decides what shape it needs, and any type that already fits just works. The goal is small, behavior-focused contracts that keep packages decoupled without paying for abstraction you do not yet need.

## Core Principles

1. **Keep interfaces small and focused** — the smaller the interface, the more types satisfy it and the more reusable it is. `io.Reader` (one method) is the most-implemented interface in Go precisely because it asks for almost nothing. Large interfaces couple callers to capabilities they never use.
2. **Accept interfaces, return concrete types** — accepting an interface lets callers pass any implementation (real, fake, decorated); returning a concrete struct gives callers the full API and lets you add methods later without breaking them. Returning an interface hides fields and forces every future need through the abstraction.
3. **Define interfaces in the consumer package, not the producer** — the code that *uses* a behavior knows exactly which methods it needs, so it should own the interface. Producer-side "just in case" interfaces tend to grow fat and leak the producer's full surface. This also avoids import cycles: the consumer depends on its own interface, not on the producer.
4. **Do not abstract preemptively (YAGNI)** — an interface with a single implementation is usually premature. Write the concrete type first; introduce an interface only when a second implementation, a test seam, or a real decoupling need appears. Abstraction has a cost: indirection, harder navigation, and lost compiler visibility into the concrete type.
5. **Composition over large interfaces** — build big contracts by embedding small ones (`ReadWriteCloser = Reader + Writer + Closer`) rather than declaring a fat interface up front. Callers then depend only on the sub-interface they actually use.
6. **An interface value is only nil when both its type and value are nil** — assigning a nil concrete pointer to an interface produces a non-nil interface (a "typed nil"). This is the single most common interface bug; return a literal `nil` interface, never a nil typed pointer, on the error path.
7. **The method set determines satisfaction — pointer vs value receiver matters** — methods with a pointer receiver are only in the method set of the pointer type, so `*T` satisfies the interface but `T` does not. Be deliberate and consistent about receiver kind, especially when storing values (not pointers) behind an interface.
8. **Verify satisfaction at compile time** — use `var _ Iface = (*T)(nil)` so a missing or mis-typed method is a build error at the definition site, not a confusing failure at a distant call site.

## Small, Focused Interfaces

```go
// Single-method interfaces (idiomatic Go)
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type Closer interface {
    Close() error
}

// Interface composition
type ReadCloser interface {
    Reader
    Closer
}

type WriteCloser interface {
    Writer
    Closer
}

type ReadWriteCloser interface {
    Reader
    Writer
    Closer
}
```

## Accept Interfaces, Return Structs

```go
package storage

import "io"

// Storage is the concrete type (struct)
type Storage struct {
    baseDir string
}

// NewStorage returns a concrete type
func NewStorage(baseDir string) *Storage {
    return &Storage{baseDir: baseDir}
}

// SaveFile accepts an interface for flexibility
func (s *Storage) SaveFile(filename string, data io.Reader) error {
    // Implementation can work with any Reader
    // (file, network, buffer, etc.)
    return nil
}

// Usage allows dependency injection
type Uploader interface {
    SaveFile(filename string, data io.Reader) error
}

type Service struct {
    uploader Uploader // Accept interface
}

// NewService accepts interface for testing flexibility
func NewService(uploader Uploader) *Service {
    return &Service{uploader: uploader}
}
```

## Decision Tables

### Interface vs concrete type

| Situation | Use | Why |
| --- | --- | --- |
| Function parameter that has multiple real implementations, or needs a test fake | Interface | Decouples caller from a specific type; enables injection and mocking |
| Function parameter with exactly one implementation and no test seam needed | Concrete type | Avoids premature abstraction; keeps the full API visible |
| Constructor / factory return value | Concrete struct (`*T`) | Callers get all methods and fields; you can add methods later without breaking them |
| Return value that must hide implementation or pick among variants at runtime | Interface | Genuine polymorphism justifies hiding the concrete type |
| Field holding an injected dependency | Interface | Swap real vs fake; the struct owns the contract it needs |
| Field holding owned internal state | Concrete type | No abstraction benefit; direct access is clearer |

### Where to define the interface

| Where the interface lives | When to choose it | Trade-off |
| --- | --- | --- |
| Consumer package (default) | The code that calls the methods defines the contract | Smallest possible interface; no import cycle; producer stays interface-free |
| Producer package | A widely shared, stable contract such as `io.Reader`, or a plugin boundary where many consumers need the *same* name | Risks growing into a fat interface and leaking the producer's full surface |
| Separate `ports`/`api` package | Hexagonal / clean-architecture boundaries shared by many packages | Extra indirection; only pays off at real module boundaries |

### Type assertion vs type switch vs generics

| Need | Use | Why |
| --- | --- | --- |
| Test for one specific type or optional capability | Two-value type assertion `v.(T)` | Single check, no panic; e.g. probing for an optional `Flusher` |
| Branch over several known dynamic types | Type switch `switch v.(type)` | Reads cleanly; compiler checks each case |
| Same logic over many types known at compile time | Generics (`[T any]`, constraints) | Type safety without runtime assertions or `any`; no boxing |
| Truly heterogeneous, open-ended values | `any` + assertion/switch | Only when the set of types cannot be bounded at compile time |

### Functional options vs config struct

| Situation | Use | Why |
| --- | --- | --- |
| Many optional parameters, sensible defaults, API must stay backward-compatible | Functional options (`...Option`) | Add new options without changing the signature; self-documenting call site |
| Small, fixed set of required fields | Plain config struct | Less boilerplate; all fields visible and required by construction |
| Config loaded from file / env / flags | Config struct | Maps directly to decoding; options add no value over a struct |
| Library public API expected to evolve | Functional options | Future-proof; avoids breaking callers when fields are added |

## io.Reader and io.Writer Patterns

```go
import (
    "io"
    "strings"
)

// Chain readers with io.MultiReader
func combineReaders() io.Reader {
    r1 := strings.NewReader("Hello ")
    r2 := strings.NewReader("World")
    return io.MultiReader(r1, r2)
}

// Tee reader for duplicating reads
func duplicateRead(r io.Reader, w io.Writer) io.Reader {
    return io.TeeReader(r, w) // Writes to w while reading from r
}

// Limit reader to prevent reading too much
func limitedRead(r io.Reader, n int64) io.Reader {
    return io.LimitReader(r, n)
}

// Custom Reader implementation
type UppercaseReader struct {
    src io.Reader
}

func (u *UppercaseReader) Read(p []byte) (n int, err error) {
    n, err = u.src.Read(p)
    for i := 0; i < n; i++ {
        if p[i] >= 'a' && p[i] <= 'z' {
            p[i] = p[i] - 32
        }
    }
    return n, err
}

// Custom Writer implementation
type CountingWriter struct {
    w     io.Writer
    count int64
}

func (cw *CountingWriter) Write(p []byte) (n int, err error) {
    n, err = cw.w.Write(p)
    cw.count += int64(n)
    return n, err
}

func (cw *CountingWriter) BytesWritten() int64 {
    return cw.count
}
```

## Embedding for Composition

```go
import "sync"

// Embed to extend behavior
type SafeCounter struct {
    mu sync.Mutex
    m  map[string]int
}

func (sc *SafeCounter) Inc(key string) {
    sc.mu.Lock()
    defer sc.mu.Unlock()
    sc.m[key]++
}

// Embed interface to add default behavior
type Logger interface {
    Log(msg string)
}

type NoOpLogger struct{}

func (NoOpLogger) Log(msg string) {}

type Service struct {
    Logger // Embedded interface (default implementation can be provided)
}

func NewService(logger Logger) *Service {
    if logger == nil {
        logger = NoOpLogger{} // Provide default
    }
    return &Service{Logger: logger}
}

// Now Service.Log() is available
```

## Interface Satisfaction Verification

```go
import "io"

// Compile-time interface verification
var _ io.Reader = (*MyReader)(nil)
var _ io.Writer = (*MyWriter)(nil)
var _ io.Closer = (*MyCloser)(nil)

type MyReader struct{}

func (m *MyReader) Read(p []byte) (n int, err error) {
    return 0, nil
}

type MyWriter struct{}

func (m *MyWriter) Write(p []byte) (n int, err error) {
    return len(p), nil
}

type MyCloser struct{}

func (m *MyCloser) Close() error {
    return nil
}
```

## Functional Options Pattern

```go
package server

import "time"

type Server struct {
    host         string
    port         int
    timeout      time.Duration
    maxConns     int
    enableLogger bool
}

// Option is a functional option for configuring Server
type Option func(*Server)

func WithHost(host string) Option {
    return func(s *Server) {
        s.host = host
    }
}

func WithPort(port int) Option {
    return func(s *Server) {
        s.port = port
    }
}

func WithTimeout(timeout time.Duration) Option {
    return func(s *Server) {
        s.timeout = timeout
    }
}

func WithMaxConnections(max int) Option {
    return func(s *Server) {
        s.maxConns = max
    }
}

func WithLogger(enabled bool) Option {
    return func(s *Server) {
        s.enableLogger = enabled
    }
}

// NewServer creates a server with functional options
func NewServer(opts ...Option) *Server {
    // Defaults
    s := &Server{
        host:     "localhost",
        port:     8080,
        timeout:  30 * time.Second,
        maxConns: 100,
    }

    // Apply options
    for _, opt := range opts {
        opt(s)
    }

    return s
}

// Usage:
// server := NewServer(
//     WithHost("0.0.0.0"),
//     WithPort(9000),
//     WithTimeout(60 * time.Second),
//     WithLogger(true),
// )
```

## Interface Segregation

```go
// Bad: Fat interface
type BadRepository interface {
    Create(item Item) error
    Read(id string) (Item, error)
    Update(item Item) error
    Delete(id string) error
    List() ([]Item, error)
    Search(query string) ([]Item, error)
    Count() (int, error)
}

// Good: Segregated interfaces
type Creator interface {
    Create(item Item) error
}

type Reader interface {
    Read(id string) (Item, error)
}

type Updater interface {
    Update(item Item) error
}

type Deleter interface {
    Delete(id string) error
}

type Lister interface {
    List() ([]Item, error)
}

// Compose only what you need
type ReadWriter interface {
    Reader
    Creator
}

type FullRepository interface {
    Creator
    Reader
    Updater
    Deleter
    Lister
}
```

## Type Assertions and Type Switches

```go
import "fmt"

// Safe type assertion
func processValue(v interface{}) {
    // Two-value assertion (safe)
    if str, ok := v.(string); ok {
        fmt.Println("String:", str)
        return
    }

    // Type switch
    switch val := v.(type) {
    case int:
        fmt.Println("Int:", val)
    case string:
        fmt.Println("String:", val)
    case bool:
        fmt.Println("Bool:", val)
    default:
        fmt.Println("Unknown type")
    }
}

// Check for optional interface methods
type Flusher interface {
    Flush() error
}

func writeAndFlush(w io.Writer, data []byte) error {
    if _, err := w.Write(data); err != nil {
        return err
    }

    // Check if Writer also implements Flusher
    if flusher, ok := w.(Flusher); ok {
        return flusher.Flush()
    }

    return nil
}
```

## Dependency Injection via Interfaces

```go
package app

import "context"

// Define interfaces for dependencies
type UserRepository interface {
    GetUser(ctx context.Context, id string) (*User, error)
    SaveUser(ctx context.Context, user *User) error
}

type EmailSender interface {
    SendEmail(ctx context.Context, to, subject, body string) error
}

// Service depends on interfaces
type UserService struct {
    repo   UserRepository
    mailer EmailSender
}

func NewUserService(repo UserRepository, mailer EmailSender) *UserService {
    return &UserService{
        repo:   repo,
        mailer: mailer,
    }
}

func (s *UserService) RegisterUser(ctx context.Context, email string) error {
    user := &User{Email: email}
    if err := s.repo.SaveUser(ctx, user); err != nil {
        return err
    }
    return s.mailer.SendEmail(ctx, email, "Welcome", "Thanks for registering!")
}

// Easy to mock in tests
type MockUserRepository struct{}

func (m *MockUserRepository) GetUser(ctx context.Context, id string) (*User, error) {
    return &User{ID: id}, nil
}

func (m *MockUserRepository) SaveUser(ctx context.Context, user *User) error {
    return nil
}
```

## The Typed-Nil Trap

An interface value holds two words: a dynamic *type* and a *value*. It equals `nil` only when **both** are nil. Returning a nil concrete pointer through an interface return type yields a non-nil interface — the classic bug behind "I returned nil but `err != nil` is true".

```go
type MyError struct{ Code int }

func (e *MyError) Error() string { return "boom" }

// BAD: returns a non-nil error interface even on the success path.
func doWork(ok bool) error {
    var e *MyError // typed nil pointer
    if !ok {
        e = &MyError{Code: 500}
    }
    return e // interface carries type (*MyError); never == nil
}

// GOOD: return the untyped nil literal on the success path.
func doWorkFixed(ok bool) error {
    if !ok {
        return &MyError{Code: 500}
    }
    return nil // both type and value are nil
}
```

## Pointer vs Value Receiver and Interface Satisfaction

A method with a pointer receiver belongs only to the method set of the pointer type. So `*T` satisfies the interface, but a `T` value does not — a frequent "does not implement" surprise when storing values behind interfaces.

```go
type Stringer interface{ String() string }

type Point struct{ X, Y int }

// Pointer receiver: only *Point is in the method set.
func (p *Point) String() string { return fmt.Sprintf("(%d,%d)", p.X, p.Y) }

func demo() {
    var s Stringer
    s = &Point{1, 2} // OK: *Point implements Stringer
    // s = Point{1, 2} // COMPILE ERROR: Point does not implement Stringer

    // The same trap bites map/slice elements stored by value:
    // points := []Stringer{Point{1, 2}} // error; use []Stringer{&Point{1, 2}}
    _ = s
}
```

Rule of thumb: pick one receiver kind per type and use it consistently. If any method needs a pointer receiver, give the whole type pointer receivers and store `*T` behind interfaces.

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Fat interface in the producer package | Define a small interface in the consumer; embed sub-interfaces to compose larger contracts |
| Interface with a single implementation "for flexibility" (YAGNI) | Write the concrete type first; add an interface only when a second impl or test seam appears |
| Returning an interface from a constructor | Return the concrete `*T`; let callers keep the full API and add methods freely |
| Returning a typed nil pointer through an `error`/interface return | Return the untyped `nil` literal on the success path |
| Value stored behind an interface but methods use pointer receivers | Use `*T`, or convert all receivers to value receivers consistently |
| Probing for an optional method by reflection or panicky assertion | Use the two-value type assertion `v.(Flusher)` |
| `any`/`interface{}` parameter where the type set is actually known | Use generics with a constraint for compile-time safety |
| Wide config struct with many optional knobs and no defaults | Functional options (`...Option`) with defaults in the constructor |
| No compile-time check that a type satisfies an interface | Add `var _ Iface = (*T)(nil)` at the definition site |
| `interface{}` written out where `any` is clearer | Use the `any` alias for readability |

## Checklist

Before introducing an interface, answer:

- [ ] **Is there more than one implementation, now or imminently?** — one impl rarely justifies an interface
- [ ] **Does a test need to substitute a fake here?** — a legitimate reason to abstract
- [ ] **Is it defined in the consumer that uses the methods?** — not pushed onto the producer
- [ ] **Is it as small as possible?** — could it be one or two methods instead of many
- [ ] **Am I accepting the interface but returning a concrete type?** — the idiomatic direction
- [ ] **On error paths, am I returning literal `nil`, not a typed nil pointer?** — avoids the typed-nil trap
- [ ] **Are receivers (pointer vs value) consistent with how values are stored?** — avoids "does not implement"
- [ ] **Could generics express this more safely than `any` + assertions?** — prefer compile-time typing

## Cross-References

- -> See [generics.md](generics.md) for type-parameter constraints, when to prefer generics over `any`-based interfaces, and constraint interfaces (type sets).
- -> See [testing.md](testing.md) for using consumer-defined interfaces as test seams and writing fakes/mocks.
- -> See [project-structure.md](project-structure.md) for where interfaces belong across packages (consumer vs producer, ports/adapters layout) and avoiding import cycles.
- -> [Effective Go: Interfaces](https://go.dev/doc/effective_go#interfaces) — implicit satisfaction, embedding, type switches.
- -> [Go Proverbs](https://go-proverbs.github.io/) — "The bigger the interface, the weaker the abstraction"; "Accept interfaces, return structs".
- -> [Go Code Review Comments: Interfaces](https://go.dev/wiki/CodeReviewComments#interfaces) — define interfaces where they are used, not where implemented.

## Quick Reference

| Pattern | Use Case | Key Principle |
|---------|----------|---------------|
| Small interfaces | Flexibility | Single-method interfaces |
| Accept interfaces | Testability | Depend on abstractions |
| Return structs | Clarity | Concrete return types |
| io.Reader/Writer | I/O operations | Standard library integration |
| Embedding | Composition | Extend behavior without inheritance |
| Functional options | Configuration | Flexible constructors |
| Type assertions | Runtime checks | Safe downcasting (two-value form) |
| Consumer-defined interfaces | Decoupling | Define the contract where it is used |
| Generics over `any` | Type safety | Compile-time typing instead of assertions |
| `var _ Iface = (*T)(nil)` | Verification | Compile-time satisfaction check |
