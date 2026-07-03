# Functional Programming in Rust

How functional programming techniques apply in Rust. Bridges functional principles with Rust's ownership and type systems while acknowledging when a functional approach introduces unnecessary complexity.

## When to use

- Programming paradigms in Rust (functional, imperative, object-oriented)
- Using generics to emulate type classes
- Implementing optics (lenses, prisms) for immutable data structures
- Combining functional patterns with Rust's ownership model

## Generics as Type Classes

In functional languages like Haskell, type classes define generic interfaces. In Rust, traits fill a similar role: they specify behaviour that types can implement. Using generics, you can add trait bounds to ensure that a type supports required operations, enabling functions to work on any type implementing the trait.

**Benefit**: Code reuse and abstraction.

**Trade-off**: Potentially lengthy trait bounds that clutter signatures. Consider defining a custom trait that aggregates several bounds when the list becomes unwieldy.

## Optics (Lenses and Prisms)

Optics are composable abstractions for focusing on parts of data structures:

- **Lens**: provides a getter and setter for a field
- **Prism**: focuses on a variant of an enum

In Rust, libraries such as `monocle` experiment with optics. They let you update nested immutable data structures without verbose pattern matching.

**Trade-off**: Introducing optics can make code harder to follow and adds dependency overhead. Use judiciously when dealing with deeply nested data and when the benefits of composability outweigh the complexity.

## Other Functional Techniques in Rust

### Pattern Matching

Algebraic data types via `enum` paired with `match` provide exhaustive case analysis at compile time. This eliminates entire classes of runtime errors that plague nullable references in other languages.

### Higher-Order Functions

Closures and iterators support a wide range of functional combinators: `map`, `filter`, `fold`, `flat_map`, `take_while`, etc. These compose lazily — operations are fused into a single pass when possible.

### Algebraic Data Types

Enums in Rust function as sum types, while structs and tuples serve as product types. Combined, they enable rich domain modelling: `Result<T, E>`, `Option<T>`, and custom variants encode invariants in the type system.

### Immutability by Default

Bindings are immutable unless explicitly marked `mut`. This aligns with functional programming's preference for transformation over mutation. Combined with ownership, it prevents many concurrency bugs at compile time.

## Cautions

A purely functional style can clash with Rust's ownership model. Some patterns common in Haskell or Scala — heavy use of closures capturing references, deeply nested combinators, persistent data structures — can introduce lifetime puzzles or performance overhead. Choose functional approaches when they clarify intent; fall back to imperative loops when they read more clearly.
