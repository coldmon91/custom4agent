# Design Principles

* **KISS (Keep It Simple, Stupid)** – Favour simple designs over complex
  ones. Simplicity reduces bugs and makes code easier to understand and
  maintain.

* **YAGNI (You Aren’t Gonna Need It)** – Don’t implement features until you
  actually need them. Anticipating requirements often leads to unused and
  brittle code.

* **DRY (Don’t Repeat Yourself)** – Avoid duplicating logic; extract common
  functionality into functions or types. Duplication increases the risk of
  inconsistent updates.

* **Composition over Inheritance** – Rust does not have class inheritance; use
  composition and traits to build behaviour. This encourages loose coupling
  and reusability.

* **Encapsulate Unsafety** – Confine `unsafe` code to small modules and
  expose safe interfaces to the rest of the program.
