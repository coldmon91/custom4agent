# Traits, Generics, and Type System

## Core decisions

- **Generics / `impl Trait` vs `dyn Trait`:** default to generics (monomorphized, inlinable). Use `dyn` only for heterogeneous collections, code-size reduction, or plugin/ABI boundaries — it costs a vtable indirection and blocks inlining. Prefer an enum when the set of variants is closed and known.
- **Associated type vs generic parameter:** associated type when there is exactly one logical impl per type (`Iterator::Item`); generic parameter when a type implements the trait for many parameters (`From<T>`, `Add<Rhs>`).
- Keep traits small and single-purpose; a fat trait is hard to implement and to keep `dyn`-compatible.

## Object safety (dyn-compatibility)

- Broken by: generic methods, `self` by value (without `Self: Sized`), returning `Self`, native `async fn`, and return-position `impl Trait`.
- Fix: `where Self: Sized` on the offending method, or split the trait.

## Bounds and coherence

- Switch to a `where` clause once bounds get long; it is required for bounds on associated types (`where T::Item: Display`). For bound lists repeated everywhere, define a custom trait that aggregates them.
- **Orphan rule:** `impl Trait for Type` requires your crate to own the trait or the type. For a foreign trait on a foreign type, use a newtype.
- **Blanket impls** (`impl<T: Display> MyTrait for T`) are a permanent commitment — removing or narrowing one is a breaking change.

## Standard traits

- Derive freely: `Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord`. `Copy` only for small plain-data types.
- `Debug` on every public type; `Default` when a sensible zero-config value exists — prefer `Default` + struct-update syntax over a builder when all fields are optional.
- Implement `From` (you get `Into` for free); accept `impl Into<T>` in constructors. Fallible conversion → `TryFrom`, never `as`.
- Keep operator overloads (`std::ops`) unsurprising.
- Don't use `Deref` on a wrapper to emulate inheritance — implicit method resolution surprises callers. Implement the needed traits or `AsRef` explicitly.

## Trait design patterns

- **Extension trait:** add methods to a foreign type (`impl MyExt for str`).
- **Sealed trait:** public trait with a private `sealed::Sealed` supertrait so downstream crates can't implement it (lets you add methods later).
- **Marker traits + `PhantomData<T>`:** compile-time-only guarantees; tie unused type params or variance to a struct.
- **GATs** (`type Item<'a> where Self: 'a;`) enable lending iterators — use rarely, they complicate signatures.
- Const trait impls (`#[const_trait]`) are nightly — don't rely on them.
- Document invariants an implementor must uphold, especially for `unsafe trait`.
