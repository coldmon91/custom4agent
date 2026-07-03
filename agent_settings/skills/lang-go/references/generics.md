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

## Basic Type Parameters

```go
package main

// Generic function with type parameter
func Max[T constraints.Ordered](a, b T) T {
    if a > b {
        return a
    }
    return b
}

// Multiple type parameters
func Map[T, U any](slice []T, fn func(T) U) []U {
    result := make([]U, len(slice))
    for i, v := range slice {
        result[i] = fn(v)
    }
    return result
}

// Usage
func main() {
    maxInt := Max(10, 20)           // T = int
    maxFloat := Max(3.14, 2.71)     // T = float64
    maxString := Max("abc", "xyz")  // T = string

    nums := []int{1, 2, 3}
    doubled := Map(nums, func(n int) int { return n * 2 })
    strings := Map(nums, func(n int) string { return fmt.Sprintf("%d", n) })
}
```

## Type Constraints

```go
import "constraints"

// Built-in constraints
type Number interface {
    constraints.Integer | constraints.Float
}

func Sum[T Number](numbers []T) T {
    var total T
    for _, n := range numbers {
        total += n
    }
    return total
}

// Custom constraints with methods
type Stringer interface {
    String() string
}

func PrintAll[T Stringer](items []T) {
    for _, item := range items {
        fmt.Println(item.String())
    }
}

// Approximate constraint using ~
type Integer interface {
    ~int | ~int8 | ~int16 | ~int32 | ~int64
}

type MyInt int

func Double[T Integer](n T) T {
    return n * 2
}

// Works with both int and MyInt
func main() {
    fmt.Println(Double(5))          // int
    fmt.Println(Double(MyInt(5)))   // MyInt
}
```

## Generic Data Structures

```go
// Generic Stack
type Stack[T any] struct {
    items []T
}

func NewStack[T any]() *Stack[T] {
    return &Stack[T]{
        items: make([]T, 0),
    }
}

func (s *Stack[T]) Push(item T) {
    s.items = append(s.items, item)
}

func (s *Stack[T]) Pop() (T, bool) {
    if len(s.items) == 0 {
        var zero T
        return zero, false
    }
    item := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return item, true
}

func (s *Stack[T]) IsEmpty() bool {
    return len(s.items) == 0
}

// Usage
intStack := NewStack[int]()
intStack.Push(1)
intStack.Push(2)

stringStack := NewStack[string]()
stringStack.Push("hello")
stringStack.Push("world")
```

## Generic Map Operations

```go
// Filter with generics
func Filter[T any](slice []T, predicate func(T) bool) []T {
    result := make([]T, 0, len(slice))
    for _, v := range slice {
        if predicate(v) {
            result = append(result, v)
        }
    }
    return result
}

// Reduce/Fold
func Reduce[T, U any](slice []T, initial U, fn func(U, T) U) U {
    acc := initial
    for _, v := range slice {
        acc = fn(acc, v)
    }
    return acc
}

// Keys from map
func Keys[K comparable, V any](m map[K]V) []K {
    keys := make([]K, 0, len(m))
    for k := range m {
        keys = append(keys, k)
    }
    return keys
}

// Values from map
func Values[K comparable, V any](m map[K]V) []V {
    values := make([]V, 0, len(m))
    for _, v := range m {
        values = append(values, v)
    }
    return values
}

// Usage
numbers := []int{1, 2, 3, 4, 5, 6}
evens := Filter(numbers, func(n int) bool { return n%2 == 0 })

sum := Reduce(numbers, 0, func(acc, n int) int { return acc + n })

m := map[string]int{"a": 1, "b": 2}
keys := Keys(m)     // []string{"a", "b"}
values := Values(m) // []int{1, 2}
```

## Generic Pairs and Tuples

```go
// Generic Pair
type Pair[T, U any] struct {
    First  T
    Second U
}

func NewPair[T, U any](first T, second U) Pair[T, U] {
    return Pair[T, U]{First: first, Second: second}
}

func (p Pair[T, U]) Swap() Pair[U, T] {
    return Pair[U, T]{First: p.Second, Second: p.First}
}

// Usage
pair := NewPair("name", 42)
swapped := pair.Swap() // Pair[int, string]

// Generic Result type (like Rust's Result<T, E>)
type Result[T any] struct {
    value T
    err   error
}

func Ok[T any](value T) Result[T] {
    return Result[T]{value: value}
}

func Err[T any](err error) Result[T] {
    return Result[T]{err: err}
}

func (r Result[T]) IsOk() bool {
    return r.err == nil
}

func (r Result[T]) Unwrap() (T, error) {
    return r.value, r.err
}

func (r Result[T]) UnwrapOr(defaultValue T) T {
    if r.err != nil {
        return defaultValue
    }
    return r.value
}
```

