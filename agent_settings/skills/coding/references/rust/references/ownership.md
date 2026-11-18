# Ownership, Borrowing, and Lifetimes

## Borrowing

- Params take the borrowed type: `&str` not `&String`, `&[T]` not `&Vec<T>`, `&T` not `&Box<T>` — deref coercion widens accepted inputs.
- Don't `clone()` to silence the borrow checker — it hides an ownership-design problem. Restructure the data flow first (borrow instead of own, avoid overlapping borrows, destructure a struct to borrow fields independently); clone only when lifetime complexity genuinely outweighs the copy cost.
- `Cow<'a, T>` for "borrow unless I must mutate" — allocates only on the modifying path.
- `std::mem::take` / `mem::replace` to move a value out of a `&mut` field while leaving a valid one behind (avoids partial-move errors).

## Lifetimes

- Annotate only when elision can't infer the relationship (multiple input references, output borrows from one of them).
- Don't add `'static` bounds to escape a lifetime error — it usually signals a design issue.
- A struct holding `&'a T` ties its validity to the borrowed data; own the data instead if the plumbing gets painful.

## Smart pointer / sharing decision

- `Box<T>` — single owner on the heap; recursive types, trait objects, large values.
- `Rc<T>` — shared, single-threaded, non-atomic refcount. `Arc<T>` — atomic, only when crossing threads.
- `Cell<T>` (`Copy` values) / `RefCell<T>` (runtime borrow check, single-threaded) / `Mutex<T>`, `RwLock<T>` (across threads).
- Shared mutable state: `Rc<RefCell<T>>` single-thread, `Arc<Mutex<T>>` multi-thread. `RwLock` only when reads vastly outnumber writes.

## Self-referential types

- Ordinary self-referential structs are impossible (a move invalidates the internal pointer). In order of preference: restructure, use an index-based arena (store indices, not references), or `Pin` + `PhantomPinned` + `unsafe` as a last resort.
- Async futures are self-referential internally — `async {}` handles the pinning for you.
