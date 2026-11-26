# Operação no Azure: acesso e publicação (guia para uma nova sessão)

Guia para uma sessão do Claude Code (ou uma pessoa) que precisa publicar o CT Assessment 365 no Azure.
Nenhum segredo fica neste arquivo: os valores estão no Key Vault do ambiente.

## 1. Ambiente

| Item | Valor |
|---|---|
| Assinatura | Produtos Cloud Target (ID: `az account list --query "[?name=='Produtos Cloud Target'].id" -o tsv`) |
| Tenant | Cloud Target (ID: `az account show --query tenantId -o tsv`) |
| Resource group | `rg-365gov-prod` (Brazil South) |
| Portal (Container App) | `ctassess-portal` · https://assessment.cloudtarget.com.br |
| Coletor (Container Apps Job) | `ctassess-coletor` |
| Ambiente do Container Apps | `ctassess-env` (certificado gerenciado do domínio `assessment.cloudtarget.com.br`) |
| Registro de imagens (ACR) | `ctassessacrfkavhoh235cpq` (`ctassessacrfkavhoh235cpq.azurecr.io`) |
| Key Vault | `ctassess-kv-fkavhoh235cp` |
| Azure SQL | `ctassess-sql-fkavhoh235cpq` (banco do portal `ctassessment_portal` + elastic pool `ctassess-pool`) |
| Log Analytics | `ctassess-logs` (workspace id: `az monitor log-analytics workspace show -g rg-365gov-prod -n ctassess-logs --query customerId -o tsv`) |
| Branch de trabalho | `claude/serene-edison-y8durm` (repositório `Jhondfp/ct-365assessment-saas`) |

## 2. Como a sessão ganha acesso ao Azure

Não há credencial guardada para o Claude: ele usa **o login do próprio usuário** no Azure CLI, por código de dispositivo.

1. A sessão roda (em segundo plano, porque o comando espera o login terminar):
   ```bash
   az login --use-device-code --allow-no-subscriptions > /tmp/azlogin.log 2>&1 &
   ```
2. Lê `/tmp/azlogin.log`, que traz um **código** e o endereço **https://login.microsoft.com/device**, e passa os dois ao usuário.
3. O usuário abre o endereço, digita o código e entra com a **conta dele** (precisa de Contributor no `rg-365gov-prod`).
4. A sessão confirma e fixa a assinatura:
   ```bash
   az account set --subscription "Produtos Cloud Target"
   ```
   ```bash
   az account show --query "{usuario:user.name, assinatura:name}" -o table
   ```

O acesso vale enquanto o container da sessão existir. Para encerrar antes: `az logout` na sessão, ou "Revogar sessões" do usuário no Entra ID.
Tudo o que a sessão faz no Azure fica registrado no log de atividades em nome do usuário.

**Rede:** o proxy da sessão às vezes corta conexões longas do `az` (`Connection reset by peer`). Repita o comando (até 3 vezes) e confirme o resultado em vez de assumir que falhou.

## 3. Publicar uma versão nova (o caminho usado no dia a dia)

Use a **tag = commit curto** para saber sempre o que está no ar.

1. Validar antes (na raiz do repositório):
   ```bash
   cd portal && npx tsc --noEmit && npx next build && cd ..
   ```
   ```bash
   for t in Pipeline VersionCleanup Delete Resume Google; do pwsh -NoProfile -File job/tests/Test-$t.ps1 || break; done
   ```
2. Commit e push na branch de trabalho.
3. Gerar a imagem no ACR (o build roda no Azure, não precisa de Docker local). Confirme pela lista de tags, porque o `az acr build` pode cair no meio pelo proxy mesmo tendo terminado:
   ```bash
   TAG=$(git rev-parse --short HEAD); ACR=ctassessacrfkavhoh235cpq
   ```
   ```bash
   az acr build -r $ACR -t ctassessment-portal:$TAG --no-logs portal
   ```
   ```bash
   az acr repository show-tags -n $ACR --repository ctassessment-portal -o tsv | grep -x $TAG
   ```
   Para o coletor, o mesmo com `-t ctassessment-job:$TAG ... job` e `--repository ctassessment-job`.
4. Trocar a imagem do portal (cria uma revisão nova; a antiga só sai quando a nova fica saudável):
   ```bash
   az containerapp update -g rg-365gov-prod -n ctassess-portal --image $ACR.azurecr.io/ctassessment-portal:$TAG --query properties.latestRevisionName -o tsv
   ```
