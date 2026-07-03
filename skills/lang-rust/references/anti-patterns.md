# Rust Anti-Patterns

Practices widely regarded as harmful or counter-productive in Rust. Anti-patterns often create more problems than they solve. Each section explains why the pattern is harmful and suggests safer alternatives.

## When to use

- A suspected pattern might be harmful — verify whether it is an anti-pattern
- Investigating hidden costs of frequent cloning, suppressing warnings, or implicit deref coercion
- Debugging ownership errors without resorting to questionable shortcuts

## Clone to Satisfy the Borrow Checker

Calling `clone()` simply to appease the borrow checker can mask underlying ownership issues and degrade performance.

**Why harmful**: Hides real ownership problems and adds unnecessary allocations.

**Alternatives**:
- Reconsider the data flow: can you borrow instead of own?
- Restructure code to avoid overlapping borrows
- Use `Rc`/`Arc` if shared ownership is truly required
- Treat `clone()` as a last resort, not the default

## `#![deny(warnings)]`

Adding `#![deny(warnings)]` to a crate causes all compiler warnings to be treated as errors.

**Why harmful**: New compiler versions may introduce additional warnings, breaking your build without real deficiencies in the code.

**Alternatives**:
- Allow warnings by default and address them individually
- Use `#![deny(unsafe_op_in_unsafe_fn)]` or specific lints to enforce critical safety properties
- Configure CI separately to fail on warnings, not the crate itself

## Deref Polymorphism

Relying on `Deref` for polymorphism makes trait bounds implicit and can surprise users when a wrapper type behaves like its inner type.

**Why harmful**: Implicit method resolution causes confusion and unexpected behaviour. Breaks encapsulation of the wrapper type.

**Alternatives**:
- Explicitly implement the appropriate traits for your wrapper type
- Provide `AsRef`/`AsMut` implementations
- Use newtype patterns with explicit conversion methods

## General Guidance

When evaluating any suspected anti-pattern:
1. Identify the suspected anti-pattern
2. Explain why it is harmful: ownership rules, performance implications, community guidelines
3. Suggest alternative approaches that achieve the same goal
4. Emphasise trade-offs and contexts where the anti-pattern might be acceptable
