# Rust

## Entry points and registration
- `fn main`, `#[tokio::main]`, `#[async_std::main]`, `#[actix_web::main]`, `#[rocket::main]`
- Routes: `Router::new(`, `.route(`, `nest(`, `#[get(` / `#[post(`, `App::new(`, `HttpServer::new(`, `warp::path`, `tonic::transport::Server::builder(`
- CLI: `derive(Parser)` / `derive(Subcommand)`, `Command::new(`
- Tests: `#[test]`, `#[tokio::test]`
- FFI / wasm: `#[no_mangle]`, `#[export_name`, `#[wasm_bindgen]`

## Path-specific patterns
- Tasks: `tokio::spawn`, `spawn_blocking`, `std::thread::spawn`, `select!`. Trace what drives the future.
- Channels: `mpsc`, `oneshot`, `broadcast`, `watch`, `recv()`. Trace where data enters; note backpressure.
- Timers: `tokio::time::sleep`, `interval`. State the time window.
- Errors: `?`, `match` on `Result` / `Option`, `unwrap_or_else`. A panic path (`unwrap`, `expect`) is reachable only when the panic source is explained.
- Trait objects: `dyn Trait`, `Box<dyn`, `Arc<dyn`: medium or low confidence.
- Macros: expand important ones before concluding reachability.
- `#[cfg(...)]`, `cfg!()`, `[features]` in `Cargo.toml`, `cargo:rustc-cfg` in `build.rs`. Determine active features from manifests and build commands.

## Unused code: compiler lints

`dead_code` and the `unused_*` lints warn by default; no extra tool is needed.

```bash
cargo check --message-format json 2>/dev/null | jq -r '
  select(.reason == "compiler-message") | .message
  | select(.code.code == "dead_code" or ((.code.code // "") | startswith("unused")))
  | "\(.spans[0].file_name):\(.spans[0].line_start) \(.message)"'
```

- Messages look like: ``function `foo` is never used``, ``struct `Bar` is never constructed``, ``unused import: `std::fmt` ``.
- Code behind features that are not enabled is not compiled, so it is not checked. Run with the feature sets the project builds.
- `pub` items reachable from `lib.rs` never warn: `UNKNOWN` when `library_mode=yes`.
- Unused **dependencies** (not code) are a separate question: `cargo +nightly udeps --all-targets` or `cargo machete`.

### Edge cases: `UNKNOWN`
- Explicit `#[allow(dead_code)]`
- Methods in `impl Trait for Type` (callable through `dyn Trait`)
- Items under `#[cfg(...)]`
- Code that proc-macro crates may generate
- `extern "C"`, `#[no_mangle]`, `#[export_name]`
- Same module uses `transmute`, `from_raw`, or raw function pointers
- Symbols named in `build.rs` or linker scripts

```bash
rg -n '#\[allow\(dead_code\)\]|impl .* for |#\[cfg\(|extern "C"|#\[no_mangle\]|#\[export_name|transmute|from_raw' -g '*.rs' <scope>
```

Exclude `target/`, `out/`, `*.pb.rs`, `*_generated.rs`.
