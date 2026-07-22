# Implementação de 5 Features Prioritárias

**Data:** 2026-07-22  
**Status:** 🏗️ Em Desenvolvimento (Fase 1/2)

---

## Visão Geral

Implementação das 5 próximas prioridades solicitadas para o CT Assessment SaaS:

1. ✅ **Histórico de Versões** — Snapshots de execuções com comparação temporal
2. ✅ **Email de Notificação** — Fila de emails com envio assíncrono
3. ✅ **PDF Reports** — Geração e armazenamento de relatórios
4. ✅ **Customização** — Templates parametrizáveis de execução
5. 🔄 **Integração Real** — Conexão com dados de SharePoint/OneDrive

---

## 1. Histórico de Versões

### Objetivo
Guardar snapshots completos de cada execução para permitir comparação temporal e análise de progresso.

### Mudanças no Banco de Dados

**Nova tabela:** `execution_snapshots`
```sql
CREATE TABLE [dbo].[execution_snapshots] (
    [id] UNIQUEIDENTIFIER PRIMARY KEY,
    [execution_id] UNIQUEIDENTIFIER NOT NULL,
    [version_number] INT NOT NULL,
    [snapshot_data] NVARCHAR(MAX) NOT NULL, -- JSON completo
    [criado_em] DATETIME2 DEFAULT GETUTCDATE(),
    UNIQUE ([execution_id], [version_number])
);
```

**Nova coluna:** `executions.version_number` — número sequencial de versão

### Serviço Backend

**Arquivo:** `control-plane/backend/src/services/features.js`

Funções principais:
- `saveExecutionSnapshot(pool, executionId, snapshotData)` — Salvar snapshot
- `getExecutionVersions(pool, executionId)` — Listar todas as versões
- `getExecutionSnapshot(pool, executionId, versionNumber)` — Obter snapshot específico
- `compareExecutionSnapshots(pool, executionId, v1, v2)` — Comparar dois snapshots

### Endpoints de API

```
GET  /api/executions/:id/versions
     → Retorna: [{ version_number, criado_em }, ...]

GET  /api/executions/:id/versions/:version
     → Retorna: { version_number, snapshot_data, criado_em }

GET  /api/executions/:id/diff?v1=1&v2=2
     → Retorna: { v1_version, v2_version, findings_added, findings_removed, findings_changed }
```

### Frontend

**Página:** `control-plane/frontend/src/pages/ExecutionHistory.tsx`

Funcionalidades:
- Timeline de versões com data/hora
- Visualização de snapshot completo em JSON
- Seletor de duas versões para comparação
- Delta visual (adições em verde, remoções em vermelho)

### Workflow

1. Ao concluir execução, chamar `sp_SaveExecutionSnapshot` com dados da execução
2. Sistema auto-incrementa `version_number`
3. Usuário pode navegar histórico e comparar versões
4. Identifica achados novos, resolvidos, e alterados

---

## 2. Email de Notificação

### Objetivo
Notificar stakeholders sobre conclusão de assessment com link para relatório.

### Mudanças no Banco de Dados

**Nova tabela:** `email_queue`
```sql
CREATE TABLE [dbo].[email_queue] (
    [id] UNIQUEIDENTIFIER PRIMARY KEY,
    [execution_id] UNIQUEIDENTIFIER NOT NULL,
    [recipient_email] NVARCHAR(255) NOT NULL,
    [assunto] NVARCHAR(255) NOT NULL,
    [corpo_html] NVARCHAR(MAX) NOT NULL,
    [status] VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, bounced
    [tentativas] INT DEFAULT 0,
    [max_tentativas] INT DEFAULT 5,
    [criado_em] DATETIME2 DEFAULT GETUTCDATE(),
    [enviado_em] DATETIME2 NULL,
    [proxima_tentativa_em] DATETIME2 NULL
);
```

### Serviço Backend

**Arquivo:** `control-plane/backend/src/services/email.js`

Dependência: **SendGrid** (`@sendgrid/mail`)

Funções:
- `sendCompletionEmail(recipientEmail, executionData, reportUrl)` — Enviar email de conclusão
- `sendCustomEmail(recipientEmail, subject, htmlContent)` — Enviar email customizado
- `getCompletionEmailHtml(executionData, reportUrl)` — Gerar template HTML

### Job Processador

**Arquivo:** `control-plane/backend/src/jobs/email-processor.js`

Executar periodicamente (ex: a cada 5 minutos via cron):
```bash
node src/jobs/email-processor.js
```

Responsabilidades:
- Ler fila de emails pendentes (até 50 por execução)
- Enviar via SendGrid
- Marcar como enviado ou falha
- Retry automático com backoff
- Limpeza de emails antigos (>90 dias)

### Endpoints de API

```
GET  /api/admin/email-queue
     → Retorna: { pending_count, items: [...] }
```

### Configuração

