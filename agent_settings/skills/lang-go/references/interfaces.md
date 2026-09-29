# Interface Design

## Principles

- Keep interfaces small (one or two methods); compose larger contracts by embedding (`ReadWriteCloser = Reader + Writer + Closer`).
- Accept interfaces, return concrete types (`func New(..) *Server`) — callers keep the full API and you can add methods without breaking them.
- Define the interface in the **consumer** package with only the methods it uses; this also avoids import cycles. Producer-side interfaces only for widely shared contracts (`io.Reader`) or plugin boundaries.
- No interface until there is a second implementation or a test seam — a single-implementation interface is premature.
- Use `any` over `interface{}`; prefer generics when the type set is known at compile time.

## Gotchas

- **Typed nil:** an interface is nil only when both its type and value are nil. `var e *MyError; return e` through an `error` return yields a non-nil error. Return the literal `nil` on the success path.
- **Receiver kind:** pointer-receiver methods are only in `*T`'s method set, so `T` values don't satisfy the interface (`[]Stringer{Point{}}` fails; `&Point{}` works). If any method needs a pointer receiver, give the type pointer receivers throughout and store `*T`.
- **Compile-time check:** `var _ Iface = (*T)(nil)` at the definition site turns a missing method into a local build error.
- **Type assertions:** always the two-value form `v, ok := x.(T)` on untrusted values; probe optional capabilities that way (`if f, ok := w.(http.Flusher); ok`).
- **Embedded interface field** (`type Service struct{ Logger }`): a nil injected value panics on call — substitute a no-op implementation in the constructor.
- Custom `io.Reader`: handle only `p[:n]` and return `n, err` as received, including `n > 0` together with `io.EOF`.

## Functional options vs config struct

- Functional options (`type Option func(*Server)`, `NewServer(opts ...Option)`) when options are many, optional, and a public API must stay backward-compatible.
- Plain config struct when fields are few and required, or decoded from file/env/flags.
