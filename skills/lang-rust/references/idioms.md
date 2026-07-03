# Rust Idioms

Common idiomatic guidelines that help write Rust code other developers can easily read and maintain. Highlights trade-offs and pitfalls to avoid misunderstanding.

## When to use

- Choosing between borrowed types (`&str` vs `&String`)
- Community-accepted patterns: `Default`, constructors, `Drop`, `mem::take`
- FFI conventions for strings and errors
- Idiomatic coding practices (not large architectural patterns)

## Borrowed Types for Arguments

Prefer taking references to the **borrowed type** rather than references to the **owned type**:

- `&str` instead of `&String`
- `&[T]` instead of `&Vec<T>`
- `&T` instead of `&Box<T>`

Owned types already encapsulate a level of indirection; adding a reference to the owned type introduces an extra unnecessary layer and restricts the kinds of values you can pass. Using the borrowed type lets your function accept a wider range of inputs (slices, string literals, arrays) through Rust's automatic deref coercion.

## Constructors and the `Default` Trait

Constructors are typically implemented via an associated `new` function. When a struct has sensible default values for all fields, implement the `Default` trait; then users can call `T::default()` or derive `Default`. Supplying both `new()` and `Default` gives flexibility — the former can enforce required parameters while the latter produces a baseline instance.

## Collections Are Smart Pointers

`Vec<T>`, `String`, and `Box<T>` manage heap-allocated storage. Avoid `&Vec<T>` or `&String` arguments; instead, accept slices (`&[T]`) or string slices (`&str`). This decouples your function from the specific collection type via automatic deref coercion.

## Finalisation in Destructors

Use the `Drop` trait to run clean-up code when a value goes out of scope. Rust's RAII ensures that resources such as file handles or locks are released deterministically. Implementing `Drop` encapsulates finalisation logic rather than requiring callers to manually clean up.

## `mem::take` and `mem::replace`

`std::mem::take(&mut value)` and `std::mem::replace(&mut value, new_value)` are useful when you need to move out of a field while leaving a valid value behind. They avoid partial moves and keep your data structure in a consistent state.

- `take` — swap a value with its default
- `replace` — swap a value with a provided replacement

## On-Stack Dynamic Dispatch

Trait objects are usually heap-allocated when boxed. You can avoid heap allocations by using enums or by storing trait objects within fixed-size buffers on the stack (e.g., `smallvec` or `arrayvec` crates). This keeps dynamic behaviour efficient while maintaining stack allocation.

## FFI Idioms

### Error Handling

Expose functions that return an explicit error type rather than panicking. Return a `Result` with an error code or pointer that callers can inspect. Document which values indicate success or failure and avoid using Rust panics across the FFI boundary.

### Accepting and Returning Strings

FFI functions should accept strings as pointers and lengths rather than C-style null-terminated strings. On the Rust side, convert pointers into `&[u8]` or `&str` safely using `std::slice::from_raw_parts`. For functions that return strings to the foreign caller, allocate memory using the foreign language's allocator or expose a Rust function to free the returned buffer. Avoid using `String` directly across FFI boundaries since its layout is not guaranteed to be compatible.

### Passing Complex Types

Limit the types passed across the FFI boundary to primitives, pointers, or opaque handles. For complex types, wrap them in a struct with `#[repr(C)]` and provide accessor functions. This avoids undefined behaviour due to different layouts between languages.
