# Generics

## When to use

- Write it concrete first; generalize when two or three copies differ only by type.
- Interfaces when callers vary by **behavior**; generics for containers and algorithms where only the **type** varies; `any` only for genuinely heterogeneous values; `go:generate` when each type needs specialized code.
- Check stdlib `slices`, `maps`, `cmp` and builtins `min` / `max` / `clear` before hand-rolling `Contains`, `Keys`, `Sort`, `Map`.

## Rules and gotchas

- Methods cannot declare their own type parameters (compile error) — put `T` on the receiver type (`func (s *Stack[T]) Push(v T)`) or use a free function.
- Constrain exactly as tightly as the body needs:
  - `any` — store/move only
  - `comparable` — `==`, map keys; **slices, maps, funcs are not comparable**
  - `cmp.Ordered` — `<` / `>`; not `constraints.Ordered`, which is legacy `golang.org/x/exp/constraints`
  - numeric arithmetic — define your own union (`~int | ~int64 | ~float64`); there is no stdlib `constraints` package or `Number` constraint
  - method set — ordinary interface constraint (`interface{ String() string }`)
- `~int` matches defined types like `type MyInt int`; plain `int` in a union rejects them.
- A union constraint only restricts instantiation — the body gets operations common to all members. Branch per type with `switch any(v).(type)`.
- Let inference work: `Max(1, 2)`, not `Max[int](1, 2)`. Explicit type arguments are needed mainly when a type appears only in results.
- Return the zero value with `var zero T`.
