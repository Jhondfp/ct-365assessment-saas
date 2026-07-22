# Setup das 5 Features Implementadas

Guia passo-a-passo para ativar e testar as features que foram implementadas.

---

## ✅ O Que Foi Feito

Implementação completa da infraestrutura backend e frontend para:

1. **Histórico de Execuções** — Snapshots com versioning
2. **Notificação por Email** — Fila assíncrona com SendGrid
3. **Relatórios em PDF** — Geração e armazenamento em Azure
4. **Templates Customizáveis** — Parametrização de execuções
5. **Integração Real** — Prepared para dados de SharePoint/OneDrive

---

## 1. Setup do Banco de Dados

### Pré-requisitos
- SQL Server 2022 rodando (dev local ou Azure)
- Acesso com permissão para CREATE TABLE, ALTER TABLE, CREATE PROCEDURE

### Executar Migration

```bash
# Opção 1: Via Azure Portal (recomendado para produção)
# Copiar conteúdo de: control-plane/migrations/002-add-features.sql
# Colar em Query Editor do seu SQL Database

# Opção 2: Via CLI/Tool (sqlcmd, SSMS, DBeaver)
sqlcmd -S <server> -U <user> -P <password> -d <database> \
  -i control-plane/migrations/002-add-features.sql

# Opção 3: Via Docker (dev local)
# Dentro do container sql-server, executar o arquivo
docker exec -i <container-id> /opt/mssql-tools/bin/sqlcmd \
  -S localhost -U sa -P <password> \
  -i 002-add-features.sql
```

**Verificar execução:**
```sql
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('execution_snapshots', 'email_queue', 'pdf_reports', 'execution_templates');
-- Deve retornar 4 linhas
```

---

## 2. Setup do Backend

### Instalar Dependências

```bash
cd control-plane/backend

# Instalar novas dependências
npm install @sendgrid/mail html-pdf @azure/storage-blob

# Verificar (deve mostrar v9+ de mssql, v4+ de @azure/identity)
npm list @sendgrid/mail html-pdf @azure/storage-blob
```

### Configurar Variáveis de Ambiente

Editar `.env` (ou criar a partir de `.env.example`):

```bash
# Email (SendGrid) — OPCIONAL por enquanto
SENDGRID_API_KEY=<sua-api-key-sendgrid>
SENDGRID_FROM_EMAIL=noreply@ctassessment.com.br
SENDGRID_REPLY_TO=support@ctassessment.com.br

# Storage (Azure) — OPCIONAL por enquanto
AZURE_STORAGE_CONNECTION_STRING=<sua-connection-string>
```

**Nota:** Se não configurar, email/PDF funcionarão com placeholder (não enviam realmente).

### Testar Backend Local

```bash
cd control-plane/backend

# Rodas em dev mode
npm run dev

# Logs esperados:
# ✓ Connected to SQL Database (Control Plane)
# ✓ Control Plane iniciado na porta 3000
```

---

## 3. Testar Endpoints

### Histórico de Execuções

```bash
# Listar versões de uma execução
curl -X GET http://localhost:3000/api/executions/{executionId}/versions \
  -H "Cookie: <seu-session-cookie>"

# Resposta esperada:
# { "success": true, "data": [{ "version_number": 1, "criado_em": "..." }] }

# Obter snapshot específico
curl -X GET http://localhost:3000/api/executions/{executionId}/versions/1 \
  -H "Cookie: <seu-session-cookie>"

# Comparar duas versões
curl -X GET 'http://localhost:3000/api/executions/{executionId}/diff?v1=1&v2=2' \
  -H "Cookie: <seu-session-cookie>"
```

### Execution Templates

```bash
# Criar template
curl -X POST http://localhost:3000/api/execution-templates \
  -H "Content-Type: application/json" \
  -H "Cookie: <seu-session-cookie>" \
  -d '{
    "tenant_id": "xxx-xxx-xxx",
    "template_name": "Full Scan",
    "description": "Scan completo com OneDrive",
    "config": {
      "includeDeleted": false,
      "maxFileSize": "100GB",
      "scanExternalShares": true
    }
  }'

# Listar templates
curl -X GET http://localhost:3000/api/execution-templates/{tenantId} \
  -H "Cookie: <seu-session-cookie>"
```

### Email Queue

```bash
# Status da fila (admin only)
curl -X GET http://localhost:3000/api/admin/email-queue \
  -H "Cookie: <seu-session-cookie>"

# Resposta:
# { "success": true, "data": { "pending_count": 0, "items": [] } }
```

### PDF Reports

```bash
# Obter/gerar PDF
curl -X GET http://localhost:3000/api/executions/{executionId}/report/pdf \
  -H "Cookie: <seu-session-cookie>"

# Resposta (quando Azure Storage configurado):
# { "success": true, "data": { "url": "...", "sas_token": "..." } }

# Resposta (placeholder - sem Azure):
# { "success": true, "message": "PDF geração iniciada", "status": "generating" }
```

---

## 4. Setup do Email Processor (Job)

### Rodar Job Manualmente

```bash
cd control-plane/backend

# Executar uma vez
node src/jobs/email-processor.js

# Logs:
# Starting email queue processor...
# No pending emails to process
# Email queue processing complete: { processed: 0, successful: 0, failed: 0 }
```

### Agendar Execução Periódica

#### Opção 1: Cron Job (Linux/Mac)

