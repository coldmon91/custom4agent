# SwiftUI Patterns

## State Management — Decision Matrix

| Wrapper | Use when | Ownership | Notes / gotcha |
|---|---|---|---|
| `@State` | Local, view-private value-type state | View owns it | Mark `private`. For value types (and `@Observable` refs, iOS 17+). Survives body re-runs. |
| `@Binding` | Two-way handle to state owned elsewhere | Borrowed | Pass with `$value`. No source of truth of its own. |
| `@StateObject` | View creates & owns an `ObservableObject` | View owns it | Instantiated once, survives re-renders. Use at the object's origin. |
| `@ObservedObject` | `ObservableObject` passed in from a parent | Not owned | Gotcha: re-created if the parent re-inits it — never use it to *create* the object (use `@StateObject`). |
| `@EnvironmentObject` | `ObservableObject` injected via `.environmentObject()` | Not owned | Crashes at runtime if the ancestor didn't inject it. |
| `@Environment` | System/custom environment values (`\.theme`, `\.dismiss`) | Not owned | Also how you read `@Observable` objects placed via `.environment()` (iOS 17+). |

## @Observable macro (iOS 17+)
- `@Observable` class replaces `ObservableObject` + `@Published`. Drop the property wrappers; observation is automatic and per-property (only views reading a changed field re-render → fewer invalidations).
- Ownership mapping: `@StateObject` → `@State`; `@ObservedObject`/plain passed-in → plain `let`/`var`; `@EnvironmentObject` → `@Environment(MyType.self)` + `.environment(obj)`.
- Directive: use `@Observable` for iOS 17+ targets; keep `ObservableObject` only for back-deployment.

## View Composition
- `@ViewBuilder` — for params/computed props that build views from `if`/`switch`; prefer over returning `AnyView` (keeps static view identity, enables diffing).
- `ViewModifier` + a `View` extension method — package reusable styling (e.g. `.cardStyle()`) instead of copy-pasting modifier chains.
- Avoid `AnyView` — it erases type identity and defeats structural diffing; only use when a collection genuinely holds heterogeneous view types.

## Environment / Preferences
- Custom `EnvironmentKey` + `EnvironmentValues` computed prop — pass data DOWN the tree without prop-drilling.
- `PreferenceKey` (`reduce` combines children) + `.onPreferenceChange` — pass data UP from children to an ancestor (e.g. measured sizes via `GeometryReader`).

## Animations
- `.animation(_, value:)` — implicit, scoped to a specific value's changes (the value-scoped form; the valueless `.animation(_)` is deprecated).
- `withAnimation { }` — explicit, animates all changes caused by the state mutation inside the block.
- Springs: `.spring(response:dampingFraction:)`. Compose transitions with `.combined(with:)`.

## Async Integration
- `.task { }` — run async work tied to view lifetime; auto-cancelled when the view disappears. Prefer over `.onAppear { Task { } }`.
- `.task(id:)` — cancels and restarts when `id` changes (re-fetch on parameter change).
- `.refreshable { }` — pull-to-refresh with an async closure.

## Custom Layout (iOS 16+)
- Conform to `Layout` (`sizeThatFits` + `placeSubviews`) for reusable custom arrangement (masonry/flow) when stacks/grids can't express it. Use `cache` param for expensive measurements.

## Performance / body recomputation
- Keep `body` cheap — no expensive computation inline; hoist to `@State`, computed props, or the model. `body` runs on every dependency change.
- `.equatable()` (or `EquatableView`) to skip re-rendering expensive subtrees when inputs are unchanged.
- `.id(_)` to force a new view identity (reset state / restart transitions) — or to deliberately preserve identity in `ForEach`.
- `@Observable` (iOS 17+) narrows invalidation to views that actually read a changed property — a key win over `@Published` broad invalidation.