## Comparable Constraint

```go
// Find using comparable
func Find[T comparable](slice []T, target T) (int, bool) {
    for i, v := range slice {
        if v == target {
            return i, true
        }
    }
    return -1, false
}

// Contains
func Contains[T comparable](slice []T, target T) bool {
    _, found := Find(slice, target)
    return found
}

// Unique elements
func Unique[T comparable](slice []T) []T {
    seen := make(map[T]struct{})
    result := make([]T, 0, len(slice))

    for _, v := range slice {
        if _, exists := seen[v]; !exists {
            seen[v] = struct{}{}
            result = append(result, v)
        }
    }

    return result
}

// Usage
nums := []int{1, 2, 2, 3, 3, 4}
unique := Unique(nums) // []int{1, 2, 3, 4}

idx, found := Find([]string{"a", "b", "c"}, "b") // 1, true
```

## Generic Interfaces

```go
// Generic interface
type Container[T any] interface {
    Add(item T)
    Remove() (T, bool)
    Size() int
}

// Implementation
type Queue[T any] struct {
    items []T
}

func (q *Queue[T]) Add(item T) {
    q.items = append(q.items, item)
}

func (q *Queue[T]) Remove() (T, bool) {
    if len(q.items) == 0 {
        var zero T
        return zero, false
    }
    item := q.items[0]
    q.items = q.items[1:]
    return item, true
}

func (q *Queue[T]) Size() int {
    return len(q.items)
}

// Function accepting generic interface
func ProcessContainer[T any](c Container[T], item T) {
    c.Add(item)
    fmt.Printf("Container size: %d\n", c.Size())
}
```

## Type Inference

```go
// Type inference works in most cases
func Identity[T any](x T) T {
    return x
}

// No need to specify type
result := Identity(42)          // T inferred as int
str := Identity("hello")        // T inferred as string

// Type inference with constraints
func Min[T constraints.Ordered](a, b T) T {
    if a < b {
        return a
    }
    return b
}

// Inferred from arguments
minVal := Min(10, 20)           // T = int
minFloat := Min(1.5, 2.5)       // T = float64

// Explicit type when needed
result := Map[int, string]([]int{1, 2}, func(n int) string {
    return fmt.Sprintf("%d", n)
})
```

## Generic Channels

```go
// Generic channel operations
func Merge[T any](channels ...<-chan T) <-chan T {
    out := make(chan T)
    var wg sync.WaitGroup

    for _, ch := range channels {
        wg.Add(1)
        go func(c <-chan T) {
            defer wg.Done()
            for v := range c {
                out <- v
            }
        }(ch)
    }

    go func() {
        wg.Wait()
        close(out)
    }()

    return out
}

// Generic pipeline stage
func Stage[T, U any](in <-chan T, fn func(T) U) <-chan U {
    out := make(chan U)
    go func() {
        defer close(out)
        for v := range in {
            out <- fn(v)
        }
    }()
    return out
}

// Usage
ch1 := make(chan int)
ch2 := make(chan int)

merged := Merge(ch1, ch2)

numbers := make(chan int)
doubled := Stage(numbers, func(n int) int { return n * 2 })
strings := Stage(doubled, func(n int) string { return fmt.Sprintf("%d", n) })
```

## Union Constraints

```go
// Union of types
type StringOrInt interface {
    string | int
}

func Process[T StringOrInt](val T) string {
    return fmt.Sprintf("%v", val)
}

// More complex unions
type Numeric interface {
    int | int8 | int16 | int32 | int64 |
    uint | uint8 | uint16 | uint32 | uint64 |
    float32 | float64
}

func Abs[T Numeric](n T) T {
    if n < 0 {
        return -n
    }
    return n
}

// Union with methods
type Serializable interface {
    string | []byte
}

func Serialize[T Serializable](data T) []byte {
    switch v := any(data).(type) {
    case string:
        return []byte(v)
    case []byte:
        return v
    default:
        panic("unreachable")
    }
}
```

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