5. Trocar a imagem do coletor (só quando `job/` mudou):
   ```bash
   az containerapp job update -g rg-365gov-prod -n ctassess-coletor --image $ACR.azurecr.io/ctassessment-job:$TAG
   ```
6. Conferir:
   ```bash
   az containerapp revision show -g rg-365gov-prod -n ctassess-portal --revision <revisão> --query properties.healthState -o tsv
   ```
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://assessment.cloudtarget.com.br/login
   ```
   ```bash
   az containerapp show -g rg-365gov-prod -n ctassess-portal --query "properties.configuration.ingress.customDomains[].name" -o tsv
   ```
   Esperado: `Healthy`, `200` e `assessment.cloudtarget.com.br`.

O portal aplica as migrações do Prisma ao iniciar. As migrações dos bancos de clientes (`portal/sql/tenant`) são aplicadas pelo portal antes de cada coleta.

## 4. Cuidados antes de publicar

- **Coletas em andamento:** publicar o portal ou o coletor **não interrompe** coletas que já estão rodando (cada execução termina com a imagem com que começou). Mesmo assim, avise o usuário e confira o que está rodando:
  ```bash
  az containerapp job execution list -g rg-365gov-prod -n ctassess-coletor --query "[?properties.status=='Running'].{nome:name,inicio:properties.startTime}" -o table
  ```
- **Domínio próprio:** `az containerapp update --image` preserva o domínio. Não remova `customDomains` nem mude `AUTH_URL` (deve ser `https://assessment.cloudtarget.com.br`, senão o login Microsoft quebra).
- **Só publique com pedido explícito do usuário** na conversa atual.
- **Não mexa** no servidor externo `assess-sql-server` (fora da assinatura) nem em bancos legados sem o usuário pedir.
- Nunca coloque segredo em commit, variável comum ou chat: use o Key Vault.

## 5. Implantação completa (infra + imagens)

Para mudanças no `infra/main.bicep` ou para recriar o ambiente:

```bash
RG=rg-365gov-prod infra/deploy.sh
```

O script lê do Key Vault os segredos `deploy-*` (o que estiver exportado no shell tem precedência), aplica o Bicep (Azure SQL, Key Vault, ACR, Container Apps, domínio próprio, regra de escala do coletor), gera as imagens e atualiza portal e coletor. É idempotente.

| Segredo `deploy-*` | Uso |
|---|---|
| `deploy-location`, `deploy-sql-admin-password` | Região e senha do admin do Azure SQL |
| `deploy-auth-secret` | Sessões do portal (trocar derruba as sessões) |
| `deploy-job-signing-secret` | Tokens das execuções (trocar invalida execuções em andamento) |
| `deploy-worker-token`, `deploy-queue-sql-password` | Coletor ↔ portal e usuário `queue_reader` da regra de escala |
| `deploy-entra-client-id`, `deploy-entra-tenant-id`, `deploy-entra-client-secret` | Login Microsoft (App Registration de locatário único; segredo vence em 24/11/2027) |
| `deploy-custom-domain`, `deploy-custom-domain-cert` | Domínio `assessment.cloudtarget.com.br` e o certificado gerenciado |
| `deploy-admin-emails`, `deploy-internal-email-domains`, `deploy-bootstrap-*` | Regras de entrada e primeiro administrador |

Nenhum papel RBAC é criado: Contributor no resource group basta.

## 6. Diagnóstico

- Logs do portal:
  ```bash
  az containerapp logs show -g rg-365gov-prod -n ctassess-portal --tail 80 --format text
  ```
- Logs de uma execução do coletor:
  ```bash
  az containerapp job logs show -g rg-365gov-prod -n ctassess-coletor --execution <nome> --container collector --tail 50 --format text
  ```
- Histórico (Log Analytics, KQL), por exemplo os lotes de uma coleta:
  ```bash
  az monitor log-analytics query -w $(az monitor log-analytics workspace show -g rg-365gov-prod -n ctassess-logs --query customerId -o tsv) --analytics-query "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(1d) and ContainerJobName_s == 'ctassess-coletor' and Log_s has '[Lotes]' | project TimeGenerated, Log_s | order by TimeGenerated asc" -o tsv
  ```

## 7. Voltar uma versão

As imagens ficam no ACR com a tag do commit (e `v1.0.0` na primeira versão fechada). Para voltar, rode o passo 4 (e/ou 5) da seção 3 com a tag anterior. Liste as tags com:

```bash
az acr repository show-tags -n ctassessacrfkavhoh235cpq --repository ctassessment-portal --orderby time_desc --top 10 -o tsv
```
