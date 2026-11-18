# Template Metaprogramming

## Variadic Templates & Fold Expressions (C++17)

- Fold expression `(args + ...)` / `(... op args)` — prefer over recursive variadic
  unpacking for pack reductions; no recursion, better error messages.
- `sizeof...(Args)` for pack size; `std::forward<Args>(args)...` to preserve value category.
- Recursive variadic only when per-element logic differs by position.

## Compile-Time Branching (C++17+)

- `if constexpr` — prefer over `std::enable_if` / tag dispatch for type-based branching;
  discarded branch is not instantiated.
- `std::enable_if_t` / SFINAE — legacy; use only when targeting pre-C++17 or for
  overload-set removal that `if constexpr` can't express. In C++20 prefer concepts.
- Detection idiom (`std::void_t` + `std::declval`) — pre-C++20 member/expression detection;
  in C++20 replace with a `requires` expression.

## Type Traits

- Prefer standard `<type_traits>` (`std::conditional_t`, `std::decay_t`, `std::remove_*`)
  before custom. Custom trait = recursive partial specialization + `_t` / `_v` alias.

## CRTP — Static Polymorphism

- `class D : Base<D>` with `static_cast<D*>(this)` — compile-time dispatch, no vtable.
- Use for zero-overhead mixins / interfaces when the type is known at compile time.
- C++23 alternative: "deducing this" (`this auto&& self`) removes much CRTP boilerplate —
  prefer it when C++23 is available.

## Template Template Parameters

- `template<typename, typename> class Container` — abstract over container *kind*
  (`std::vector` / `std::deque` / `std::list`), not just element type.

## Compile-Time Computation

- `constexpr` functions, `constexpr auto` results; `consteval` to force compile-time.
  Push table generation / validation to compile time when inputs are static.

## Expression Templates

- Lazy-evaluate operator chains (`a = b + c + d`) to eliminate temporaries. High
  complexity — reach for it only in numeric/matrix hot paths where temporaries dominate;
  otherwise prefer ranges/views or a library (Eigen).
