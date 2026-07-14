# Rust Design Patterns

Rust-specific design patterns. Rust's patterns differ from traditional object-oriented ones because of its strong type system and borrow checker. Patterns are organised by category: behavioural, creational, structural, and FFI.

## When to use

- Choosing a pattern for a specific problem (command interface, tree traversal, complex construction)
- Translating an object-oriented pattern into idiomatic Rust
- Weighing trade-offs between multiple pattern options
- Designing safe Rust APIs that wrap FFI libraries

## Behavioural Patterns

### Command

Encapsulate a request as an object. Define a trait representing an action (e.g., `fn execute(&self)`) and implement it for concrete commands.

**Trade-off**: Dynamic dispatch overhead if using trait objects. Prefer enums or generics when the set of commands is small and known at compile time.

### Interpreter

Represent a grammar as a set of types with an `interpret` method. Each non-terminal becomes a struct or enum variant. Rust's enums make this natural, as pattern matching replaces virtual dispatch.

**Trade-off**: Can become slow for complex grammars; consider parser generators for performance-critical code.

### Newtype

Create a distinct type that wraps another type to provide additional behaviour or enforce invariants (e.g., `struct Meters(f64);`).

**Trade-off**: Slight verbosity — you need explicit conversions or trait implementations to access the inner value.

### RAII with Guards

Implement a guard type that acquires a resource in its constructor and releases it in its `Drop` implementation (e.g., `std::sync::MutexGuard`).

**Trade-off**: Be careful not to hold guards longer than necessary, as this can lead to deadlocks.

### Strategy (Policy)

Define a family of algorithms, encapsulate each one in a type, and make them interchangeable at runtime. Strategies can be traits or closures.

**Trade-off**: Trait objects (`Box<dyn Strategy>`) add dynamic dispatch cost; enums or generics eliminate this overhead but make runtime swapping harder.

### Visitor

Separate an algorithm from the data structure it operates on by defining a visitor trait with methods for each variant.

**Trade-off**: Less common in Rust because enums and pattern matching often suffice. Consider only when you need double dispatch or extension without modifying the data structure.

## Creational Patterns

### Builder

Construct a complex object step by step. Separate `XBuilder` struct holds `Option<Field>`s; consuming chained setters (`fn name(mut self, ..) -> Self`) return `self`; `build(self) -> Result<X, _>` validates required fields (`.ok_or(..)?`) and applies defaults (`.unwrap_or(..)`).

**Trade-off**: Extra code and types; simple structs rarely need a builder — prefer `Default` + struct-update syntax for optional-only fields.

### Fold

Generalises iterator `fold`: define a trait that knows how to combine items into a result, and implement it for various strategies.

**Trade-off**: Risk of over-abstraction; sometimes a simple loop or built-in iterator methods suffice.

## Structural Patterns

### Struct Decomposition for Independent Borrowing

Destructure a struct into its fields using pattern matching to borrow different parts simultaneously.

**Trade-off**: Exposes internal details; use methods instead when you want to encapsulate fields.

### Prefer Small Crates

Breaking your project into small crates encourages clear boundaries and reusability. Smaller crates compile faster and can be tested in isolation.

**Trade-off**: Managing crate dependencies and versioning. Split only when modules have a well-defined API and are likely to be reused.

### Contain Unsafety in Small Modules

Keep `unsafe` code isolated within small, well-tested modules and expose safe APIs to the rest of your codebase. Document invariants and assumptions.

**Trade-off**: Spreading unsafe code throughout your project makes it harder to audit and increases the risk of undefined behaviour.

### Custom Traits to Avoid Complex Type Bounds

Define a custom trait that encapsulates required behaviour and implement it for relevant types, reducing boilerplate in signatures.

**Trade-off**: Extra abstraction layer; may not be worth it for simple cases.

## FFI Patterns

### Object-Based APIs

Wrap raw pointers from C libraries in opaque Rust types. The Rust type owns the pointer and implements `Drop` to free it when the object goes out of scope.

**Trade-off**: Additional boilerplate and the risk of forgetting to implement `Drop` properly.

### Type Consolidation into Wrappers

Consolidate multiple parameters or function calls into higher-level wrappers that enforce invariants. For example, if a C API requires initialising and freeing a handle, create a struct that performs both steps in its constructor and destructor.

**Trade-off**: Reduces user error but can hide flexibility; provide escape hatches when necessary.
