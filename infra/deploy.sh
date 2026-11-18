#!/usr/bin/env bash
# Implanta o CT Assessment 365 SaaS num resource group (idempotente: rode de novo para atualizar).
#   1) infraestrutura (SQL + pool, Key Vault, ACR, Container Apps)  2) build das imagens no ACR
#   3) portal e job apontando para as imagens novas
# Pré-requisitos: az login; variáveis abaixo exportadas (guarde-as num cofre: trocar AUTH_SECRET derruba as sessões,
# trocar JOB_SIGNING_SECRET invalida execuções em andamento).
#   RG, LOCATION                          ex.: rg-ctassessment, brazilsouth
#   SQL_ADMIN_PASSWORD                    senha forte do admin do Azure SQL
#   AUTH_SECRET, JOB_SIGNING_SECRET, WORKER_TOKEN   openssl rand -base64 33
# Não cria atribuições de papel (RBAC): Contributor no resource group basta.
# Opcionais: PREFIX, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ADMIN_EMAILS, INTERNAL_EMAIL_DOMAINS,
#            BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, TAG, REMOVE_OLD_WORKER=1
set -euo pipefail
cd "$(dirname "$0")/.."
: "${RG:?defina RG}" "${LOCATION:?defina LOCATION}" "${SQL_ADMIN_PASSWORD:?}" "${AUTH_SECRET:?}" "${JOB_SIGNING_SECRET:?}" "${WORKER_TOKEN:?}"
PREFIX="${PREFIX:-ctassess}"
TAG="${TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)}"

common=(
  prefix="$PREFIX"
  sqlAdminPassword="$SQL_ADMIN_PASSWORD" authSecret="$AUTH_SECRET" jobSigningSecret="$JOB_SIGNING_SECRET" workerToken="$WORKER_TOKEN"
  entraClientId="${ENTRA_CLIENT_ID:-}" entraClientSecret="${ENTRA_CLIENT_SECRET:-}"
  adminEmails="${ADMIN_EMAILS:-}" internalEmailDomains="${INTERNAL_EMAIL_DOMAINS:-cloudtarget.com.br}"
  bootstrapAdminEmail="${BOOTSTRAP_ADMIN_EMAIL:-}" bootstrapAdminPassword="${BOOTSTRAP_ADMIN_PASSWORD:-}"
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
