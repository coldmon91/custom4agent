# Async Programming in Rust

## Runtime choice

- Prefer **tokio** over async-std (async-std is deprecated/unmaintained; tokio is the ecosystem default and what most libs — reqwest, sqlx, hyper, tonic — target).
- `#[tokio::main]` for the app entry point; `Runtime::new()?.block_on(...)` only when you need a runtime inside sync code (tests, FFI, `main` that stays sync).
- `Builder::new_multi_thread().worker_threads(N).enable_all()` for servers; `new_current_thread()` for single-threaded workloads or to avoid `Send` bounds on futures.
- Gotcha: a `Future` does nothing until `.await`ed or spawned — constructing one has no side effect.

## Concurrency: run vs spawn

- `tokio::join!(a, b)` — run futures concurrently **on the same task**, await all. `try_join!` — same but short-circuits on first `Err`. Prefer `try_join!` over manual sequencing of fallible ops.
- `tokio::spawn(fut)` — offload onto the runtime as an independent task; returns `JoinHandle`. Requires `fut: Send + 'static` (multi-thread runtime) — captured data must be owned (`move`) and `Send`.
- `spawn_blocking(closure)` — for CPU-bound or blocking sync calls (std file I/O, `std::sync::Mutex`, heavy compute). Never call blocking code directly in an async task — it starves the runtime's worker threads.
- Gotcha: spawned tasks can panic; a dropped `JoinHandle` detaches the task. Always `.await` handles and handle `JoinError`.
- For structured/bounded concurrency use `JoinSet` (dynamic set of tasks) over hand-rolled `Vec<JoinHandle>`.

## select! and cancellation

- `tokio::select!` — race branches; first ready wins, **the rest are dropped (cancelled) mid-flight**.
- Cancellation-safety gotcha: only use futures that are cancel-safe in a `select!` loop. `mpsc::Receiver::recv`, `tokio::time::sleep` are safe; anything holding partial state (e.g. reading into a buffer that isn't restartable) can lose data when its branch is dropped. Check each method's docs for a "Cancel safety" section.
- Timeout: prefer `tokio::time::timeout(dur, fut)` over a hand-rolled `select!`+`sleep`.
- Graceful shutdown: `select!` a work branch against a `watch`/`CancellationToken` (tokio-util) branch; break on signal. Trigger via `tokio::signal::ctrl_c()`.

## Channels (tokio::sync)

- `mpsc::channel(cap)` — bounded multi-producer/single-consumer; backpressure via `send().await`. Use `unbounded_channel` only when you can bound growth elsewhere.
- `oneshot` — single value, request/response; the reply half of an RPC.
- `broadcast` — multi-consumer, each gets every message; lagging receivers get `RecvError::Lagged` (can drop messages).
- `watch` — single latest value, consumers `.changed().await` + `.borrow()`; ideal for config/shutdown state.
- Directive: prefer channels (message passing) over `Arc<Mutex<T>>` shared state where the design allows.

## Shared state

- `Arc<tokio::sync::Mutex<T>>` / `RwLock<T>` when state genuinely must be shared. Use the **tokio** locks (not `std::sync`) only if the guard is held across `.await`.
- Critical gotcha: never hold a lock guard across an `.await` point — risks deadlock and breaks `Send`. If the guard is dropped before any `.await`, `std::sync::Mutex` is faster and fine.
- `RwLock` only pays off with many readers and rare writers.

## Async in traits

- Rust 2024 / stable supports native `async fn` in traits. Gotcha: native async-trait methods are **not** `dyn`-compatible and the returned future's auto-traits (`Send`) aren't guaranteed — fine for generic/`impl Trait` use.
- Use the **`async-trait`** crate (`#[async_trait]`) when you need `dyn` trait objects or a guaranteed `Send` bound; it boxes the returned future (small heap cost).

## Streams

- `Stream` = async `Iterator`. Import `futures::StreamExt` / `tokio_stream::StreamExt` for combinators (`map`, `filter`, `then`, `for_each`, `collect`).
- `.next().await` in a `while let` to consume; `.then(|x| async {...})` for async per-item work.
- Gotcha: the two `StreamExt` traits differ slightly — pick one import per module to avoid ambiguity.

## Pin and manual Futures

- You rarely hand-write `Future::poll`. Reach for it only for leaf primitives (timers, custom I/O readiness).
- `Pin<&mut T>` guarantees a value won't move — required because async blocks compile to self-referential state machines. `Box::pin(fut)` to heap-pin; `tokio::pin!` to stack-pin for `select!`/manual polling.
- Prefer `async {}` blocks and combinators over manual `poll` implementations.

## Error handling in async

- Same model as sync: `Result` + `?`. Define errors with `thiserror`, adding `#[from]` for `reqwest::Error`, `tokio::task::JoinError`, etc.
- `timeout(...).await` returns `Result<Result<T,E>, Elapsed>` — the double `??` / `.map_err(|_| Timeout)?` pattern flattens both layers.

## Best practices

- `timeout` every external I/O.
- Bound task spawning — unbounded `spawn` in a loop leaks tasks/memory.
- Test with `#[tokio::test]` (add `flavor = "multi_thread"` when the test needs real parallelism).
