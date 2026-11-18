# Swift

> Adapted from https://github.com/Jeffallan (MIT License).

## Rules

- No force unwrap (`!`), `try!`, or implicitly unwrapped optionals without a justifying comment — use `guard let`, `??`, or `throws`
- Value types (`struct` / `enum`) by default; `class` only for identity, shared mutable state, or `deinit`
- Protocols + extensions over base-class inheritance
- `async`/`await` for new async code; wrap a completion-handler API in a continuation only when no native async version exists
- Mutable shared state in an `actor`, UI code on `@MainActor` — not manual locks or `DispatchQueue`
- Treat actor-isolation and `Sendable` warnings as errors; don't silence them with `@unchecked Sendable`
- `@Observable` (iOS 17+ / macOS 14+) for view models; `ObservableObject` only for back-deployment
- `[weak self]` in escaping closures stored by `self`
- Follow the Swift API Design Guidelines; document public APIs with `///`
- Profile with Instruments before optimizing

## Validate before finishing

- `swift build -Xswiftc -warnings-as-errors` (or the Xcode scheme build) — surfaces isolation and `Sendable` issues
- `swift test`, or `xcodebuild test -scheme <Scheme> -destination '<destination>'` for app targets

## References

| Topic | File | Load when |
|-------|------|-----------|
| SwiftUI | `references/swiftui-patterns.md` | Property wrappers, `@Observable`, view composition, `.task`, body performance |
| Concurrency | `references/async-concurrency.md` | async/await, actors and reentrancy, task groups, `Sendable`, continuations |
| Protocols | `references/protocol-oriented.md` | Extension dispatch, `some` vs `any`, associated types, type erasure |
| Memory | `references/memory-performance.md` | ARC, weak/unowned, capture lists, copy-on-write, collection performance |
| Testing | `references/testing-patterns.md` | Swift Testing vs XCTest, async tests, test doubles, `xcodebuild test` |
