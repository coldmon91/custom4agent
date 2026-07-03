#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <target-symbol-or-text>"
  exit 1
fi

echo "== Definitions / mentions =="
rg -n --hidden --glob '*.{js,jsx,ts,tsx,mjs,cjs}' --glob '!.git' --glob '!node_modules' "$TARGET" . || true

echo
printf '== Likely JS/TS entry points ==\n'
rg -n --hidden --glob '*.{js,jsx,ts,tsx,mjs,cjs}' --glob '!.git' --glob '!node_modules' \
  'app\.(get|post|put|delete|patch)\(|router\.(get|post|put|delete|patch|use)\(|createRouter\(|addEventListener\(|on\(|emit\(|cron\.schedule\(|setInterval\(|setTimeout\(|export async function (GET|POST|PUT|DELETE|PATCH)' . || true

echo
printf '== Direct-looking calls ==\n'
rg -n --hidden --glob '*.{js,jsx,ts,tsx,mjs,cjs}' --glob '!.git' --glob '!node_modules' "${TARGET}[[:space:]]*\(" . || true

echo
printf '== Middleware / registration / event hints ==\n'
rg -n --hidden --glob '*.{js,jsx,ts,tsx,mjs,cjs}' --glob '!.git' --glob '!node_modules' \
  'use\(|middleware|register|handler|callback|listener|subscribe|queue\.process|worker|consumer' . || true
