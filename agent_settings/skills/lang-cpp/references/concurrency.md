# Concurrency and Parallel Programming

Keyword-directed guidance. Names the primitive + when to use it. The memory-ordering
semantics table is kept literal — the meaning of each ordering is the information.

## Atomics & Memory Ordering

- `std::atomic<T>` for lock-free shared state; `fetch_add` / `compare_exchange_weak|strong`
  for RMW. CAS loops use `_weak` (may spuriously fail, cheaper in a loop).
- Producer publishes with `release`, consumer reads with `acquire` — this pair establishes
  happens-before. `relaxed` only for independent counters. Default to `seq_cst` unless a
  benchmark justifies weakening.
- `compare_exchange_strong` outside loops (no spurious failure).

## Lock-Free Structures

- Reach for lock-free only under measured high contention — correctness is hard.
- Gotcha: naive lock-free stack/queue has the **ABA problem** and reclamation hazards;
  use hazard pointers / RCU or a vetted library (folly, boost.lockfree) in production.
- SPSC ring buffer: pad `head_`/`tail_` to separate cache lines (`alignas(64)`) to avoid
  false sharing.

## Thread Pool

- Prefer an existing pool (`std::async` with a pool backend, TBB, `std::execution`) over
  hand-rolling. Hand-rolled shape: `condition_variable` + task queue; `packaged_task` +
  `future` to return results; join all workers in the destructor.

## Parallel STL (C++17)

- `std::execution::par` / `par_unseq` on `sort` / `for_each` / `transform` / `reduce` /
  `transform_reduce`. Use `reduce` not `accumulate` for parallelism (needs associativity).
- `par_unseq` forbids any synchronization / allocation in the element body.

## Synchronization Primitives

- `std::scoped_lock(m1, m2)` for multiple mutexes — deadlock-free acquisition; never lock
  two mutexes by hand.
- `std::shared_mutex` + `shared_lock` (read) / `unique_lock` (write) for read-heavy data.
- `std::lock_guard` for simple scopes; `std::unique_lock` only when you need unlock/relock
  or condition variables. `condition_variable::wait` always takes a predicate (spurious wakeups).
- `std::jthread` (C++20) over `std::thread` — auto-joins, supports `stop_token`.

## Async & Coroutines

- `std::async(std::launch::async, ...)` for one-off async; `std::promise`/`future` to hand a
  value across threads; `std::packaged_task` to wrap a callable's result in a future.
- Coroutines (`co_await`/`co_return`, custom `promise_type`) for async I/O with minimal
  overhead — prefer a coroutine library (cppcoro, asio) over hand-rolled awaiters.

## Quick Reference

| Primitive | Use Case | Performance |
|-----------|----------|-------------|
| std::atomic | Simple shared state | Lock-free |
| std::mutex | Exclusive access | Kernel call |
| std::shared_mutex | Read-heavy workload | Better than mutex |
| Lock-free structures | High contention | Best throughput |
| Thread pool | Task parallelism | Avoid thread overhead |
| Parallel STL | Data parallelism | Automatic scaling |
| std::async | Simple async tasks | Thread pool |
| Coroutines | Async I/O | Minimal overhead |

## Memory Ordering Guide

| Ordering | Guarantees | Use Case |
|----------|-----------|----------|
| relaxed | No synchronization | Counters |
| acquire | Load barrier | Consumer |
| release | Store barrier | Producer |
| acq_rel | Both | RMW operations |
| seq_cst | Total order | Default |