Variáveis de ambiente (`.env`):
```bash
SENDGRID_API_KEY=<sendgrid-api-key>
SENDGRID_FROM_EMAIL=noreply@ctassessment.com.br
SENDGRID_REPLY_TO=support@ctassessment.com.br
```

### Template de Email

- Header gradiente com branding (laranja + roxo)
- Resumo: tenant, dados processados, custo, timestamp
- Botão "Visualizar Relatório" com link SAS (válido 24h)
- Footer com informações de compliance

---

## 3. PDF Reports

### Objetivo
Gerar relatórios em PDF com análise completa, armazenar no Azure Blob Storage, e compartilhar com links SAS.

### Mudanças no Banco de Dados

**Nova tabela:** `pdf_reports`
```sql
CREATE TABLE [dbo].[pdf_reports] (
    [id] UNIQUEIDENTIFIER PRIMARY KEY,
    [execution_id] UNIQUEIDENTIFIER NOT NULL UNIQUE,
    [blob_url] NVARCHAR(MAX) NOT NULL,
    [blob_sas_token] NVARCHAR(MAX) NULL,
    [tamanho_bytes] BIGINT NULL,
    [hash_md5] VARCHAR(32) NULL,
    [criado_em] DATETIME2 DEFAULT GETUTCDATE(),
    [expira_em] DATETIME2 NULL
);
```

### Serviço Backend

**Arquivo:** `control-plane/backend/src/services/pdf-generator.js`

Dependências:
- `html-pdf` — Converter HTML → PDF (simples, sem Chrome)
- `@azure/storage-blob` — Upload para Azure

Funções:
- `generateReportHtml(executionData)` — Gerar HTML estruturado
- `htmlToPdf(htmlContent)` — Converter para PDF
- `uploadPdfToBlob(pdfBuffer, executionId)` — Upload com SAS token
- `generateAndUploadPdf(executionData)` — Orquestração completa

### Conteúdo do Relatório

1. **Header** — Título, cliente, tenant
2. **Resumo** — Dados processados, tempo, custo
3. **Achados** — Lista com severity (high/medium/low), descrição, impacto, recomendação
4. **SharePoint Sites** — Tabela de sites analisados
5. **FinOps** — Custo por GB, custo total
6. **Footer** — Data de geração, compliance

### Endpoints de API

```
GET  /api/executions/:id/report/pdf
     → Retorna: { url, sas_token, size_bytes, created_at, expires_at }
```

### Configuração

Variáveis de ambiente:
```bash
AZURE_STORAGE_CONNECTION_STRING=<connection-string>
```

### Workflow

1. Ao concluir execução com sucesso, disparar `generateAndUploadPdf()`
2. Converter dados em HTML formatado
3. Gerar PDF (sem Chrome, simples e rápido)
4. Upload para Azure Blob Storage
5. Gerar SAS token válido por 24h
6. Salvar URL + token em `pdf_reports`
7. Usar URL no email de notificação

---

## 4. Customização & Templates

### Objetivo
Permitir que clientes parametrizem execuções (incluir/excluir dados, limites de tamanho, etc) e salvem templates reutilizáveis.

### Mudanças no Banco de Dados

**Nova tabela:** `execution_templates`
```sql
CREATE TABLE [dbo].[execution_templates] (
    [id] UNIQUEIDENTIFIER PRIMARY KEY,
    [tenant_id] UNIQUEIDENTIFIER NOT NULL,
    [template_nome] NVARCHAR(255) NOT NULL,
    [descricao] NVARCHAR(MAX) NULL,
    [config_json] NVARCHAR(MAX) NOT NULL, -- JSON com opções
    [criado_por] UNIQUEIDENTIFIER NOT NULL,
    [ativo] BIT DEFAULT 1,
    [criado_em] DATETIME2 DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 DEFAULT GETUTCDATE(),
    UNIQUE ([tenant_id], [template_nome])
);
```

**Novas colunas em `executions`:**
- `config_json` — Cópia da config usada na execução
- `execution_template_id` — Referência ao template (audit trail)

### Exemplos de Configuração

```json
{
  "includeDeleted": false,
  "maxFileSize": "100GB",
  "scanExternalShares": true,
  "maxExecutionTime": 3600,
  "includeOneDrive": true,
  "includeSharePoint": true,
  "scanPrivateChannels": false
}
```

### Serviço Backend

**Arquivo:** `control-plane/backend/src/services/features.js`

Funções:
- `createExecutionTemplate(pool, tenantId, templateName, configJson, createdBy, description)`
- `getExecutionTemplates(pool, tenantId)` — Listar templates ativos
- `getExecutionTemplate(pool, templateId)` — Obter template específico
- `updateExecutionTemplate(pool, templateId, updates)` — Atualizar
- `deleteExecutionTemplate(pool, templateId)` — Soft delete (ativo=0)

### Endpoints de API

