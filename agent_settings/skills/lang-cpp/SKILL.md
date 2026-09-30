---
name: lang-cpp
description: Use whenever writing, modifying, reviewing, or debugging C++ code — any `.cpp`, `.cc`, `.cxx`, `.h`, or `.hpp` file, or a CMake project — even for a one-line edit. Covers modern C++17/20/23 (concepts, ranges, coroutines), RAII and memory management, template metaprogramming, concurrency and data races, SIMD and performance bottlenecks, and CMake build configuration.
license: MIT
metadata:
  author: https://github.com/Jeffallan
---

# C++

Match the standard the project's build already targets; use newer features only when the toolchain supports them.

## Rules

- RAII for every resource; no raw `new` / `delete`. `std::unique_ptr` by default, `std::shared_ptr` only for genuinely shared ownership
- Braces on every `if`
- Const-correct code; `static_cast` and friends, never C-style casts
- Constrain templates with concepts (C++20) instead of SFINAE / `enable_if`
- Resource-owning types get `noexcept` move operations (Rule of Five, or `= default` when members suffice)
- One error strategy per module — exceptions or `std::expected` / error codes, not mixed
- Shared mutable state lives in a lock-owning wrapper so unlocked access cannot compile (see `references/concurrency.md`)
- No `using namespace std` in headers
- Treat undefined behavior as a bug, even when it "works"

## Validate before finishing

- Build with `-Wall -Wextra -Wpedantic` (MSVC `/W4`) and fix every warning
- Run tests under ASan + UBSan; TSan for concurrent code — fix every report before proceeding
- clang-tidy with the repo's `.clang-tidy` when present
- Optimize only after profiling real workloads, then re-measure

## References

| Topic | File | Load when |
|-------|------|-----------|
| Modern C++ | `references/modern-cpp.md` | Concepts, ranges, coroutines, `<=>`, modules, `std::expected` / `std::print` |
| Templates | `references/templates.md` | Variadic templates, `if constexpr`, SFINAE, type traits, CRTP |
| Memory & Performance | `references/memory-performance.md` | Smart pointers, move semantics, allocators, SIMD, cache layout |
| Concurrency | `references/concurrency.md` | Atomics, memory ordering, locks, lock-owning wrappers, thread safety analysis |
| Build & Tooling | `references/build-tooling.md` | CMake, sanitizers, static analysis, GoogleTest |
