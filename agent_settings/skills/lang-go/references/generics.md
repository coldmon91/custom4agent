# Generics and Type Parameters

Generics (type parameters) let you write functions and data structures that work over a *set* of types instead of one concrete type, without falling back to `interface{}`/`any` plus runtime type assertions. The power is real, but so is the cost: generic code is harder to read, slower to compile, and easy to over-apply. The goal is to reach for generics only when they remove genuine, type-unsafe duplication — and to keep constraints as tight as the code actually requires.

## Core Principles

1. **Write it concrete first, generalize on the third copy** — premature generics add cognitive load before any duplication exists. The classic guidance ("Rule of Three") applies: don't parameterize a type until you have two or three concrete implementations that differ only by type.
2. **Prefer interfaces for behavior, generics for containers and algorithms** — if callers vary by *behavior*, an interface is simpler and idiomatic. Reach for generics when the code is identical across types and only the *type* changes (containers, `Map`/`Filter`/`Reduce`, ordering).
3. **Make constraints as narrow as the code requires** — `any` allows the widest input but lets you do almost nothing with the value. If you compare with `==`, you need `comparable`; if you use `<`/`>`, you need `cmp.Ordered`. A tighter constraint documents intent and lets the compiler catch misuse.
4. **Let type inference work — omit explicit type arguments when the compiler can deduce them** — `Max(10, 20)` reads better than `Max[int](10, 20)`. Go's type inference is strong enough that explicit arguments are needed mainly when types appear only in results, not in parameters.
5. **Type parameters belong on functions and types, not on methods** — Go forbids type parameters on methods. Put the parameter on the receiver type (`type Stack[T any]`) or on a free function. This is a language rule, not a style choice.
6. **Use `~` (approximation) when you want to accept named/defined types** — `~int` matches `int` *and* any type whose underlying type is `int` (e.g. `type MyInt int`). Plain `int` in a union rejects `MyInt`. Use `~` for constraints meant to work with domain types.
7. **Generics do not give you operator overloading or sum types** — a union constraint (`int | string`) restricts which types instantiate the function; inside the body you still only get operations common to *all* members. To act per-type you must `switch any(v).(type)`.
8. **Prefer the standard library over hand-rolled generics** — the standard `slices`, `maps`, and `cmp` packages cover most `Map`/`Filter`/`Contains`/`Keys`/sort needs. Don't reinvent `slices.Contains` or `cmp.Ordered`.

## Constructs (keyword-directed)

