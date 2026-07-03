# Rust Checklist

Check for:
- `fn main()`
- framework route macros
- trait implementations and dynamic dispatch via trait objects
- feature flags and `cfg` attributes
- tokio task spawning and channel consumers

Useful search patterns:
- `fn main()`, `#[tokio::main]`, `route`, `spawn(`, `impl `, `dyn `, `#[cfg(`

## Async and Concurrency Patterns

Check for:
- `tokio::spawn()`, async blocks, Futures trait usage
- mpsc channels, `recv()` blocks, tokio channels
- `tokio::time::sleep()`, `interval()`

Async-specific guidance:
- Trace where channel data enters and what triggers loop continuation.
- Document backpressure or flow-control gates if present.
- Mark confidence as reduced if task chains are long or conditional.
- Mark scheduled paths with execution time windows.

## Error Control Flow

Check for:
- `Result<T, E>` handling through `match`, `map`, `?`, or explicit propagation
- `Option<T>` handling through checks, mapping, or branching
- `.unwrap_or()`, `.expect()`, `.unwrap_or_else()` branches

Error-specific guidance:
- Production code should avoid `unwrap`; track where it occurs.
- Treat panic-driven paths as reachable only when the panic source is explained.

## Dynamic Loading and Generated Code

Check for:
- macro expansion that materially changes control flow

Dynamic-specific guidance:
- Expand important macros before concluding reachability.

## Conditional Compilation and Feature Flags

Check for:
- `#[cfg(...)]`, `cfg!()`, and Cargo feature flags
- version assumptions in `Cargo.toml` and lock files

Feature-flag guidance:
- Determine which features are active from Cargo manifests and build commands.
- Mark paths as conditionally reachable if a feature must be enabled.

## Unused Code Detection (Rust)

### Required tools

```bash
# 1. Compiler warnings (always available — use first)
cargo check 2>&1 | grep "warning: unused"
cargo check 2>&1 | grep "warning: dead_code"

# 2. cargo-udeps (nightly required, more precise)
rustup install nightly
cargo install cargo-udeps
cargo +nightly udeps

# 3. cargo-machete (unused dependency detection)
cargo install cargo-machete
cargo machete
```

Priority: compiler warnings → `cargo-udeps` → `cargo-machete`.

### Running the tools

Collect compiler warnings:

```bash
# All unused-related warnings
RUSTFLAGS="-D warnings" cargo build 2>&1 | grep -E "unused|dead_code|never used"

# Include tests
cargo test 2>&1 | grep -E "unused|dead_code"

# JSON output (easier to parse)
cargo check --message-format json 2>&1 | \
  jq 'select(.reason == "compiler-message") |
      select(.message.code.code == "dead_code" or
             .message.code.code == "unused_variables" or
             .message.code.code == "unused_imports") |
      {code: .message.code.code, spans: .message.spans}'
```

cargo-udeps (unused dependencies):

```bash
cargo +nightly udeps --all-targets
```

Example output:
```
unused dependencies:
└─ Cargo.toml
   └─ dependencies
      └─ serde_json
```

### Entry points

The compiler treats these as alive by default:
- `fn main()`
- `pub` items in `lib.rs` (accessible from outside the crate)
- `#[test]` functions
- `#[no_mangle]` functions (FFI exports)
- `#[export_name = "..."]` functions

Additional entry points to check manually:

```bash
# FFI exports
grep -rn "#\[no_mangle\]\|#\[export_name" --include="*.rs" .

# proc-macro crates
grep -rn "proc-macro = true" Cargo.toml

# wasm-bindgen exports
grep -rn "#\[wasm_bindgen\]" --include="*.rs" .
```

### Edge cases → classify as UNKNOWN

**1. `#[allow(dead_code)]` explicitly present**
```bash
grep -rn "#\[allow(dead_code)\]" --include="*.rs" .
```
The author intentionally suppressed the warning → UNKNOWN.

**2. Trait implementations**
```bash
grep -rn "impl .* for " --include="*.rs" .
```
Methods in trait impls can be called via trait objects (`dyn Trait`) at runtime → UNKNOWN.

**3. `#[cfg(...)]` conditional compilation**
```bash
grep -rn "#\[cfg(" --include="*.rs" .
```
Code only active under certain feature flags or platforms → UNKNOWN.

**4. proc-macro generated code**
```bash
grep -rn "derive\|proc_macro" Cargo.toml
```
When proc-macro crates are present → symbols they may generate are UNKNOWN.

**5. FFI / extern blocks**
```bash
grep -rn "extern \"C\"\|#\[no_mangle\]" --include="*.rs" .
```
Symbols exported with C ABI may be called from external C code → UNKNOWN.

**6. unsafe + raw pointer manipulation**
```bash
grep -rn "transmute\|from_raw\|as_ptr" --include="*.rs" .
```
Unsafe code can manufacture arbitrary function pointers → symbols in the same module are UNKNOWN.

**7. build.rs present**
```bash
ls build.rs
```
`build.rs` can reference symbols by name via linker scripts → related symbols are UNKNOWN.

### Exclusion patterns

```bash
target/          # Build output — always exclude
*.pb.rs          # protobuf generated
*_generated.rs   # other codegen
out/             # build.rs output directory
```

### Enabling stricter lint in source

Rust's compiler is the most powerful dead-code detector available. Add this to the crate root for more aggressive warnings:

```rust
#![warn(
    dead_code,
    unused_imports,
    unused_variables,
    unused_mut,
    unused_assignments,
)]
```

Running `cargo check` with these lints enabled catches a large portion of dead code without external tools.
