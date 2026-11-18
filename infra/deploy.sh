#!/usr/bin/env bash
# Implanta o CT Assessment 365 SaaS num resource group (idempotente: rode de novo para atualizar).
#   1) infraestrutura (SQL + pool, Key Vault, ACR, Container Apps)  2) build das imagens no ACR
#   3) portal e job apontando para as imagens novas
# Pré-requisitos: az login. Os segredos ficam no Key Vault do ambiente (deploy-sql-admin-password, deploy-auth-secret…):
# basta exportar RG; o que estiver exportado tem precedência. No primeiro deploy (cofre ainda não existe), exporte tudo.
# Trocar AUTH_SECRET derruba as sessões; trocar JOB_SIGNING_SECRET invalida execuções em andamento.
#   RG, LOCATION                          ex.: rg-ctassessment, brazilsouth
#   SQL_ADMIN_PASSWORD                    senha forte do admin do Azure SQL
#   AUTH_SECRET, JOB_SIGNING_SECRET, WORKER_TOKEN   openssl rand -base64 33
# Não cria atribuições de papel (RBAC): Contributor no resource group basta.
# Opcionais: PREFIX, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ADMIN_EMAILS, INTERNAL_EMAIL_DOMAINS,
#            BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, TAG, REMOVE_OLD_WORKER=1
set -euo pipefail
cd "$(dirname "$0")/.."
: "${RG:?defina RG}"
PREFIX="${PREFIX:-ctassess}"
# Segredos do deploy guardados no Key Vault do ambiente (deploy-<nome>): o que não estiver exportado vem de lá.
KV=$(az keyvault list -g "$RG" --query "[?starts_with(name, '${PREFIX}-kv')].name | [0]" -o tsv 2>/dev/null || true)
for v in LOCATION SQL_ADMIN_PASSWORD AUTH_SECRET JOB_SIGNING_SECRET WORKER_TOKEN QUEUE_SQL_PASSWORD BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD ADMIN_EMAILS INTERNAL_EMAIL_DOMAINS; do
  if [ -z "${!v:-}" ] && [ -n "$KV" ]; then
    val=$(az keyvault secret show --vault-name "$KV" -n "deploy-$(echo "$v" | tr '_A-Z' '-a-z')" --query value -o tsv 2>/dev/null || true)
    [ -n "$val" ] && export "$v=$val"
  fi
done
: "${LOCATION:?defina LOCATION}" "${SQL_ADMIN_PASSWORD:?}" "${AUTH_SECRET:?}" "${JOB_SIGNING_SECRET:?}" "${WORKER_TOKEN:?}"
# senha do usuário só leitura da fila: gerada uma vez e guardada no cofre
if [ -z "${QUEUE_SQL_PASSWORD:-}" ]; then
  QUEUE_SQL_PASSWORD="$(openssl rand -base64 30 | tr -d '/+=' )Aa1!"
  [ -n "$KV" ] && az keyvault secret set --vault-name "$KV" -n deploy-queue-sql-password --value "$QUEUE_SQL_PASSWORD" -o none
fi
# Quem roda o deploy continua com acesso aos segredos (a política do Key Vault é recriada a cada deploy)
OPERATORS="${OPERATOR_OBJECT_IDS:-$(az ad signed-in-user show --query id -o tsv 2>/dev/null || true)}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)}"

common=(
  prefix="$PREFIX"
  sqlAdminPassword="$SQL_ADMIN_PASSWORD" authSecret="$AUTH_SECRET" jobSigningSecret="$JOB_SIGNING_SECRET" workerToken="$WORKER_TOKEN" queueSqlPassword="$QUEUE_SQL_PASSWORD"
  entraClientId="${ENTRA_CLIENT_ID:-}" entraClientSecret="${ENTRA_CLIENT_SECRET:-}"
  adminEmails="${ADMIN_EMAILS:-}" internalEmailDomains="${INTERNAL_EMAIL_DOMAINS:-cloudtarget.com.br}"
  bootstrapAdminEmail="${BOOTSTRAP_ADMIN_EMAIL:-}" bootstrapAdminPassword="${BOOTSTRAP_ADMIN_PASSWORD:-}"
  operatorObjectIds="$(printf '%s' "$OPERATORS" | tr ', ' '\n\n' | sed '/^$/d' | jq -R . | jq -sc .)"
)

az group show -n "$RG" -o none 2>/dev/null || az group create -n "$RG" -l "$LOCATION" -o none
ACR=$(az acr list -g "$RG" --query "[?starts_with(name, '${PREFIX}acr')].name | [0]" -o tsv)
if [ -z "$ACR" ]; then
  echo "== 1/3 infraestrutura inicial (imagens provisórias)"
  ACR=$(az deployment group create -g "$RG" -f infra/main.bicep -p "${common[@]}" --query properties.outputs.acrName.value -o tsv)
fi
LOGIN=$(az acr show -n "$ACR" --query loginServer -o tsv)

echo "== 2/3 build das imagens no ACR $ACR (tag $TAG)"
az acr build -r "$ACR" -t "ctassessment-portal:$TAG" portal
az acr build -r "$ACR" -t "ctassessment-job:$TAG" job

echo "== 3/3 portal e coletor (Container Apps Job da fila) com as imagens novas"
az deployment group create -g "$RG" -f infra/main.bicep \
  -p "${common[@]}" portalImage="$LOGIN/ctassessment-portal:$TAG" jobImage="$LOGIN/ctassessment-job:$TAG" \
  --query "properties.outputs.{portal:portalUrl.value, redirectUri:entraRedirectUri.value, keyVault:keyVaultUri.value, sql:sqlServer.value}" -o table

# Versões anteriores tinham um worker sempre ligado (<prefix>-worker). O coletor agora é o job <prefix>-coletor.
# Só remove o worker antigo quando pedido (REMOVE_OLD_WORKER=1), depois que as coletas que ele roda terminarem.
if [ "${REMOVE_OLD_WORKER:-0}" = "1" ] && az containerapp show -g "$RG" -n "${PREFIX}-worker" -o none 2>/dev/null; then
  echo "== removendo o worker antigo ${PREFIX}-worker"
  az containerapp delete -g "$RG" -n "${PREFIX}-worker" --yes -o none
fi
