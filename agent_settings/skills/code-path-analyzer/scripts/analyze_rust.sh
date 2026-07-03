#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <target-symbol-or-text>"
  exit 1
fi

echo "== Definitions / mentions =="
rg -n --hidden \
  --glob '*.rs' \
  --glob 'Cargo.toml' \
  --glob 'build.rs' \
  --glob '!.git' \
  --glob '!target' \
  "$TARGET" . || true

echo
printf '== Likely Rust entry points / framework registrations ==\n'
rg -n --hidden \
  --glob '*.rs' \
  --glob 'Cargo.toml' \
  --glob 'build.rs' \
  --glob '!.git' \
  --glob '!target' \
  'fn[[:space:]]+main[[:space:]]*\(|#\[(tokio::main|async_std::main|actix_web::main)\]|Router::new\(|\.route\(|route_service\(|nest\(|warp::path|warp::serve\(|App::new\(|HttpServer::new\(|#\[(get|post|put|delete|patch|head|options)\(|rocket::main|tonic::transport::Server::builder\(|Command::new\(|derive\((Parser|Subcommand)\)|subcommand\(|build\.rs|cargo:rustc-cfg|cargo:rerun-if' . || true

echo
printf '== Direct-looking calls ==\n'
rg -n --hidden \
  --glob '*.rs' \
  --glob '!.git' \
  --glob '!target' \
  "${TARGET}[[:space:]]*!?\\(" . || true

echo
printf '== Trait dispatch / async / registration hints ==\n'
rg -n --hidden \
  --glob '*.rs' \
  --glob '!.git' \
  --glob '!target' \
  'impl[[:space:]]+.*for[[:space:]]+|dyn[[:space:]]+[A-Za-z_][A-Za-z0-9_]*|Box<dyn|Arc<dyn|tokio::spawn\(|spawn_blocking\(|std::thread::spawn\(|select!|recv\(|try_recv\(|send\(|oneshot|mpsc|broadcast|watch|register|handler|callback|listener|subscribe|Service|Handler|Layer' . || true

echo
printf '== cfg / feature / test guards ==\n'
rg -n --hidden \
  --glob '*.rs' \
  --glob 'Cargo.toml' \
  --glob 'build.rs' \
  --glob '!.git' \
  --glob '!target' \
  '#\[cfg\(|cfg!\(|feature[[:space:]]*=|#\[tokio::test\]|#\[test\]|dev-dependencies|\[features\]' . || true
