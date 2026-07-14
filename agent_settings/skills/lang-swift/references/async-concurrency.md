# Async/Await Concurrency

## Async/Await
- `async`/`await` funcs — prefer over completion handlers for new code; propagates cancellation and errors natively.
- Gotcha: sequential `await` calls run serially. For independent work use `async let` or a task group, not back-to-back `await`.

## Actors
- `actor` — reach for this for mutable shared state instead of manual locks/queues; the compiler serializes access.
- All cross-actor access is `await` (async hop). Access from inside the actor is synchronous.
- Gotcha (reentrancy): an actor method can suspend at `await` and let another call interleave. Re-check invariants after every `await` — don't assume state is unchanged. Cache-then-await patterns need a "check in-progress task" map to dedupe concurrent callers.
- `nonisolated` — for members that touch no mutable state (e.g. pure computed props, `Sendable` lets); lets callers skip the `await`.

## MainActor
- `@MainActor` on a type/func/property — pins execution to the main thread; use for all UI-touching code and `ObservableObject`/`@Observable` view models.
- `await` calls inside a `@MainActor` type still hop off-main for the awaited work, then resume on main. You don't need manual `DispatchQueue.main`.
- `nonisolated func` inside a `@MainActor` type — opt a pure helper out of main-thread isolation.

## Structured Concurrency
- `async let` — for a fixed, known set of parallel children; bind then `await` at the join point. Cleanest for "fetch A, B, C in parallel".
- `withThrowingTaskGroup` / `withTaskGroup` — for a dynamic/variable number of children. `throwing` variant when children can throw.
- Gotcha: task groups don't preserve completion order. To reassemble by position, yield `(index, value)` tuples and place into a pre-sized array.
- Both are structured: parent waits for all children; a thrown error cancels siblings. Prefer these over detached tasks.

## Task Management
- `Task { }` — unstructured; inherits actor context and priority. Use to bridge sync → async (e.g. from a non-async button handler).
- `Task.detached` — inherits nothing (no actor, no priority, no task-locals). Use sparingly; breaks structured concurrency. Only when you deliberately need to escape the current context.
- Gotcha: `Task { }` capturing `self` in a class holds it strongly until the task finishes. Use `[weak self]` for long-lived/cancellable tasks, and store the `Task` handle to `.cancel()` it (e.g. on `deinit` or restart).
- Cancellation is cooperative: `try Task.checkCancellation()` (throws `CancellationError`) or check `Task.isCancelled` in loops. Cancellation does not preempt — you must poll.
- Priorities: `.high` / `.medium` / `.low` / `.background` / `.utility` / `.userInitiated`.

## AsyncSequence / AsyncStream
- `for await x in seq` (or `for try await`) — consume async sequences; `break` to stop early.
- `AsyncStream { continuation in ... }` — bridge a callback/delegate/Notification push API into an `AsyncSequence`. `continuation.yield(_)` to emit, `continuation.finish()` to end.
- Gotcha: always set `continuation.onTermination` to tear down the underlying observer/subscription, or you leak it.
- `AsyncThrowingStream` — same, when the producer can error.
- Custom `AsyncSequence`: conform + provide `AsyncIteratorProtocol.next() async`. Usually `AsyncStream` is simpler than hand-rolling.

## Sendable (Swift 6 strict concurrency)
- `Sendable` — marks a type safe to cross concurrency domains. Value types with `Sendable` members conform automatically; final classes need immutability.
- `@unchecked Sendable` — escape hatch when you enforce safety manually (e.g. internal `NSLock`/`os_unfair_lock` guarding mutable state). You are asserting correctness the compiler can't verify — use rarely.
- `@Sendable` closure — required for closures passed across isolation (e.g. `Task`, task-group `addTask`); they can't capture non-`Sendable` mutable state.
- Under Swift 6 / strict concurrency, non-`Sendable` captures crossing an isolation boundary are errors, not warnings. Prefer value types and actor isolation over `@unchecked`.

## Continuations (bridging legacy async)
- `withCheckedThrowingContinuation` / `withCheckedContinuation` — wrap a completion-handler API as `async`. `checked` variant traps on the bug of resuming twice / never.
- Gotcha: a continuation MUST be resumed exactly once. Zero resumes = permanent leak/hang; two = crash (checked) or UB (unsafe).
- `withUnsafeContinuation` — drops the double-resume checks; only for measured hot paths after correctness is proven.

## Best Practices
- Actors for shared mutable state; `@MainActor` for UI.
- Structured (`async let`, task groups) over detached tasks.
- Poll cancellation in long-running loops.
- Mark types `Sendable` when genuinely safe; avoid `@unchecked` unless guarding with a lock.
- Never block (sync sleep, semaphore wait) inside an async context.
