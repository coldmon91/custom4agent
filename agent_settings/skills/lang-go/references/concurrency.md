# Go Concurrency

## Principles

- Every goroutine needs a clear exit (context, done channel) and someone who waits for it — otherwise it leaks.
- Only the sender closes a channel; closing from the receiver side panics the sender.
- Specify channel direction (`chan<-`, `<-chan`) in signatures.
- Default to unbuffered channels; a buffer needs a measured reason (it masks backpressure).
- Send copies, not pointers — a pointer on a channel is invisible shared memory.
- Always include `ctx.Done()` in a `select` that can block.
- Don't call `time.After` repeatedly in a long-running loop; reuse `time.NewTimer` + `Reset`.
- Should this be synchronous? Don't add concurrency without a measured need.

## Choosing a primitive

| Need | Use |
| --- | --- |
| Pass data / ownership between goroutines | Channel |
| Protect struct fields | `sync.Mutex` / `sync.RWMutex` — short critical sections, never across I/O; never upgrade `RLock` to `Lock` |
| Counters, flags | Typed atomics (`atomic.Int64`, `atomic.Bool`) |
| Read-heavy concurrent map | `sync.Map`; `RWMutex` + map when writes dominate. Unsynchronized concurrent map read/write is a hard crash |
| One-time init | `sync.Once`, `sync.OnceValue` / `OnceValues` |
| Deduplicate concurrent calls | `x/sync/singleflight` |
| Reuse temporaries | `sync.Pool` — `Reset()` before `Put()` |
| Wait, no errors | `sync.WaitGroup` (`wg.Go(fn)` on Go 1.25+, or `Add` **before** `go`) |
| Wait + first error / cancel siblings / limit | `errgroup.Group` / `errgroup.WithContext` / `SetLimit(n)` |

## Making shared state un-missable

Go has no compile-time lock checking — no `GUARDED_BY` equivalent. Nothing fails the build when
a caller touches shared state unlocked, so the defense has to be encapsulation plus `-race`.

- **Unexported field + locking methods** — first choice. Outside the type, unlocked access is
  impossible; inside it, the critical code is one small file a reader sees whole.

  ```go
  type sessions struct {
      mu sync.Mutex // guards m
      m  map[SessionID]*Session
  }

  func (s *sessions) Insert(id SessionID, v *Session) {
      s.mu.Lock()
      defer s.mu.Unlock()
      s.m[id] = v
  }
  ```

- **Declare the mutex directly above the fields it guards, and say which ones**
  (`mu sync.Mutex // guards conns, closed`) — the standard-library convention.
- **Package-level state: name the lock after the data** (`cacheMu` guards `cache`) so the guard
  is greppable from the data.
- A `Guarded[T]` wrapper with `With(func(*T))` shows the lock at the use site, but a pointer can
  still escape the closure — prefer methods.
- `go test -race ./...` in CI is the real net, and `go vet` copylocks catches copied mutexes.
  `-race` is runtime only: it sees executed paths, so test coverage is the ceiling.

## Detecting leaks

- Tests: `go.uber.org/goleak` (in `TestMain` or per test)
- Runtime: `runtime.NumGoroutine()`, `/debug/pprof/goroutine?debug=2`
