# Glossary

* **Ownership** – Rust’s model for managing memory and resources. Each value has
  a unique owner; when the owner goes out of scope the value is dropped.

* **Borrowing** – Temporarily accessing data owned by someone else without
  taking ownership. Rust enforces rules on mutable and immutable borrows to
  prevent data races.

* **Lifetime** – A compile‑time annotation that describes how long a reference
  is valid. Lifetimes ensure references do not outlive the data they point
  to.

* **Trait** – A collection of methods and associated types that can be
  implemented by types to specify behaviour. Traits are similar to type
  classes in other languages.

* **RAII** – Resource Acquisition Is Initialization. A programming idiom
  where resource allocation and release are tied to the lifetime of an
  object. In Rust, this is achieved through constructors and the `Drop`
  trait.

* **FFI** – Foreign Function Interface. The mechanism by which Rust code
  inter-operates with code written in other programming languages.
