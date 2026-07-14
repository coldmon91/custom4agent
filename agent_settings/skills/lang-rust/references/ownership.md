# Ownership, Borrowing, and Lifetimes

## Borrow rules (the invariants)

- Any number of `&T` (shared) XOR exactly one `&mut T` (exclusive), never both simultaneously — enforced at compile time; this is what prevents data races.
- Move semantics: passing/assigning a non-`Copy` value transfers ownership; the source is invalidated. `Copy` types (primitives, small POD) are bitwise-duplicated instead.
- Directive: prefer borrowing over moving; take `&str` not `String`, `&[T]` not `Vec<T>`, `&T` not `&Box<T>` in function params (deref coercion widens accepted inputs).

## Clone vs borrow

- Don't `clone()` to silence the borrow checker — it hides an ownership-design problem and adds allocations. Restructure the data flow first; clone only when lifetime complexity genuinely outweighs the copy cost (profile).
- `Cow<'a, T>` (`Cow::Borrowed`/`Cow::Owned`) for "borrow unless I must mutate" — returns a borrow on the common path, allocates only when a modification is needed. Ideal for functions that usually pass input through unchanged.

## Lifetimes

- Annotate (`<'a>`) only when elision can't infer the relationship — i.e. multiple input references where the compiler can't tell which one the output borrows from. Most single-`&self` methods need no annotations (elision rules cover them).
- `&'static` = lives for the whole program (string literals, consts). Don't reach for `'static` bounds to escape a lifetime error — it usually signals a design issue.
- Lifetimes in structs (`struct Excerpt<'a> { part: &'a str }`) tie the struct's validity to the borrowed data; consider owning the data instead if the plumbing gets painful.

## Smart pointer / sharing decision

- `Box<T>` — single owner, heap allocation; for recursive types, trait objects, or moving large values cheaply.
- `Rc<T>` — shared ownership, **single-threaded**, non-atomic refcount (cheap). `Arc<T>` — same but atomic, **thread-safe** (use only across threads; it's slightly costlier).
- `RefCell<T>` — interior mutability with **runtime** borrow checking (single-threaded); `Cell<T>` for `Copy` values (get/set, no references). `Mutex<T>`/`RwLock<T>` — interior mutability across threads.
- Combine for shared mutable state: `Rc<RefCell<T>>` (single-thread), `Arc<Mutex<T>>` (multi-thread). Gotcha: `RefCell` panics on conflicting borrows at runtime — use `try_borrow` when unsure, and avoid `Rc<RefCell<T>>` sprawl (it defeats compile-time safety). `RwLock` only over `Mutex` when reads vastly outnumber writes.

## Self-referential types

- Rust forbids ordinary self-referential structs (a move would invalidate the internal pointer). Options, in order of preference: **restructure to avoid it**, use an **index-based arena** (store indices, not references), or `Pin` + `PhantomPinned` + `unsafe` as a last resort.
- Async futures are self-referential internally — that's why they require `Pin` — but you get this for free via `async {}`; you rarely construct it manually.

## RAII / Drop

- Implement `Drop` to release resources (files, locks, FFI handles) deterministically at scope end — don't require callers to clean up manually.
- Gotcha: `Drop` can't return errors. Failures possible at teardown (e.g. `flush`) must be surfaced via an explicit method called **before** the value drops.
- `std::mem::take`/`std::mem::replace` to move a value out of a `&mut` field while leaving a valid one behind (avoids partial-move errors).

## Best practices

- Clone only when necessary; profile before assuming it's the bottleneck.
- Use `PhantomData` to constrain variance or tie unused type params.
- Document lifetime relationships when they're non-obvious.
