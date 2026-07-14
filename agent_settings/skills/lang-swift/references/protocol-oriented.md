# Protocol-Oriented Programming

## Protocols vs Class Inheritance
- Prefer protocols + value types over base-class inheritance for abstraction — composable, no forced reference semantics, works with structs/enums.
- Reach for a base class only when you need shared stored state, identity, or `deinit`.

## Protocol Extensions (default impls)
- `extension SomeProtocol { func x() {...} }` — provide default implementations so conformers get behavior for free.
- Gotcha (static dispatch): a method defined ONLY in the extension (not in the protocol requirement list) dispatches statically by the variable's declared type — a conformer's override won't be called through a protocol-typed reference. To get dynamic dispatch, declare the method in the protocol body.

## Associated Types, `some` vs `any`
- `associatedtype` — for generic protocols (`Container`/`DataSource`). A protocol with associated types (PAT) can't be used as a bare existential type without a primary-associated-type or type erasure.
- `some P` (opaque) — one concrete, compiler-known type; zero-cost, preserves type identity. Prefer for return types where the caller doesn't need the concrete type. Also `func f(x: some P)` = shorthand generic.
- `any P` (existential) — a boxed value; heterogeneous storage but has runtime cost (dynamic dispatch + possible heap box). Use only when you genuinely need to store mixed conforming types.
- Directive: default to `some`; use `any` only when you must hold different concrete types in one variable/collection.
- Primary associated types (Swift 5.7+): `protocol DataSource<Element>` lets you write `some DataSource<Int>` / `any DataSource<Int>` — prefer over full type erasure.

## Type Erasure
- Hand-rolled `AnyStorage<T>` (capture the conformer's methods as closures in an `init<S: Storage>`) — only needed to store a PAT-based protocol as a concrete type when primary-associated-types don't suffice.
- Cost: erasure adds an indirection/box per call. In SwiftUI, `AnyView` erases view type but defeats structural diffing — avoid unless required; prefer `@ViewBuilder` / `some View`.

## Composition & Constraints
- `Named & Aged` — compose small protocols instead of one fat protocol; usable in `typealias`, `some`/`any`, and generic constraints.
- `<T: Codable & Hashable>` — multiple constraints on a generic parameter.

## Conditional Conformance
- `extension Array: P where Element: P` — conform a generic type only when its element/param conforms. Standard pattern for making containers `Equatable`/`Hashable`/`Codable` when contents are.

## Protocol Inheritance
- `protocol Entity: Identifiable, Timestampable` — layer protocols to build richer requirements from smaller ones.

## Advanced
- Phantom types: an unused generic param (`Temperature<Celsius>`) to encode units/state in the type system and block invalid conversions at compile time.
- Retroactive conformance: `extension Int: Identifiable {}` to conform a type you don't own. Swift 6 warns without `@retroactive`; only do it for types+protocols you both control-ish, as two modules adding the same conformance collide.

## Best Practices
- Protocols over base classes; single-responsibility, small, composed protocols.
- `some` for implementation hiding; `any`/type erasure only when storing mixed types.
- Declare a method in the protocol body (not just the extension) when conformers must be able to override it.
