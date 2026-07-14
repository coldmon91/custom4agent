# Modern C++20/23 Features

Keyword-directed guidance. Each entry names the construct, its standard, and a
decision (prefer / avoid / gotcha) — not a tutorial. Generate the code from the
named construct; the value here is *which* to reach for and *when not to*.

## Concepts and Constraints (C++20)

- `concept` + `requires` — replace SFINAE / `enable_if`. Prefer standard concepts
  (`std::integral`, `std::floating_point`, `std::ranges::range`) before writing custom.
- Custom concept only when no standard one fits; express via `requires` clause with
  compound requirements (`{ expr } -> std::convertible_to<T>`).
- Constrain templates with concept-as-type-name (`template<Numeric T>`); use
  concept-based overloading instead of tag dispatch.

## Ranges and Views (C++20; `std::ranges::to` C++23)

- `std::views::filter / transform / take` — lazy, composable via `|`. No intermediate
  allocation until materialized.
- Gotcha: views are non-owning — never return a view over a local/temporary; it dangles.
- Materialize with `std::ranges::to<std::vector>()` (C++23); pre-C++23 use the
  iterator-pair constructor.

## Coroutines (C++20)

- Prefer `std::generator<T>` (C++23) for lazy sequences — do NOT hand-roll a
  `promise_type` generator when C++23 is available.
- Manual `promise_type` only pre-C++23 or for custom `Task`/awaiter semantics
  (`initial_suspend` / `final_suspend` / `yield_value` / `await_*`).
- Gotcha: coroutine frame is heap-allocated unless HALO elides it; owning handle must
  `destroy()` in the destructor.

## Three-Way Comparison / Spaceship (C++20)

- `auto operator<=>(const T&) const = default;` — auto-generates all relational ops.
- Custom `<=>`: return `std::strong_ordering` / `weak_ordering` / `partial_ordering`
  deliberately; still `= default` `operator==` separately (not synthesized from `<=>`).

## Designated Initializers (C++20)

- `T{ .field = val }` — must follow declaration order; cannot skip-then-return.
  Omitted members use their default member initializer.

## Modules (C++20)

- `export module name;` / `import name;` — replaces header include for new code.
- Caveat: build-system + compiler support is still uneven; confirm toolchain
  (CMake `CXX_MODULES`, compiler flag) before adopting. Header units are the fallback.

## constexpr Enhancements (C++20)

- `constexpr std::string` / `std::vector`, `constexpr` virtual functions, `consteval`
  (immediate functions), `constinit`. Push computation to compile time where inputs are static.

## std::format / std::print (C++20 / C++23)

- Prefer `std::print` / `std::println` (C++23) over `std::format` + `std::cout`; both over
  `printf` / iostream `<<` chains.
- Custom types: specialize `std::formatter<T>` (`parse` + `format`).

## Error Handling

- `std::expected<T, E>` (C++23) for recoverable errors — do NOT mix exceptions and error
  codes inconsistently. `std::optional` when there is no error payload.

## Quick Reference

| Feature | C++17 | C++20 | C++23 |
|---------|-------|-------|-------|
| Concepts | - | ✓ | ✓ |
| Ranges | - | ✓ | ✓ |
| Coroutines | - | ✓ | ✓ |
| Modules | - | ✓ | ✓ |
| Spaceship | - | ✓ | ✓ |
| std::format | - | ✓ | ✓ |
| std::expected | - | - | ✓ |
| std::print | - | - | ✓ |
| Deducing this | - | - | ✓ |
| std::generator | - | - | ✓ |
