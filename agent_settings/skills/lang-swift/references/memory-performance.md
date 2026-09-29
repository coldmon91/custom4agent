# Memory & Performance

## ARC & Reference Kinds
- `strong` (default) — keeps target alive. Two objects strongly referencing each other = retain cycle (leak); ARC never runs `deinit`.
- `weak var` — optional, auto-niled on dealloc, does NOT keep target alive. Use for delegates, parent back-references, any reference that may outlive its target.
- `unowned` — non-optional, does NOT keep alive, assumes target outlives self. Crashes on access after target is freed. Use only when lifetime is strictly guaranteed (e.g. `CreditCard.customer` where customer always outlives card).
- Decision: cycle where the reference can go nil / outlive → `weak`. Cycle where target is guaranteed to outlive → `unowned` (faster, no optional). Unsure → `weak`.

## Capture Lists in Closures
- `[weak self]` — for escaping closures stored on `self` (network callbacks, timers, Combine sinks) to break the closure→self cycle. Then `guard let self else { return }`.
- `[unowned self]` — only when the closure provably cannot outlive `self`; crashes otherwise.
- `[value]` — capture a snapshot by value (e.g. `[identifier]`) instead of capturing `self` just to read one property.
- Gotcha: non-escaping closures (most `map`/`filter`, sync callbacks) don't need a capture list — no cycle risk.

## Value vs Reference Types
- `struct`/`enum` (value semantics) — default choice; copied on assignment, no ARC overhead, no sharing surprises.
- `class` (reference semantics) — when you need identity, shared mutable state, inheritance, or deinit.
- Copy-on-write: Swift's `Array`/`Dictionary`/`Set`/`String` copy lazily — an assignment is a cheap ref bump; deep copy happens only on mutation of a shared buffer.

## Custom Copy-on-write
- Wrap a reference-type `Storage` in a struct; in mutating setters call `isKnownUniquelyReferenced(&storage)` and clone only if not unique. Use for large value types with heap-backed storage to avoid needless copies.

## Performance
- `lazy var` — defer expensive one-time computation until first access. Not thread-safe; don't use on types touched concurrently.
- Prefer arrays of structs over arrays of classes for hot data — contiguous memory, no pointer chasing / ARC per element.
- `reserveCapacity(n)` before a known-size append loop to avoid repeated reallocations.
- Build strings via `map{}.joined()` or `reserveCapacity` + `append`, never `+=` in a loop (allocates each time).

## Collection Choice
- `ContiguousArray<T>` — for perf-critical numeric/struct data; avoids bridging overhead of `Array` with class/`@objc` elements.

## Profiling & Memory Pressure
- `os_signpost(.begin/.end, ...)` with an `OSLog` — mark intervals for Instruments Time Profiler / Points of Interest.
- `autoreleasepool { }` around each iteration of a memory-heavy loop (esp. Foundation/`@objc` temporaries) to release per-iteration instead of at loop end.
- On iOS, observe `UIApplication.didReceiveMemoryWarningNotification` to flush caches; remove the observer in `deinit`.
- Directive: always measure with Instruments (Allocations, Leaks, Time Profiler) before optimizing.

## Optimization Attributes & Flags
- `@inlinable` — expose a function body across module boundaries for cross-module inlining (public API perf); locks the impl into your ABI.
- `@inline(__always)` — force inline a tiny hot function. `@inline(never)` — keep out of inlining (clearer stack traces / debugging).
- `@_specialize(where T == Int)` — underscore/experimental; generate a monomorphized version of a generic. Use only if profiling proves generic dispatch is the bottleneck.