- `func F[T any](...)` / `func F[T, U any](...)` — type params on functions/free funcs and on types, never on methods (compile error). A method's `T` must come from its receiver type.
- Constraints: `any` (store/move only), `comparable` (`==`/`!=`, map keys — **slices/maps/funcs are NOT comparable**), `cmp.Ordered` (stdlib; `<`/`>`) — NOT `constraints.Ordered` (that's `golang.org/x/exp/constraints`, legacy). There is no stdlib `constraints` package or `Number` constraint — define a union yourself.
- `~int` (approximation) — matches `int` *and* any defined type with underlying `int` (e.g. `type MyInt int`). Plain `int` in a union rejects `MyInt`. Use `~` for domain types.
- Union constraint (`int | string`, or numeric-kind unions) — restricts instantiation only; inside the body you get operations common to *all* members. To act per-type, `switch any(v).(type)`. No operator overloading, no sum types.
- Generic containers (`type Stack[T any] struct{...}`, `Pair[T,U]`, `Result[T]`) — return zero value on empty via `var zero T`. Methods carry `T` from the receiver.
- Generic interface: `type Container[T any] interface { Add(T); ... }` — element type flows into the interface; implementers stay non-generic in signature.
- `Map`/`Filter`/`Reduce`/`Keys`/`Values`/`Find`/`Contains`/`Unique` — prefer stdlib `slices`/`maps`/`cmp` before hand-rolling. Set membership via `map[T]struct{}` needs `T comparable`.
- Type inference: write `Max(10, 20)`, not `Max[int](10, 20)`. Explicit type args needed mainly when a type appears only in results, not params (e.g. `Map[int, string](...)` when the mapper's output type can't be inferred from args alone).
- Generic channel helpers (`Merge[T](...<-chan T) <-chan T`, `Stage[T,U]`) — same ownership/closing/`ctx.Done()` rules as concurrency.md; the generics add nothing to lifecycle safety.

## Decision Tables

### Generics vs `interface{}`/`any` vs code generation

| Situation | Choose | Why |
| --- | --- | --- |
| Same logic, only the type varies; type safety matters | **Generics** | Compile-time type checking, no assertions, no boxing |
| Callers vary by *behavior*, not just type | **Interface** | Behavior abstraction is what interfaces are for; simpler and idiomatic |
| You genuinely need to hold heterogeneous values (mixed types in one slot) | **`any`** | Generics can't express "a slice of different types" |
| Need specialized code per concrete type (e.g. SIMD, layout) | **Code generation** (`go:generate`) | Generics share one body; codegen emits distinct optimized code |
| Standard operation on slices/maps (contains, sort, keys) | **`slices` / `maps` / `cmp`** | Already generic, tested, and maintained — don't re-implement |

### Generic function vs method

| Need | Choose | Note |
| --- | --- | --- |
| Type parameter introduced at the operation | **Generic function** `func F[T any](...)` | Methods *cannot* declare their own type parameters (compile error) |
| Operation tied to a generic container's element type | **Method on a generic type** `func (s *Stack[T]) Push(T)` | The `T` comes from the receiver, not the method |
| Need to satisfy an interface | **Method** (non-generic signature) | Interface methods can't be generic either; design around the receiver |

### Constraint selection

| You want to... | Constraint | Notes |
| --- | --- | --- |
| Accept literally any type, but only move/store it | `any` | Body can't compare, order, or do arithmetic |
| Compare with `==` / `!=` (map keys, `Find`, `Unique`) | `comparable` | Works for all comparable types; **slices/maps/funcs are not comparable** and won't satisfy it |
| Order with `<`, `>`, `<=`, `>=` (min/max/sort) | `cmp.Ordered` (stdlib) | Older code used `constraints.Ordered` from `golang.org/x/exp/constraints` |
| Numeric arithmetic across int/float kinds | custom union (e.g. `~int \| ~float64 \| ...`) | No stdlib "Number" constraint; define your own or use `x/exp/constraints` |
| Accept named/defined types over a base kind | union with `~` (`~int`) | `~int` matches `MyInt`; plain `int` does not |
| Restrict to a fixed small set of types | union (`string \| int`) | Body is limited to operations common to all members |
| Require specific methods | interface constraint (`interface{ String() string }`) | Same syntax as ordinary interfaces |

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Generifying code that has only one concrete type | Keep it concrete; generalize on the third real duplication |
| Declaring a type parameter on a method (`func (r R) F[T any]()`) | Not allowed in Go — put `T` on the receiver type or use a free function |
| Using `any` then needing `==`/`<` inside the body (compile error) | Tighten the constraint to `comparable` or `cmp.Ordered` |
| `comparable` constraint, then passing slices/maps/funcs | Those are not comparable; redesign the key or use a hashable proxy |
| Plain `int` union rejecting a defined type like `MyInt` | Use `~int` so the underlying type matches |
| Expecting a union constraint to allow per-type operations in the body | The body only sees operations common to all members; use `switch any(v).(type)` to branch |
| Writing `Max[int](a, b)` everywhere | Drop the explicit type argument; let inference resolve it |
| Re-implementing `Contains`, `Keys`, `Map`, `Sort` by hand | Use `slices`, `maps`, `cmp` before writing your own |
| Importing `"constraints"` as if it were stdlib | There is no stdlib `constraints` package; it's `golang.org/x/exp/constraints`. For ordering, prefer stdlib `cmp.Ordered` |
| Over-constraining so callers can't pass valid types | Constrain to exactly the operations the body uses — no more |

## Checklist

Before introducing a generic, answer:

- [ ] **Is there real duplication today?** — at least two or three concrete versions differing only by type
- [ ] **Would an interface be simpler?** — if callers vary by behavior, prefer an interface
- [ ] **Does the standard library already cover it?** — check `slices`, `maps`, `cmp` first
- [ ] **Is the constraint as narrow as the body requires?** — `any` vs `comparable` vs `cmp.Ordered` vs a method/union constraint
- [ ] **Does the body actually use what the constraint promises?** — over-constraining blocks valid callers
- [ ] **Should `~` be used?** — needed to accept defined types over a base kind
- [ ] **Can type inference resolve call sites?** — if not, are explicit type arguments truly unavoidable?
- [ ] **Is a method trying to declare its own type parameter?** — move it to the receiver type or a free function

## Cross-References

- See [interfaces.md](interfaces.md) for choosing interfaces over generics when callers vary by behavior, and for interface-as-constraint design.
- See [concurrency.md](concurrency.md) for the goroutine/channel patterns underlying the generic `Merge`/`Stage` examples above (ownership, closing, `ctx.Done()`).
- See [testing.md](testing.md) for table-driven testing of generic functions across multiple type instantiations.
- [Go: Tutorial — Getting started with generics](https://go.dev/doc/tutorial/generics)
- [Go blog: An Introduction to Generics](https://go.dev/blog/intro-generics)
- [Go blog: When To Use Generics](https://go.dev/blog/when-generics)
- [`slices` package](https://pkg.go.dev/slices) · [`maps` package](https://pkg.go.dev/maps) · [`cmp` package](https://pkg.go.dev/cmp)

## Quick Reference

| Feature | Syntax | Use Case |
|---------|--------|----------|
| Basic generic | `func F[T any]()` | Any type |
| Constraint | `func F[T Constraint]()` | Restricted types |
| Multiple params | `func F[T, U any]()` | Multiple type variables |
| Comparable | `func F[T comparable]()` | Types supporting `==` and `!=` |
| Ordered | `func F[T cmp.Ordered]()` | Types supporting `<`, `>`, `<=`, `>=` (older code uses `constraints.Ordered`) |
| Union | `T interface{ int \| string }` | Either type |
| Approximate | `~int` | Include defined types whose underlying type is `int` |
| Built-in min/max | `min(a, b)`, `max(a, b)` | Ordered values, no helper needed |
| Built-in clear | `clear(m)`, `clear(s)` | Empty a map / zero a slice |
| Stdlib helpers | `slices.Contains`, `maps.Keys`, `slices.Sort` | Prefer over hand-rolled generics |