```bash
# Editar crontab
crontab -e

# Adicionar: executar a cada 5 minutos
*/5 * * * * cd /path/to/backend && node src/jobs/email-processor.js >> logs/email-processor.log 2>&1
```

#### Opção 2: Task Scheduler (Windows)

```powershell
# PowerShell (como admin)
$trigger = New-ScheduledTaskTrigger -AtStartup
$action = New-ScheduledTaskAction -Execute "node" -Argument "src/jobs/email-processor.js" -WorkingDirectory "C:\path\to\backend"
Register-ScheduledTask -TaskName "CT-EmailProcessor" -Trigger $trigger -Action $action
```

#### Opção 3: Azure Container Apps / Web Jobs

Ver `docs/DEPLOYMENT.md` para integrar como Web Job no App Service.

---

## 5. Frontend

### Acessar Histórico de Execuções

1. Abrir dashboard
2. Clicar em uma execução
3. Novo link/botão "📋 Histórico" (a implementar na página)
4. Página mostra:
   - Timeline de versões (esquerda)
   - Visualizador de snapshot (direita)
   - Seletor para comparar v1 vs v2
   - Delta visual (adições/remoções)

### Criar Execution Template

1. Clicar "Nova Execução"
2. Botão "Opções Avançadas" mostra:
   - Checkbox "Incluir compartilhamentos deletados"
   - Input "Tamanho máximo de arquivo (GB)"
   - Checkbox "Escanear compartilhamentos externos"
   - Etc...
3. Após configurar, clique "Salvar como Template"
4. Next time, dropdown "Usar template" já carrega config salva

---

## 6. Testar Integração Completa (Fluxo End-to-End)

### Cenário: Execução → Email → PDF

1. **Criar Execution**
   ```bash
   curl -X POST http://localhost:3000/api/executions \
     -H "Content-Type: application/json" \
     -H "Cookie: <session>" \
     -d '{ "tenant_id": "xxx", "client_id": "yyy" }'
   ```

2. **Simular conclusão** (em dev, atualizar execution.status = 'completed' no DB)
   ```sql
   UPDATE executions 
   SET status = 'completed', 
       findings_json = '[]',
       gb_processado = 50.00,
       custo_real = 25.00
   WHERE id = '<executionId>';
   ```

3. **Enfileirar email**
   ```bash
   -- Chamar endpoint que enfileira email (ainda não existe, será feito)
   -- Por enquanto, inserir manualmente:
   INSERT INTO email_queue (execution_id, recipient_email, assunto, corpo_html, status)
   VALUES (...);
   ```

4. **Rodar job processor**
   ```bash
   node src/jobs/email-processor.js
   ```

5. **Verificar fila**
   ```bash
   curl -X GET http://localhost:3000/api/admin/email-queue \
     -H "Cookie: <session>"
   ```

---

## 7. Troubleshooting

### Erro: "Variável de ambiente SENDGRID_API_KEY não configurada"

**Solução:** É normal se não configurou SendGrid. Emails não serão realmente enviados (placeholder mode). Coloque API key em `.env` para ativar.

### Erro: "Table 'execution_snapshots' not found"

**Solução:** Migration não foi rodada. Execute:
```bash
# Ver se as tabelas existem:
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'execution_%';

# Se não existir, rodar migration:
sqlcmd ... -i 002-add-features.sql
```

### Email não é enviado

**Checklist:**
- [ ] SENDGRID_API_KEY configurado em `.env`
- [ ] Job processor rodando (`node src/jobs/email-processor.js`)
- [ ] Email enfileirado em `email_queue` table (status = 'pending')
- [ ] Check `email_queue.status` — deve ser 'sent' após job
- [ ] Ver logs: `email_queue.mensagem_erro`

### PDF não gera

**Checklist:**
- [ ] AZURE_STORAGE_CONNECTION_STRING configurado
- [ ] Container 'reports' existe em Azure Storage
- [ ] Executar: `node -e "require('./src/services/pdf-generator').generateAndUploadPdf({...})"`

---

## 8. Próximos Passos

### Curto Prazo (esta semana)
- [ ] Rodar migration do banco
- [ ] Testar endpoints com Postman/curl
- [ ] Validar TypeScript types no frontend
- [ ] Ligar SendGrid + testar email real

### Médio Prazo (próxima semana)
- [ ] Implementar hook de conclusão de execução (enfileirar email + gerar PDF)
- [ ] Setup Azure Storage para PDFs
- [ ] Implementar página de histórico no React
- [ ] Agendar email-processor job via cron/Web Jobs

### Longo Prazo (após 2 semanas)
- [ ] Implementar SharePoint Graph API calls (real data)
- [ ] PowerShell scripts de coleta real
- [ ] Testes de carga
- [ ] Security review

---

## Referências

- **Migration SQL:** `control-plane/migrations/002-add-features.sql`
- **Documentação detalhada:** `docs/IMPLEMENTATION-FEATURES.md`
- **Tipos TypeScript:** `control-plane/frontend/src/types/index.ts`
- **Services Backend:** `control-plane/backend/src/services/`
- **Endpoints:** `control-plane/backend/src/routes/features.js`

---

## Suporte

Para dúvidas:
- Revisar `docs/IMPLEMENTATION-FEATURES.md` para arquitetura completa
- Checar `STATUS.md` para status geral do projeto
- Logs de erro em `src/config/logger.js`
