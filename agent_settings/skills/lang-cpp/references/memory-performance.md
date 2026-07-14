# Memory Management & Performance

Keyword-directed guidance. Names the technique + the decision rule. Exact numeric
constants that matter (alignment, SIMD width) are kept literal.

## Smart Pointers

- `std::make_unique` — default for exclusive ownership; `std::make_shared` only when
  ownership is genuinely shared (single allocation for control block + object).
- `std::weak_ptr` to break `shared_ptr` cycles; `std::enable_shared_from_this` when an
  object must hand out `shared_ptr` to itself — never construct a second `shared_ptr`
  from raw `this` (double-free).
- Custom deleter (lambda + `unique_ptr<T, D>`) to wrap C handles (`FILE*`, fd, mutex).

## Move Semantics — Rule of Five

- Define move ctor / move assignment `noexcept` for types owning resources — `noexcept`
  lets `std::vector` move instead of copy on reallocation.
- Prefer `= default` when members are individually movable; hand-write only for raw
  owned pointers. `std::exchange(other.ptr, nullptr)` is the concise steal-and-null idiom.
- Perfect forwarding: `T&&` + `std::forward<T>(arg)` preserves lvalue/rvalue category.

## Custom Allocators

- Pool allocator (fixed-size free list) — high-frequency same-size alloc/dealloc.
- Arena / bump allocator (`std::align` + offset, bulk `reset()`) — many short-lived objects
  freed together; no per-object deallocation.
- Use `std::pmr` (`monotonic_buffer_resource`, `pool_resource`) before hand-rolling —
  standard, composable, and container-aware.

## SIMD

- x86: `<immintrin.h>` AVX2 processes **8 floats** per `__m256`; use `_mm256_loadu_ps`
  (unaligned) unless data is 32-byte aligned. FMA: `_mm256_fmadd_ps`.
- Always handle the scalar tail (`size % 8`). Prefer compiler auto-vectorization
  (`-O3 -march=native`) + `std::experimental::simd` / library before hand-intrinsics.

## Cache-Friendly Design

- Structure of Arrays (SoA) over Array of Structs (AoS) when hot loops touch one field
  across many elements — contiguous access, fewer cache-line loads.
- False sharing: pad per-thread atomics to a cache line — `alignas(64)`.
- `__builtin_prefetch(&data[i + N], 0, 1)` for predictable strided access on a hot loop.

## Copy Elision / RVO

- Return a local by value directly (`return vec;`) — RVO/NRVO elides the copy. Do NOT
  `return std::move(local)` (defeats NRVO, may warn).
- C++17 guarantees copy elision for prvalues — non-movable types can be returned by value.

## Alignment

- `alignas(N)` on type/variable; `alignof` / `static_assert` to verify. Aligned dynamic
  alloc: `std::aligned_alloc` (C++17) or `posix_memalign`.
- Placement `new (buf) T(...)` requires manual `obj->~T()` — no `delete`.

## Quick Reference

| Technique | Use Case | Benefit |
|-----------|----------|---------|
| Smart Pointers | Ownership management | Memory safety |
| Move Semantics | Avoid copies | Performance |
| Custom Allocators | Specialized allocation | Speed + control |
| SIMD | Parallel computation | 4-8x speedup |
| SoA Layout | Sequential access | Cache efficiency |
| Memory Pools | Frequent alloc/dealloc | Reduced fragmentation |
| Alignment | SIMD/cache optimization | Performance |
| RVO/NRVO | Return objects | Zero-copy |
