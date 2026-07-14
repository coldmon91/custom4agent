#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <target-symbol-or-text>"
  exit 1
fi

echo "== Definitions / mentions =="
rg -n --hidden --glob '*.{c,cc,cpp,cxx,h,hpp,hxx}' --glob '!.git' "$TARGET" . || true

echo
printf '== Likely C/C++ entry points ==\n'
rg -n --hidden --glob '*.{c,cc,cpp,cxx,h,hpp,hxx}' --glob '!.git' \
  'main\(|pthread_create\(|std::thread\(|signal\(|sigaction\(|#if|#ifdef|#ifndef|REGISTER_|factory|create\(' . || true

echo
printf '== Direct-looking calls ==\n'
rg -n --hidden --glob '*.{c,cc,cpp,cxx,h,hpp,hxx}' --glob '!.git' "${TARGET}[[:space:]]*\(" . || true

echo
printf '== Indirect dispatch hints ==\n'
rg -n --hidden --glob '*.{c,cc,cpp,cxx,h,hpp,hxx}' --glob '!.git' \
  'virtual|override|std::function|callback|handler|dispatch|register|vtable|factory|\(\*.*\)\(' . || true
