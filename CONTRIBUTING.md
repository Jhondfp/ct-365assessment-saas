# Guia de Contribuição — CT Assessment SaaS

## Estrutura de Branches

- `main`: Produção (releases estáveis)
- `develop`: Staging (branch base para desenvolvimento)
- `feature/*`: Novas features
- `bugfix/*`: Correções de bugs
- `release/*`: Preparação de release

## Workflow de Desenvolvimento

1. Crie uma branch a partir de `develop`:
   ```bash
   git checkout -b feature/minha-feature develop
   ```

2. Desenvolva e teste localmente:
   ```bash
   docker-compose up
   npm test
   ```

3. Faça commits pequenos e descritivos:
   ```bash
   git commit -m "feat: adicionar autenticação Entra ID"
   ```

4. Push para o repositório:
   ```bash
   git push origin feature/minha-feature
   ```

5. Crie um Pull Request para `develop`

## Commit Messages

Seguimos Conventional Commits:

- `feat:` Nova feature
- `fix:` Correção de bug
- `docs:` Documentação
- `refactor:` Refatoração
- `test:` Testes
- `chore:` Mudanças de build/CI
- `perf:` Melhorias de performance

Exemplos:

```
feat: implementar onboarding self-service do cliente
fix: corrigir leak de memória no pool de conexões SQL
docs: adicionar guia de deployment
```

## Code Review Checklist

Antes de submeter um PR:

- [ ] Código passa no linter (`npm run lint`)
- [ ] Testes passam (`npm test`)
- [ ] Sem arquivos `.env` ou secrets no commit
- [ ] Documentação atualizada
- [ ] Migrations SQL com versionamento (se aplicável)

## Tecnologias

### Backend
- Node.js 18+
- Express.js
- SQL Server / mssql
- Passport.js (Entra ID)

### Frontend
- React 18+
- TypeScript (recomendado)
- Axios (client HTTP)

### DevOps
- Docker + docker-compose
- Azure Bicep (IaC)
- GitHub Actions (CI/CD)

### Data Plane Jobs
- PowerShell 7+
- PnP PowerShell

## Setup Local

```bash
# Clonar
git clone <repo>
cd ct-365assessment-saas

# Copiar env
cp .env.example .env

# Iniciar containers
docker-compose up -d

# Verificar
curl http://localhost:3001/health
```

## Teste Local antes de PR

```bash
# Linting
npm run lint

# Testes unitários
npm test

# Build Docker
docker build -f Dockerfile -t ct-assessment-api:test .
```

## Perguntas?

Abra uma issue no repositório ou entre em contato com o time.

---

Obrigado por contribuir! 🚀
