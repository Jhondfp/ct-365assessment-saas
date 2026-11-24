import type { ReactNode } from "react";
import { requirePagePerm } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/report/ReportToolbar";

/**
 * Documentação técnica da aplicação (só Administrador). Página estática: atualize junto com README.md/CLAUDE.md
 * quando a arquitetura mudar. "Exportar PDF" usa a impressão do navegador (estilos @media print em globals.css).
 */
export const metadata = { title: "Documentação técnica · Assessment365" };
const UPDATED = "24/11/2026";

const TOC = [
  ["visao", "1. Visão geral"],
  ["arquitetura", "2. Arquitetura e recursos Azure"],
  ["coleta", "3. Como uma coleta funciona"],
  ["modulos", "4. Módulos funcionais"],
  ["seguranca", "5. Segurança"],
  ["dados", "6. Dados"],
  ["apis", "7. APIs"],
  ["config", "8. Configuração"],
  ["operacao", "9. Operação e implantação"],
  ["qualidade", "10. Testes e validação"],
  ["problemas", "11. Solução de problemas"],
  ["pendencias", "12. Pendências conhecidas"],
] as const;

function Sec({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="doc-sec card scroll-mt-16">
      <h2 className="mb-4 text-lg font-semibold text-ct-ink">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}
function H({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}
function T({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="doc-table overflow-x-auto">
      <table className="tbl">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="align-top">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const C = ({ children }: { children: ReactNode }) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-800">{children}</code>;
const Box = ({ title, children, tone = "slate" }: { title: string; children: ReactNode; tone?: "slate" | "purple" | "blue" | "orange" }) => {
  const t = { slate: "border-slate-300 bg-white", purple: "border-ct-purple/40 bg-purple-50", blue: "border-blue-300 bg-blue-50", orange: "border-orange-300 bg-orange-50" }[tone];
  return <div className={`rounded-lg border p-3 ${t}`}><p className="text-sm font-semibold text-ct-ink">{title}</p><div className="mt-1 text-xs leading-relaxed text-slate-600">{children}</div></div>;
};

export default async function Documentacao() {
  await requirePagePerm("users:manage");
  return (
    <div className="doc">
      <PageHeader title="Documentação técnica" subtitle={`CT Assessment 365 · portal, coletor e infraestrutura · atualizada em ${UPDATED}`} actions={<PrintButton label="Exportar PDF" />} />

      <nav className="card mb-6 print:break-after-page" aria-label="Sumário">
        <h2 className="card-title">Sumário</h2>
        <ol className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {TOC.map(([id, label]) => <li key={id}><a className="link" href={`#${id}`}>{label}</a></li>)}
        </ol>
        <p className="mt-4 text-xs text-slate-500">Uso interno da Cloud Target · visível só para Administradores. Os valores de segredos nunca aparecem aqui: só os nomes de onde estão guardados.</p>
      </nav>

      <div className="space-y-6">
        <Sec id="visao" title="1. Visão geral">
          <p><b>CT Assessment 365</b> é o SaaS da Cloud Target para levantamento de governança de <b>Microsoft 365</b> (SharePoint, OneDrive, licenças, adoção, Exchange, Intune) e para levantamento de <b>Google Workspace</b> com foco em migração para o Microsoft 365. Substitui o coletor on-premises <C>ct-assessmentspo</C>, que será descontinuado: o coletor PowerShell agora vive e evolui só neste repositório.</p>
          <T head={["Item", "Valor"]} rows={[
            ["Endereço", <C key="u">https://assessment.cloudtarget.com.br</C>],
            ["Repositório", <C key="r">Jhondfp/ct-365assessment-saas</C>],
            ["Ambiente", <>Azure · assinatura “Produtos Cloud Target” · resource group <C>rg-365gov-prod</C> · região Brazil South</>],
            ["Quem usa", "Somente a equipe Cloud Target nesta fase (perfis Administrador, Executor, Visualizador)"],
            ["Stack do portal", "Next.js 15 (App Router, Server Actions) · Auth.js v5 · Prisma 6 · Tailwind · layout do Target360"],
            ["Stack do coletor", "PowerShell 7.4 · PnP.PowerShell · Microsoft Graph · APIs do Google Workspace (Admin SDK)"],
            ["Bancos", "Azure SQL: 1 banco do portal + 1 banco por cliente (elastic pool)"],
          ]} />
        </Sec>

        <Sec id="arquitetura" title="2. Arquitetura e recursos Azure">
          <div className="grid gap-3 md:grid-cols-3">
            <Box title="Usuários (equipe CT)" tone="slate">Login Microsoft (Entra ID, tenant Cloud Target) ou e-mail e senha. Acesso por perfil.</Box>
            <Box title="Portal · ctassess-portal" tone="purple">Container App (1 vCPU, 2 GiB). Telas, fila de trabalho, relatórios, APIs do coletor, acesso ao Key Vault e aos bancos.</Box>
            <Box title="Coletor · ctassess-coletor" tone="purple">Container Apps Job disparado pela fila (2 vCPU, 4 GiB, até 10 execuções, 24 h máx.). Uma execução = um trabalho.</Box>
            <Box title="Banco do portal · ctassessment_portal" tone="blue">Usuários, perfis, clientes, execuções, lotes, auditoria. Prisma.</Box>
            <Box title="Bancos dos clientes · elastic pool" tone="blue">1 banco por cliente (silo) com o schema do coletor e as procedures do dashboard.</Box>
            <Box title="Key Vault" tone="orange">Credenciais de cada cliente, senhas dos bancos, segredos de implantação (deploy-*). Access policies, sem RBAC.</Box>
          </div>
          <p className="text-xs text-slate-500">Fluxo: usuário → portal → fila no banco do portal → regra KEDA dispara o coletor → coletor pede trabalho ao portal, lê a configuração, coleta no tenant do cliente e grava no banco do cliente → portal lê o banco do cliente para montar o relatório.</p>
          <T head={["Recurso", "Nome", "Função"]} rows={[
            ["Container Apps Environment", <C key="a">ctassess-env</C>, "Hospeda o portal e o job do coletor; certificado gerenciado do domínio próprio"],
            ["Container App (portal)", <C key="b">ctassess-portal</C>, "Next.js na porta 3000; domínio assessment.cloudtarget.com.br (SNI, certificado gerenciado)"],
            ["Container Apps Job (coletor)", <C key="c">ctassess-coletor</C>, "Disparado por regra KEDA mssql a cada 30 s; maxExecutions = maxCollectors (10)"],
            ["Azure SQL Server", <C key="d">ctassess-sql-fkavhoh235cpq</C>, "Banco do portal (S0) e elastic pool dos clientes (Standard, 50 eDTU); auditoria ligada"],
            ["Key Vault", <C key="e">ctassess-kv-fkavhoh235cp</C>, "Segredos; logs de auditoria no Log Analytics"],
            ["Container Registry", <C key="f">ctassessacrfkavhoh235cpq</C>, "Imagens ctassessment-portal e ctassessment-job (tag = commit)"],
            ["Log Analytics", <C key="g">ctassess-logs</C>, "Logs dos containers e auditoria (SQL e Key Vault), 30 dias"],
            ["Identidade gerenciada", <C key="h">ctassess-id-portal</C>, "Identidade do portal para o Key Vault"],
          ]} />
          <p><b>Decisão de projeto:</b> nada depende de papéis RBAC no Azure (a conta de operação tem só Contributor). O ACR usa usuário admin e o Key Vault usa access policies; nenhum role assignment é criado pelo Bicep.</p>
        </Sec>

        <Sec id="coleta" title="3. Como uma coleta funciona">
          <ol className="list-decimal space-y-2 pl-5">
            <li><b>Fila:</b> iniciar uma coleta cria um registro <C>Assessment</C> com status <C>QUEUED</C> no banco do portal.</li>
            <li><b>Escala:</b> a regra KEDA do job lê o banco do portal com o usuário <C>queue_reader</C> (só SELECT em Assessment/AssessmentTask) e conta trabalho em andamento + pendente. O KEDA desconta as execuções que já rodam e sobe a diferença.</li>
            <li><b>Claim:</b> cada execução roda <C>job/Start-Worker.ps1 -Once</C>, chama <C>POST /api/jobs/claim</C> com o <C>WORKER_TOKEN</C> e recebe <b>um</b> trabalho (coleta ou lote) com um token HMAC próprio.</li>
            <li><b>Configuração:</b> <C>GET /api/jobs/&lt;id&gt;</C> devolve parâmetros e credenciais (lidas do Key Vault na hora). O <C>.pfx</C> vai para arquivo temporário apagado no fim; nada fica na imagem.</li>
            <li><b>Execução:</b> <C>job/Invoke-SaasAssessment.ps1</C> roda a checagem prévia e cada workload isolado (um que falha não derruba os outros). Status final: <C>completed</C>, <C>partial</C> ou <C>failed</C>.</li>
            <li><b>Progresso:</b> a cada 10 s, <C>POST /api/jobs/&lt;id&gt;</C> envia etapas e log; o portal mostra ao vivo. Cancelar no portal encerra a coleta no próximo envio.</li>
            <li><b>Fim:</b> log completo enviado (gzip), agregados gravados no banco do cliente, relatório disponível.</li>
          </ol>
          <H>Coleta dividida em lotes</H>
          <p>Com mais de 60 sites, arquivos e lixeira viram lotes de até 40 sites (sites muito grandes ficam sozinhos), registrados em <C>AssessmentTask</C>. Outros containers pegam lotes até o teto da coleta (<C>params.files_containers</C>, “Containers em paralelo”, padrão 4) e a coleta principal também trabalha enquanto espera.</p>
          <H>Retomada</H>
          <p>Trabalho sem sinal por 10 minutos volta para a fila (“Interrompida · aguardando retomada”). Cada site tem progresso próprio em <C>dbo.execution_progress</C>, então só o que faltou é refeito. Na retomada o coletor limpa linhas parciais dos sites incompletos e, ao final, deduplica (<C>Repair-ExecutionDuplicates</C>). Lotes falhos voltam para a fila até 3 tentativas.</p>
          <H>Tipos de execução</H>
          <T head={["Tipo", "Script", "O que faz"]} rows={[
            [<C key="1">COLETA</C>, "Invoke-SaasAssessment.ps1", "Levantamento M365 ou Google Workspace"],
            [<C key="2">DIAGNOSTICO</C>, "Invoke-SaasAssessment.ps1", "Só a checagem prévia (credencial, Graph, permissões, SharePoint Admin, banco); fora das listagens"],
            [<C key="3">HIGIENIZACAO</C>, "Invoke-SaasHygiene.ps1 + hygiene/", "Limpeza de versões antigas (altera o tenant; simulação por padrão)"],
            [<C key="4">EXCLUSAO</C>, "Invoke-SaasDelete.ps1", "Apaga em lotes todas as tabelas de uma coleta no banco do cliente"],
            [<C key="5">MANUTENCAO</C>, "Invoke-SaasRepair.ps1", "Corrige duplicatas de uma coleta (botão “Corrigir duplicatas”)"],
          ]} />
        </Sec>

        <Sec id="modulos" title="4. Módulos funcionais">
          <T head={["Módulo", "Onde", "Resumo"]} rows={[
            ["Clientes", "Clientes › cliente", "Cadastro, plataforma (M365 ou Google), conexão, banco (criar novo ou conectar existente), passo a passo de configuração, guia de acesso copiável para enviar ao cliente"],
            ["Conexão M365", "Aba Conexão", "App Registration do cliente: tenant, client id, prefixo do SharePoint e certificado (gerado no portal, RSA 2048, 2 anos, ou .pfx enviado) ou client secret. Diagnóstico completo"],
            ["Conexão Google", "Aba Conexão", "Conta de serviço do cliente com delegação em todo o domínio (11 escopos só leitura), administrador e domínio"],
            ["Coletas", "Execuções / Nova execução", "Escolha de workloads, sites específicos, containers em paralelo; acompanhamento ao vivo; continuar de onde parou"],
            ["Relatório M365", "Cliente › Relatório", "Resumo por área, KPIs, achados com recomendação, economia estimada, crescimento e prazo da cota, idade do conteúdo, duplicados (CSV), comparação entre coletas, relatório executivo, dashboard clássico"],
            ["Relatório Google", "Cliente › Relatório", "Licença M365 sugerida por usuário, ondas por unidade organizacional, pontos de atenção e exportação JSON para o Archie"],
            ["Higienização", "Menu Higienização / aba do cliente", "Limpeza de versões: simular (padrão) ou executar; tenant inteiro ou sites; por arquivo (lixeira) ou job do SharePoint (permanente). Nunca toca Preservation Hold Library nem a versão atual; tudo registrado em dbo.hygiene_version_items"],
            ["Excluir coleta", "Execução (só Administrador)", "Coleta fica EXCLUINDO, some do relatório e uma execução EXCLUSAO apaga os dados; falha devolve o status anterior"],
            ["Usuários e perfis", "Administração", "Cadastro, perfis, clientes liberados para Visualizador"],
            ["Auditoria", "Administração", "Últimas 300 alterações relevantes"],
          ]} />
        </Sec>

        <Sec id="seguranca" title="5. Segurança">
          <H>Autenticação</H>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>Microsoft (Entra ID):</b> App Registration <C>CT Assessment 365 - Portal</C> no tenant Cloud Target (locatário único), client id <C>c7cffa3d-1fc2-4571-a681-883846b0de04</C>, tenant <C>c9bfcf4f-1345-4951-bbb0-647a6bfcfe1f</C>. Convidados B2B entram pelo mesmo tenant. Segredo do app vence em <b>24/11/2027</b>.</li>
            <li><b>Local (e-mail e senha):</b> contingência. Senha com hash scrypt, bloqueio por tentativas, troca obrigatória no primeiro acesso.</li>
            <li><b>Entrada:</b> usuário cadastrado e ativo entra; domínio de <C>INTERNAL_EMAIL_DOMAINS</C> entra aguardando perfil; <C>ADMIN_EMAILS</C> entra como Administrador.</li>
            <li><b>Domínio canônico:</b> páginas abertas pelo host padrão do Container Apps redirecionam para <C>AUTH_URL</C>; as APIs do coletor seguem no host padrão.</li>
          </ul>
          <H>Autorização</H>
          <T head={["Permissão", "Administrador", "Executor", "Visualizador"]} rows={[
            ["Gerir usuários, perfis, auditoria e esta documentação", "✓", "", ""],
            ["Ver todos os clientes", "✓", "✓", "só os liberados"],
            ["Cadastrar/editar clientes, conexão e banco", "✓", "✓", ""],
            ["Iniciar, cancelar e repetir coletas; higienização", "✓", "✓", ""],
            ["Excluir coletas", "✓", "", ""],
            ["Ver execuções e relatórios", "✓", "✓", "só os liberados"],
          ]} />
          <p>Toda action de cliente checa <C>requireClientPerm</C>; toda página de cliente, <C>requireClientPage</C>. Alterações relevantes gravam auditoria.</p>
          <H>Segredos</H>
          <T head={["Segredo no Key Vault", "Conteúdo"]} rows={[
            [<C key="1">m365-&lt;cliente&gt;-cert / -certpwd</C>, "Certificado .pfx do App Registration do cliente e a senha dele"],
            [<C key="2">m365-&lt;cliente&gt;-secret</C>, "Client secret do cliente (quando não usa certificado)"],
            [<C key="3">m365-&lt;cliente&gt;-gsa</C>, "Chave JSON da conta de serviço Google (mínima)"],
            [<C key="4">m365-&lt;cliente&gt;-dbpwd / -dbapp</C>, "Senha do banco externo / do usuário contido app_<slug> do banco gerenciado"],
            [<C key="5">deploy-*</C>, "Valores de implantação lidos pelo infra/deploy.sh: senha do SQL, AUTH_SECRET, JOB_SIGNING_SECRET, WORKER_TOKEN, QUEUE_SQL_PASSWORD, Entra (client id, tenant id, segredo), domínio e certificado, e-mails"],
          ]} />
          <H>Bancos e rede</H>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Banco gerenciado novo ganha usuário contido <C>app_&lt;slug&gt;</C> (só db_datareader, db_datawriter e EXECUTE); o admin do servidor só cria bancos e aplica migrações. Bancos externos e legados continuam como estão.</li>
            <li>A regra de escala usa <C>queue_reader</C>, criado no início do portal por <C>scripts/ensure-queue-reader.mjs</C>.</li>
            <li>Tokens do coletor: HMAC por execução, aceitos só enquanto a execução está ativa.</li>
            <li>Cabeçalhos de segurança: CSP restritiva (<C>default-src 'self'</C>, <C>form-action</C> só para o login Microsoft), <C>frame-ancestors 'self'</C>.</li>
            <li>Auditoria do Azure SQL e do Key Vault enviada ao Log Analytics.</li>
          </ul>
        </Sec>

        <Sec id="dados" title="6. Dados">
          <H>Banco do portal (Prisma)</H>
          <T head={["Tabela", "Conteúdo"]} rows={[
            ["User / UserRole / UserClient", "Usuários, perfis e clientes liberados para Visualizador"],
            ["Client", "Cadastro, plataforma (M365/GOOGLE), conexão (sem segredos), modo e status do banco"],
            ["Assessment", "Cada execução: tipo, status, parâmetros, progresso, log resumido, workloads, checagem prévia, resultado"],
            ["AssessmentTask", "Lotes de uma coleta dividida (sites, status, tentativas, progresso)"],
            ["AssessmentLog", "Log completo (gzip) de cada execução"],
            ["StoredSecret", "Cofre local cifrado (só desenvolvimento; produção usa Key Vault)"],
            ["AuditLog", "Trilha de auditoria"],
          ]} />
          <H>Banco de cada cliente (portal/sql/tenant)</H>
          <T head={["Migração", "O que cria"]} rows={[
            [<C key="1">001_schema.sql</C>, "Schema do coletor (DROP + CREATE: só em banco vazio; banco com o schema é adotado). Tabelas sites_info, files_info, trash_items, licenças, adoção, caixas, Intune, execution_history, execution_progress, agregados e procedures sp_dash_*"],
            [<C key="2">002_higienizacao.sql</C>, "dbo.hygiene_version_items e apoio à higienização"],
            [<C key="3">003_google_workspace.sql</C>, "Tabelas g_domains, g_orgunits, g_users, g_groups, g_licenses, g_resources, g_devices"],
          ]} />
          <p>Toda coleta usa o mesmo <C>execution_id</C> do portal. Mudanças novas entram como migração incremental <C>NNN_nome.sql</C> idempotente, aplicada pelo portal antes de cada coleta.</p>
        </Sec>

        <Sec id="apis" title="7. APIs">
          <T head={["Rota", "Quem chama", "Autenticação"]} rows={[
            [<C key="1">POST /api/jobs/claim</C>, "Coletor: pega o próximo trabalho", "WORKER_TOKEN"],
            [<C key="2">GET/POST /api/jobs/[id]</C>, "Coletor: configuração, progresso e resultado", "Token HMAC da execução"],
            [<C key="3">/api/jobs/[id]/log</C>, "Coletor: log completo", "Token HMAC"],
            [<C key="4">/api/jobs/[id]/tasks, /tasks/claim, /tasks/[taskId]</C>, "Coletor: lotes da coleta dividida", "Token HMAC"],
            [<C key="5">/api/execucoes/[id], /log</C>, "Portal: execução ao vivo e download do log", "Sessão + permissão no cliente"],
            [<C key="6">/api/relatorio/[clientId]/…</C>, "Portal: dashboard, execuções, duplicados (CSV), migração (JSON Google)", "Sessão + reports:view no cliente"],
            [<C key="7">/api/clientes/[id]/certificado</C>, "Portal: download do .cer público", "Sessão + clients:manage"],
            [<C key="8">/api/health</C>, "Sonda do Container Apps", "Pública (sem dados)"],
            [<C key="9">/api/auth/*</C>, "Auth.js (login, callback, sessão)", "—"],
          ]} />
        </Sec>

        <Sec id="config" title="8. Configuração (variáveis do portal)">
          <T head={["Variável", "Para quê"]} rows={[
            [<C key="1">DATABASE_URL</C>, "Banco do portal"],
            [<C key="2">AUTH_SECRET, AUTH_URL</C>, "Sessões (trocar derruba sessões) e endereço público (domínio próprio)"],
            [<C key="3">AUTH_MICROSOFT_ENTRA_ID_ID / _SECRET / _ISSUER</C>, "Login Microsoft (issuer do tenant Cloud Target)"],
            [<C key="4">AUTH_LOCAL_LOGIN, BOOTSTRAP_ADMIN_*</C>, "Login local e primeiro administrador"],
            [<C key="5">INTERNAL_EMAIL_DOMAINS, ADMIN_EMAILS</C>, "Regras de entrada"],
            [<C key="6">SECRET_STORE, KEY_VAULT_URI</C>, "Onde ficam os segredos (keyvault em produção)"],
            [<C key="7">TENANT_SQL_*</C>, "Servidor e elastic pool dos bancos de clientes"],
            [<C key="8">JOB_RUNNER, JOB_SIGNING_SECRET, WORKER_TOKEN, QUEUE_SQL_PASSWORD</C>, "Fila (queue em produção), assinatura dos tokens, autenticação do coletor, usuário de leitura da fila"],
            [<C key="9">PORTAL_CALLBACK_URL, JOB_IMAGE</C>, "Endereço que o coletor usa (host padrão) e imagem do coletor"],
          ]} />
        </Sec>

        <Sec id="operacao" title="9. Operação e implantação">
          <H>Implantação completa (infra + imagens)</H>
          <p><C>RG=rg-365gov-prod infra/deploy.sh</C> — lê os segredos <C>deploy-*</C> do Key Vault, aplica o Bicep (inclusive domínio próprio e certificado), gera as imagens no ACR e atualiza portal e coletor. Idempotente.</p>
          <H>Atualização rápida (só código)</H>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li><C>az acr build -r ctassessacrfkavhoh235cpq -t ctassessment-portal:&lt;commit&gt; portal</C> (e <C>ctassessment-job:&lt;commit&gt; job</C> para o coletor).</li>
            <li><C>az containerapp update -g rg-365gov-prod -n ctassess-portal --image …/ctassessment-portal:&lt;commit&gt;</C></li>
            <li><C>az containerapp job update -g rg-365gov-prod -n ctassess-coletor --image …/ctassessment-job:&lt;commit&gt;</C></li>
          </ol>
          <p>Publicar não interrompe coletas em andamento: cada execução termina com a imagem com que começou. O portal aplica migrações Prisma ao iniciar.</p>
          <H>Rotinas</H>
          <T head={["O quê", "Quando", "Como"]} rows={[
            ["Segredo do app de login (Entra)", "Antes de 24/11/2027", "Novo segredo no App Registration → deploy-entra-client-secret no Key Vault → secret entra-secret do portal"],
            ["Certificados dos clientes", "2 anos após a geração", "Gerar novo na aba Conexão e enviar o .cer ao cliente"],
            ["Certificado do domínio", "Automático", "Certificado gerenciado do Container Apps (renovação automática)"],
            ["Crescimento dos bancos", "Mensal", "Excluir coletas antigas (Administrador) e acompanhar o elastic pool"],
            ["Escala do coletor", "Conforme a demanda", "maxCollectors (Bicep) e “Containers em paralelo” por coleta"],
          ]} />
        </Sec>

        <Sec id="qualidade" title="10. Testes e validação">
          <T head={["Comando", "O que valida"]} rows={[
            [<C key="1">cd portal && npx tsc --noEmit && npx next build</C>, "Tipos e build do portal"],
            [<C key="2">bicep build infra/main.bicep</C>, "Infraestrutura"],
            [<C key="3">pwsh -File job/tests/Test-Pipeline.ps1</C>, "Pipeline do coletor sob StrictMode, lotes"],
            [<C key="4">Test-VersionCleanup.ps1</C>, "Higienização (SharePoint e banco simulados)"],
            [<C key="5">Test-Resume.ps1</C>, "Retomada, limpeza de linhas parciais, deduplicação, índices"],
            [<C key="6">Test-Delete.ps1</C>, "Exclusão de coleta em lotes"],
            [<C key="7">Test-Google.ps1</C>, "Coletor Google (token, paginação, módulos)"],
          ]} />
          <p>Os mesmos passos rodam na CI do GitHub (<C>.github/workflows/ci.yml</C>).</p>
        </Sec>

        <Sec id="problemas" title="11. Solução de problemas">
          <T head={["Sintoma", "Causa provável", "Ação"]} rows={[
            ["Login Microsoft: AADSTS50105", "Usuário fora do grupo atribuído ao app", "Incluir no grupo do aplicativo empresarial"],
            ["Login Microsoft: AADSTS50020", "Pessoa externa não convidada", "Convidar como B2B no tenant Cloud Target"],
            ["“Não foi possível entrar” após voltar da Microsoft", "Endereço de retorno diferente do AUTH_URL", "Conferir AUTH_URL e as Redirect URIs do app"],
            ["“Seu e-mail ainda não tem acesso”", "Usuário não cadastrado", "Cadastrar em Usuários e perfis"],
            ["Coleta “Interrompida · aguardando retomada”", "Container caiu ou ficou sem sinal por 10 min", "Nada: volta para a fila e retoma; se repetir, ver o log"],
            ["Coleta na fila sem iniciar", "Regra KEDA sem leitura da fila ou teto atingido", "Ver execuções do job ctassess-coletor e o usuário queue_reader"],
            ["Relatório com números dobrados", "Duplicatas de uma retomada antiga", "Botão “Corrigir duplicatas” na execução"],
            ["Diagnóstico: SharePoint recusa client secret", "Tenants novos exigem certificado para PnP", "Gerar certificado no portal"],
          ]} />
        </Sec>

        <Sec id="pendencias" title="12. Pendências conhecidas">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Billing/créditos e agendamento recorrente de coletas.</li>
            <li>Avisos por e-mail (opções: Microsoft Graph a partir de uma caixa da Cloud Target ou Azure Communication Services).</li>
            <li>Teste ponta a ponta com tenant Google Workspace real.</li>
            <li>Portal com mais de uma réplica: pools de conexão por banco de cliente são em memória.</li>
            <li>Logo com cores anteriores ao Brandbook 2026 (aguarda SVG oficial do Marketing).</li>
          </ul>
        </Sec>
      </div>
      <p className="mt-8 text-center text-xs text-slate-400">Cloud Target · CT Assessment 365 · documentação técnica · {UPDATED}</p>
    </div>
  );
}
