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

## Constructs (keyword-directed)

- Single-method interfaces (`io.Reader`, `io.Writer`, `io.Closer`) — the idiomatic unit. Compose larger contracts by embedding (`ReadWriteCloser = Reader + Writer + Closer`), never by declaring a fat interface up front.
- Accept-interface / return-struct: constructors return `*T` (concrete); functions/fields take the narrowest interface they use. The consumer defines the interface it needs (e.g. an `Uploader` in the service package), not the producer.

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

## Constructs and Gotchas (keyword-directed)

- `io` composition helpers — `io.MultiReader(r1, r2)` (chain), `io.TeeReader(r, w)` (read + duplicate to `w`), `io.LimitReader(r, n)` (cap bytes). Custom `Read(p []byte) (n, err)` must transform only `p[:n]` and propagate `n, err` unchanged.
- Struct embedding — embed a concrete type to reuse its methods; embed an *interface* field (`type Service struct{ Logger }`) to get a swappable default. Guard against a nil injected interface by substituting a no-op impl (`NoOpLogger{}`) in the constructor.
- Compile-time satisfaction check: `var _ io.Reader = (*MyReader)(nil)` at the definition site — a missing/mistyped method fails the build there, not at a distant call site.
- Functional options — `type Option func(*Server)`, `WithX(v) Option`, `NewServer(opts ...Option)` applying over struct defaults. Reach for this over a config struct only when options are many/optional and the public API must stay backward-compatible (see decision table).
- Interface segregation — split a fat CRUD interface into one-method interfaces (`Creator`, `Reader`, `Updater`...) and compose (`ReadWriter = Reader + Creator`) so callers depend only on what they use.
- Type assertion / switch — two-value `v.(T)` to probe one type or an optional capability (`if f, ok := w.(Flusher); ok`); `switch v.(type)` to branch over known dynamic types. Never panic-form single-value assertions on untrusted values.
- DI via interfaces — depend on `UserRepository`/`EmailSender` interfaces defined in the consumer, inject fakes in tests. `context.Context` is the first parameter of each method by convention.

### The typed-nil trap (single most common interface bug)

An interface value equals `nil` only when **both** its dynamic type and value are nil. Returning a nil *typed* pointer (`var e *MyError; return e`) through an `error`/interface return yields a non-nil interface — the "I returned nil but `err != nil`" bug. Fix: return the untyped `nil` literal on the success path, never a nil typed pointer.

### Pointer vs value receiver and satisfaction

A pointer-receiver method is only in the method set of `*T`, so `*T` satisfies the interface but a `T` value does not (`s = Point{1,2}` fails; `s = &Point{1,2}` works; same trap for `[]Stringer{Point{...}}` — use `&Point{...}`). Rule of thumb: pick one receiver kind per type; if any method needs a pointer receiver, give the whole type pointer receivers and store `*T` behind interfaces.

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
