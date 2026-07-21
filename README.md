# CT Assessment SaaS — Plataforma Multi-Tenant

Transformação de uma ferramenta single-tenant em plataforma SaaS multi-tenant com isolamento de dados por silo (banco dedicado por cliente).

## Arquitetura

- **Control Plane**: API central (multi-tenant, metadados apenas)
- **Data Planes**: Banco + Key Vault isolado por tenant
- **Execução**: Jobs containerizados, disparados sob demanda
- **Autenticação**: SSO via Entra ID (fluxo corporativo + onboarding)
- **FinOps**: Medição de custo por execução
- **LGPD**: Residência Brasil, direito ao esquecimento

## Estrutura do Projeto

```
/
├── control-plane/        # API central, painel administrativo
│   ├── backend/          # Node.js/Express
│   ├── frontend/         # React
│   └── migrations/       # SQL do control plane
├── data-plane-job/       # PowerShell containerizado
├── infrastructure/       # IaC (Bicep/Terraform)
├── docs/                 # Documentação
└── docker/               # Docker files
```

## Fases de Implementação

1. **Fase 1**: Control plane mínimo + onboarding manual
2. **Fase 2**: SSO real + execução containerizada
3. **Fase 3**: Onboarding self-service + FinOps

## Quick Start

```bash
# Será adicionado conforme progresso
```

## Requisitos

- Azure (SQL Database, Key Vault, App Service, Container Apps)
- Node.js 18+
- PowerShell 7+
- Docker

---

Documento de arquitetura: `docs/blueprint-architecture.md`
