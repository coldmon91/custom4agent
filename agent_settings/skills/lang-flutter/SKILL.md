---
name: lang-flutter
description: Use whenever writing, modifying, reviewing, or debugging Flutter or Dart code — any `.dart` file or `pubspec.yaml` project — even for a one-line edit. Covers state loss, widget rebuild traps, and async pitfalls.
---

# Flutter Traps

## State and keys

- Keys on list items — without them, reordering or removal attaches state to the wrong item
- Key type matters: `ValueKey` / `ObjectKey` compare by value / identity, `UniqueKey` never matches (state resets every build)
- A key change or a parent that recreates the widget creates new `State` — lift state up or keep the key stable
- State created inside `build` is recreated every build — move it to a `State` field
- `initState` can't be `async`; kick off work there and store the `Future`, or use `addPostFrameCallback` for work that needs `context`
- In `initState`, `widget.*` is safe but inherited widgets via `context` are not — use `didChangeDependencies`
- `GlobalKey` is expensive — don't use it just to reach another widget's state; pass callbacks

## Async

- Check `mounted` after every `await` before `setState` or using `BuildContext`
- `FutureBuilder` / `StreamBuilder` re-subscribe when handed a new future/stream on rebuild — create it in `initState` or a field, never inline in `build`
- Always build the error state in `FutureBuilder` / `StreamBuilder`
- `dispose` must cancel timers (`Timer.periodic` keeps firing), stream subscriptions, HTTP requests (`CancelToken`), and dispose `AnimationController`, `ScrollController`, `TextEditingController`
- `AnimationController` needs `vsync` from `SingleTickerProviderStateMixin` / `TickerProviderStateMixin`

## Navigation

- Don't use a `BuildContext` after `Navigator.pop` or after the route is gone
- `pushReplacement` disposes the previous route — no going back
- `Navigator.push<T>` returns `Future<T?>`; handle null (user backed out) and errors
- Validate deep-link parameters before navigating
- Back handling: `PopScope` (`WillPopScope` is deprecated)
- A `RouteObserver` receives callbacks only after it is registered in `navigatorObservers`

## Performance

- `const` constructors for static subtrees — skipped on rebuild
- `ListView.builder` (plus `itemExtent` when heights are fixed) instead of building every child
- Narrow rebuild scope: extract child widgets; `ValueListenableBuilder` for a single changing value
- `RepaintBoundary` around independently animating regions
- Prefer `FadeTransition` / `AnimatedOpacity` over `Opacity` in animations
- `cached_network_image` for network images that must persist across sessions
- `AutomaticKeepAliveClientMixin` keeps `TabBarView` / `PageView` pages alive at a memory cost

## Platform channels

- Wrap every channel call in `try`/`catch` for `PlatformException` and `MissingPluginException` (platform side not implemented)
- Platform code may return `null` — type Dart results as nullable
- Call the channel from the platform main thread on the native side
- Channel names use reverse-domain prefixes to avoid plugin collisions
- Codec types must match on both sides (standard codec vs JSON vs raw bytes)
- Channels don't run while the app is terminated — use a background-execution plugin
