#!/bin/sh
# Copia o coletor do ct-assessmentspo para este repositório SaaS, sem alterações:
#   job/src/{connection,modules,utils}  ← ct-assessmentspo/src/...
#   portal/assets/dashboard.html        ← ct-assessmentspo/src/ui/dashboard.html
#   portal/sql/tenant/001_schema.sql    ← ct-assessmentspo/docs/SCHEMA.sql
# Uso: scripts/sync-collector.sh [caminho do ct-assessmentspo]   (padrão: ../ct-assessmentspo)
# Mudanças incrementais de schema no ct-assessmentspo (docs/migration_*.sql) entram como
# portal/sql/tenant/NNN_<nome>.sql — NÃO reaplique o 001 (ele faz DROP + CREATE).
set -e
SRC="${1:-$(dirname "$0")/../../ct-assessmentspo}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$SRC/src/main.ps1" ] || { echo "ct-assessmentspo não encontrado em $SRC"; exit 1; }
for d in connection modules utils; do
  rm -rf "$ROOT/job/src/$d"
  mkdir -p "$ROOT/job/src/$d"
  cp -R "$SRC/src/$d/." "$ROOT/job/src/$d/"
done
rm -f "$ROOT/job/src/utils/cert_gen.bat"
cp "$SRC/src/ui/dashboard.html" "$ROOT/portal/assets/dashboard.html"
if ! cmp -s "$SRC/docs/SCHEMA.sql" "$ROOT/portal/sql/tenant/001_schema.sql"; then
  echo "AVISO: docs/SCHEMA.sql mudou. Bancos já provisionados não recebem o 001 de novo:"
  echo "       crie uma migração incremental em portal/sql/tenant/ com a diferença."
fi
echo "Coletor sincronizado de $SRC ($(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo 'sem git'))."
