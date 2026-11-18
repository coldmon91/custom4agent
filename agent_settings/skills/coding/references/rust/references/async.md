# Async Programming in Rust

## Runtime

- Use **tokio** (async-std is unmaintained; reqwest, sqlx, hyper, tonic all target tokio).
- `#[tokio::main]` for the entry point; `Runtime::new()?.block_on(..)` only inside sync code (tests, FFI).
- `new_current_thread()` for single-threaded workloads or to avoid `Send` bounds on futures.
- A `Future` does nothing until `.await`ed or spawned.

## Run vs spawn

- `tokio::join!` / `try_join!` — concurrent on the same task; `try_join!` short-circuits on the first `Err`.
- `tokio::spawn` — independent task; needs `Send + 'static`, so captured data must be owned (`move`).
- `spawn_blocking` — for blocking sync calls (std file I/O, heavy compute). Blocking inside an async task starves the worker threads.
- A dropped `JoinHandle` detaches the task and a spawned task can panic — `.await` handles and handle `JoinError`.
- Use `JoinSet` for a dynamic set of tasks; bound spawning in loops or tasks leak.

## select! and cancellation

- `tokio::select!` — first ready branch wins, **the others are dropped mid-flight**.
- Only use cancel-safe futures in a `select!` loop (`mpsc::Receiver::recv`, `sleep` are safe; partial-read buffers lose data). Check each method's "Cancel safety" doc section.
- `tokio::time::timeout(dur, fut)` over a hand-rolled `select!` + `sleep`; put a timeout on every external I/O. It returns `Result<Result<T, E>, Elapsed>` — flatten with `.map_err(|_| Timeout)??`-style handling.
- Graceful shutdown: `select!` the work branch against a `watch` channel or `CancellationToken` (tokio-util), triggered by `tokio::signal::ctrl_c()`.

## Channels (tokio::sync)

- `mpsc::channel(cap)` — bounded, backpressure via `send().await`; `unbounded_channel` only when growth is bounded elsewhere.
- `oneshot` — single reply (RPC response). `broadcast` — every consumer gets every message; laggards get `RecvError::Lagged`. `watch` — latest value only (config, shutdown).

## Shared state

- `std::sync::Mutex` when the guard is dropped before any `.await` (faster); `tokio::sync::Mutex` only when the guard must live across `.await`.

## Async in traits

- Native `async fn` in traits is not `dyn`-compatible and doesn't guarantee a `Send` future — fine for generic use.
- Use the `async-trait` crate when you need `dyn` or a guaranteed `Send` bound (it boxes the future).

## Streams and Pin

- Pick one `StreamExt` import per module (`futures` vs `tokio_stream` differ slightly); consume with `while let Some(x) = s.next().await`.
- `Box::pin(fut)` to heap-pin, `tokio::pin!` to stack-pin for `select!` or manual polling. Hand-written `Future::poll` is for leaf primitives only.
