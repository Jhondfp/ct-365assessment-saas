#!/bin/sh
# Inicialização em produção (container ou App Service):
# 1) aplica as migrações pendentes  2) garante o administrador inicial  3) sobe o Next.js
set -e

# O Azure SQL às vezes recusa a primeira conexão (manutenção, failover, gateway reiniciando).
# Tenta algumas vezes antes de desistir, para o site não cair por uma falha momentânea.
echo "[start] aplicando migrações do banco"
n=1
until npx prisma migrate deploy; do
  if [ "$n" -ge 6 ]; then echo "[start] banco indisponível após $n tentativas"; exit 1; fi
  echo "[start] banco não respondeu (tentativa $n); nova tentativa em $((n * 10))s"
  sleep $((n * 10))
  n=$((n + 1))
done

# só age se BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD estiverem definidos;
# uma falha aqui não derruba o site
node scripts/bootstrap-admin.mjs || echo "[start] aviso: bootstrap do administrador falhou"
# usuário só de leitura da fila para a regra de escala do coletor (KEDA)
node scripts/ensure-queue-reader.mjs || echo "[start] aviso: usuário da fila não foi preparado"

echo "[start] iniciando o portal CT Assessment 365 na porta ${PORT:-3000}"
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
