#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <target-symbol-or-text>"
  exit 1
fi

echo "== Definitions / mentions =="
rg -n --hidden --glob '*.go' --glob '!.git' "$TARGET" . || true

echo
printf '== Likely Go entry points ==\n'
rg -n --hidden --glob '*.go' --glob '!.git' \
  'func main\(|func init\(|http\.HandleFunc\(|HandleFunc\(|Handle\(|GET\(|POST\(|go[[:space:]]+[A-Za-z_][A-Za-z0-9_]*\(|//go:build|\+build' . || true

echo
printf '== Direct-looking calls ==\n'
rg -n --hidden --glob '*.go' --glob '!.git' "${TARGET}[[:space:]]*\(" . || true

echo
printf '== Interface / worker / consumer hints ==\n'
rg -n --hidden --glob '*.go' --glob '!.git' \
  'interface[[:space:]]*\{|type[[:space:]].*[[:space:]]interface|worker|consumer|handler|middleware|ServeHTTP' . || true
