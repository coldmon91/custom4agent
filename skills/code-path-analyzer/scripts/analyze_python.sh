#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <target-symbol-or-text>"
  exit 1
fi

echo "== Definitions / mentions =="
rg -n --hidden --glob '!venv' --glob '!.git' --glob '!node_modules' "$TARGET" . || true

echo
printf '== Likely Python entry points ==\n'
rg -n --hidden --glob '*.py' --glob '!venv' --glob '!.git' \
  'if __name__ == "__main__":|@app\.|@router\.|@bp\.|@click\.command|@click\.group|@shared_task|@celery\.task|urlpatterns|path\(|re_path\(|@receiver' . || true

echo
printf '== Direct-looking calls ==\n'
rg -n --hidden --glob '*.py' --glob '!venv' --glob '!.git' "${TARGET}[[:space:]]*\(" . || true

echo
printf '== Registration / dispatch hints ==\n'
rg -n --hidden --glob '*.py' --glob '!venv' --glob '!.git' \
  'register|dispatch|signal|receiver|handler|callback|hook|middleware|Depends\(|include_router|add_api_route' . || true
