# Traits, Generics, and Type System

## Core decisions

- **Generics/`impl Trait` (static dispatch) vs `dyn Trait` (dynamic dispatch):** default to generics — monomorphization gives zero-cost, inlinable calls. Reach for `dyn` (`Box<dyn Trait>`, `&dyn Trait`) only when you need a heterogeneous collection (`Vec<Box<dyn Draw>>`), want to shrink code bloat, or must cross an ABI/plugin boundary. `dyn` costs a vtable indirection and blocks inlining.
- **Associated type vs generic type parameter:** use an **associated type** when there is exactly one logical impl per type (`Iterator::Item`). Use a **generic parameter** when a type can implement the trait for many parameters (`From<T>`, `Add<Rhs>`). Associated types keep signatures clean and forbid conflicting impls.
- Default method bodies in the trait let implementors override selectively — put shared logic there.

## Object safety (dyn-compatibility)

- A trait is `dyn`-compatible only if no method is generic (`fn f<T>(&self)`), takes `self` by value (unless `Self: Sized`), or returns `Self`. Native `async fn` and `impl Trait` in return position also break it.
- Fix: add `where Self: Sized` to the offending method to exclude it from the vtable, or split the trait.

## Bounds and where clauses

- Prefer a `where` clause over inline `T: A + B` once bounds get long — it reads better and is required for bounds on associated types (`where T::Item: Display`).
- The **orphan rule:** you can `impl Trait for Type` only if your crate defines the trait or the type. To impl a foreign trait on a foreign type, use the **newtype** wrapper.
- **Blanket impl** (`impl<T: Display> MyTrait for T`) applies a trait to every type meeting a bound — powerful for extension traits, but it's a permanent commitment (removing/narrowing it is a breaking change) and can conflict with other impls.

## Standard traits to implement

- Derive freely: `#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]`. `Copy` only for small, plain-old-data types (implies `Clone`, cheap bitwise copy).
- Implement `Debug` on essentially every public type for diagnosability; `Default` when a sensible zero-config value exists.
- `From`/`Into`: implement `From`; `Into` comes free via blanket impl. Accept `impl Into<T>` in constructors for ergonomic conversions. Use `TryFrom`/`TryInto` for fallible conversions (return `Result`) — never `as` for narrowing.
- Operator overloading via `std::ops::{Add, Mul, ...}`; keep semantics unsurprising (don't make `+` do I/O).

## Trait design patterns

- **Extension trait:** add methods to a foreign type (`impl MyExt for str`) — the idiomatic way around the orphan rule for behavior.
- **Sealed trait:** a public trait bounded on a private `sealed::Sealed` supertrait prevents downstream crates from implementing it (lets you add methods later without breaking them).
- **Supertrait** (`trait Loggable: Display`): require and call another trait's methods; expresses "is-a" prerequisites.
- **Marker traits** (`Send`, `Sync`, or custom empty traits) encode compile-time-only guarantees; combine with `PhantomData<T>` to tie unused type params / variance to a struct.
- **Associated constants** (`const MAX: usize`) attach per-impl constants to a trait.

## Advanced (know they exist)

- **GATs** (`type Item<'a> where Self: 'a;`, stable since 1.65) — associated types parameterized by lifetime/type; enables lending iterators. Reach for them rarely; they complicate signatures.
- **Const trait impls** (`#[const_trait]`, `impl const`) are **nightly** — don't rely on them in production.

## Best practices

- Keep traits small and single-purpose; a fat trait is hard to implement and to make `dyn`-safe.
- Prefer static dispatch for hot paths, `dyn` for flexibility/binary size.
- Document invariants an implementor must uphold, especially for `unsafe` traits.