```
POST   /api/execution-templates
       Body: { tenant_id, template_name, description, config }
       → Retorna: template completo

GET    /api/execution-templates/:tenantId
       → Retorna: [{ id, template_name, config_json, ... }, ...]

PUT    /api/execution-templates/:id
       Body: { template_name?, description?, config_json?, ativo? }
       → Retorna: template atualizado

DELETE /api/execution-templates/:id
       → Soft delete (ativo = 0)
```

### Frontend

**Página:** Aba em Executions (a implementar)

Funcionalidades:
- Dropdown "Use template" ao criar nova execução
- Formulário "Advanced Options" com checkboxes/inputs
- Botão "Save as template" após preencher
- Gerenciar/editar templates salvos

### Workflow

1. Usuário clica "New Execution"
2. Seleciona template do dropdown OU configura manualmente
3. Opções: includeDeleted, maxFileSize, scanExternalShares, etc
4. Clica "Save as template" para reutilizar depois
5. Sistema salva template em `execution_templates`
6. Ao disparar job, passar `config_json` via environment var ou arquivo
7. PowerShell job lê config e filtra dados conforme

---

## 5. Integração com Dados Reais (Próxima Fase)

### Status
🔄 **Em Planejamento** — Requer implementação de scripts PowerShell reais

### Requisitos

**Backend:**
- [ ] Service `sharepoint.js` com autenticação Graph API
- [ ] Validação de `siteUrl` e `driveUrl` antes de enfileirar
- [ ] Suporte a Managed Identity (Azure) e client credentials (dev)
- [ ] Callback para atualizar `executions` com resultados

**Data Plane Job (PowerShell):**
- [ ] Implementar `Get-SPOInfo.ps1` com chamadas reais ao Graph API
- [ ] Implementar `Get-OneDriveInfo.ps1`
- [ ] Coletar: compartilhamentos, permissões, tamanho por tipo de arquivo
- [ ] Salvar em banco isolado do tenant
- [ ] Retry logic com exponential backoff
- [ ] Log detalhado para auditoria LGPD

**Database (Tenant Isolado):**
- [ ] Schema para dados de SharePoint (sites, documents, permissions, etc)
- [ ] Tabela de achados (findings) com risk scoring

---

## Arquivos Criados/Modificados

### Banco de Dados
- ✅ `control-plane/migrations/002-add-features.sql` — Nova schema (tabelas, stored procedures)

### Backend (Node.js)
- ✅ `control-plane/backend/src/services/features.js` — Lógica das features
- ✅ `control-plane/backend/src/services/email.js` — SendGrid integration
- ✅ `control-plane/backend/src/services/pdf-generator.js` — PDF generation
- ✅ `control-plane/backend/src/routes/features.js` — Endpoints de API
- ✅ `control-plane/backend/src/jobs/email-processor.js` — Job de processamento
- ✅ `control-plane/backend/src/config/index.js` — Novas variáveis de env
- ✅ `control-plane/backend/package.json` — Novas dependências

### Frontend (React)
- ✅ `control-plane/frontend/src/types/index.ts` — Novos tipos TypeScript
- ✅ `control-plane/frontend/src/services/api.ts` — Novos métodos de API
- ✅ `control-plane/frontend/src/pages/ExecutionHistory.tsx` — Página de histórico

### Configuração
- ✅ `.env.example` — Novas variáveis (SendGrid, Azure Storage)

---

## Próximos Passos

### Curto Prazo (Semana 1)
1. Rodar migration SQL 002 no Control Plane DB
2. Instalar dependências: `npm install` no backend
3. Testes locais das APIs de histórico
4. Testar email-processor job

### Médio Prazo (Semana 2-3)
1. Setup SendGrid (obter API key)
2. Setup Azure Storage (obter connection string)
3. Implementar `sharepoint.js` com Graph API
4. Criar templates Bicep para esses novos recursos
5. Deploy em dev environment

### Longo Prazo (Semana 4+)
1. PowerShell scripts reais para coleta de dados
2. Testes de carga
3. Security review (OWASP top 10)
4. Conformidade LGPD

---

## Notas Técnicas

### Escalabilidade
- Email queue design permite horizontal scaling (múltiplos workers)
- PDF geração é assíncrona (não bloqueia API)
- Snapshots comprimem bem (JSON é ~20-30% de redundância)

### Segurança
- SAS tokens para PDFs expiram em 24h
- Emails enfileirados com retry seguro
- Audit trail completo em `execution_templates` (criado_por)
- Snapshots imutáveis após criação

### LGPD Compliance
- Snapshots retidos conforme policy (sugestão: 1-2 anos)
- Direito ao esquecimento: ao deletar tenant, limpar histórico
- Emails soft-deleted (nunca hard delete, sempre audit trail)

---

## Referências

- Migration SQL: `control-plane/migrations/002-add-features.sql`
- Tipos TypeScript: `control-plane/frontend/src/types/index.ts`
- Documentação de deployment: `docs/DEPLOYMENT.md`
- Status do projeto: `STATUS.md`
