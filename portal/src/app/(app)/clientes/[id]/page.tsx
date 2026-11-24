import Link from "next/link";
import { Suspense } from "react";
import { getSecret, secretName } from "@/lib/secrets";
import { publicFromPfx } from "@/lib/certificate";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPage } from "@/lib/session";
import { can } from "@/lib/rbac";
import { readiness } from "@/lib/assessments";
import { ACTIVE, DB_STATUS_LABEL } from "@/lib/status";
import { PERMISSIONS_HELP } from "@/lib/collector";
import { GOOGLE_SCOPES } from "@/lib/setupGuides";
import { SECRET_STORE } from "@/lib/secrets";
import { dateTime } from "@/lib/format";
import { importDbExecutions, provisionDb, removeCredential, runDiagnostic, saveConnection, saveDatabase, testConnection, updateClient } from "@/actions/clients";
import { PreflightCard } from "@/components/LiveAssessment";
import { HygieneTab } from "./HygieneTab";
import { HAS_DATA, parseJson, type Preflight } from "@/lib/status";
import { DbFields } from "@/components/DbFields";
import { tenantSqlConfigured } from "@/lib/tenantDb";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { Badge, Field, PageHeader, Tabs } from "@/components/ui";
import { ConnectionFields } from "@/components/ConnectionFields";
import { AssessmentTable, StatusBadge } from "@/components/assessments";

export default async function Cliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; keep?: string; from?: string; site?: string | string[] }> }) {
  const { id } = await params;
  const u = await requireClientPage(id);
  const c = await prisma.client.findUnique({
    where: { id },
    include: {
      viewers: { include: { user: { select: { id: true, name: true, email: true, active: true } } } },
      assessments: { where: { kind: "COLETA" }, orderBy: { createdAt: "desc" }, take: 50, include: { startedBy: { select: { name: true, email: true } } } },
    },
  });
  if (!c) notFound();
  const { tab: t, keep: keepQ, from, site } = await searchParams;
  const presetSites = (Array.isArray(site) ? site : site ? [site] : []).slice(0, 200);
  const keep = Math.min(50000, Math.max(1, Number(keepQ) || 100));
  const canManage = can(u.roles, "clients:manage");
  const canConn = canManage;
  const cert = t === "conexao" && canConn && c.authMode === "cert" && c.credentialSetAt ? await certificateInfo(c.id) : null;
  const canRun = can(u.roles, "assessments:run");
  const google = c.platform === "GOOGLE";
  const tabs = [
    { key: "visao", label: "Visão geral" },
    ...(canConn ? [{ key: "conexao", label: google ? "Conexão Google Workspace" : "Conexão Microsoft 365" }] : []),
    { key: "execucoes", label: "Execuções", count: c.assessments.length },
    ...(canRun && !google ? [{ key: "higienizacao", label: "Higienização" }] : []),
    ...(canManage ? [{ key: "cadastro", label: "Cadastro e banco" }] : []),
  ];
  const tab = tabs.some((x) => x.key === t) ? t! : "visao";
  const missing = readiness(c);
  const lastDiag = await prisma.assessment.findFirst({ where: { clientId: c.id, kind: "DIAGNOSTICO" }, orderBy: { createdAt: "desc" } });
  const isActive = (s: string) => (ACTIVE as readonly string[]).includes(s);
  const activeOther = await prisma.assessment.findFirst({ where: { clientId: c.id, kind: { not: "COLETA" }, status: { in: [...ACTIVE] } } });
  const active = c.assessments.find((a) => isActive(a.status)) ?? activeOther ?? undefined;
  const lastOk = c.assessments.find((a) => (HAS_DATA as readonly string[]).includes(a.status));
  const connDone = !missing.length;

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={<>{google ? (c.googleDomain ? `Google Workspace · ${c.googleDomain} · levantamento para migração` : "Google Workspace não configurado") : c.spoTenant ? `${c.spoTenant}.sharepoint.com` : "Microsoft 365 não configurado"}{!c.active && <span className="ml-2"><Badge>inativo</Badge></span>}</>}
        actions={<>
          {c.dbStatus === "PROVISIONADO" && <Link href={`/clientes/${c.id}/relatorio`} className="btn-secondary">Relatório</Link>}
          {canRun && !active && !missing.length && <Link href={`/clientes/${c.id}/executar`} className="btn">Nova execução</Link>}
          {canManage && missing.length > 0 && <Link href={`/clientes/${c.id}?tab=conexao`} className="btn">Configurar conexão</Link>}
          {active && <Link href={`/execucoes/${active.id}`} className="btn">Acompanhar execução</Link>}
        </>}
      />
      <Tabs base={`/clientes/${c.id}`} current={tab} items={tabs} />

      {tab === "visao" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card">
            <h2 className="card-title">Primeiros passos</h2>
            <Steps steps={[
              { done: connDone, title: "Enviar o guia de acesso ao cliente", detail: `Ele cria ${google ? "a conta de serviço no Google Workspace" : "o App Registration no Microsoft 365"} e nos devolve os dados.`,
                action: canConn ? { href: `/clientes/${c.id}?tab=conexao`, label: "Abrir o guia" } : undefined },
              { done: connDone, title: "Configurar a conexão", detail: connDone ? (c.credentialHint ?? "Conexão e credencial salvas.") : `Falta: ${missing.join(", ")}.`,
                action: canConn ? { href: `/clientes/${c.id}?tab=conexao`, label: "Configurar conexão" } : undefined },
              { done: !!c.connectionOkAt, optional: true, title: "Testar a conexão", detail: c.connectionOkAt ? `Testada em ${dateTime(c.connectionOkAt)}.` : "Diagnóstico de cerca de 1 minuto: credencial, permissões e banco.",
                action: canConn ? { href: `/clientes/${c.id}?tab=conexao`, label: "Testar conexão" } : undefined },
              { done: !!lastOk, title: "Rodar a primeira coleta", detail: lastOk ? `Última concluída em ${dateTime(lastOk.finishedAt)}.` : c.dbStatus === "PROVISIONADO" ? "O banco do cliente já está pronto." : "O banco do cliente é criado na primeira coleta.",
                action: canRun && !missing.length && !active ? { href: `/clientes/${c.id}/executar`, label: "Nova coleta", primary: true } : undefined },
            ]} />
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">Banco {c.dbName ?? ""}: {DB_STATUS_LABEL[c.dbStatus] ?? c.dbStatus}</p>
          </section>
          <section className="card lg:col-span-2">
            <h2 className="card-title">Execuções</h2>
            {active && (
              <p className="mb-3 flex items-center gap-2 text-sm"><StatusBadge status={active.status} run={active} /> desde {dateTime(active.startedAt ?? active.createdAt)} — <Link className="link" href={`/execucoes/${active.id}`}>acompanhar</Link></p>
            )}
            {lastOk ? (
              <p className="mb-3 text-sm">Última coleta concluída em <b>{dateTime(lastOk.finishedAt)}</b>{lastOk.totalSites != null && <> · {lastOk.totalSites} sites</>}. <Link className="link" href={`/clientes/${c.id}/relatorio?execucao=${lastOk.id}`}>Ver relatório</Link></p>
            ) : <p className="muted mb-3">Nenhuma coleta concluída ainda.</p>}
            <AssessmentTable rows={c.assessments.slice(0, 5)} showClient={false} />
          </section>
        </div>
      )}

      {tab === "conexao" && canConn && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card lg:col-span-2">
            <h2 className="card-title">App Registration do cliente</h2>
            <ActionForm action={saveConnection.bind(null, c.id)} className="grid gap-4 sm:grid-cols-2" submit="Salvar conexão">
              <ConnectionFields c={c} editing />
              <p className="text-xs text-slate-500 sm:col-span-2">
                Credencial atual: <b>{c.credentialHint ?? "nenhuma"}</b>{c.credentialSetAt && <> · gravada em {dateTime(c.credentialSetAt)}</>} · cofre: {SECRET_STORE === "keyvault" ? "Azure Key Vault" : "local cifrado"}. O valor nunca é exibido de volta.
              </p>
            </ActionForm>
            {cert && (
              <div className={`mt-4 rounded-lg border p-4 text-sm ${c.connectionOkAt ? "border-slate-200" : "border-sky-200 bg-sky-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Certificado no cofre</p>
                    {"error" in cert ? <p className="text-red-700">{cert.error}</p> : (
                      <p className="text-slate-600">{cert.subject} · vence em {cert.expiresAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        <span className="block font-mono text-xs">Impressão digital: {cert.thumbprint}</span></p>
                    )}
                  </div>
                  <a className="btn-secondary" href={`/api/clientes/${c.id}/certificado`}>Baixar certificado público (.cer)</a>
                </div>
                {!c.connectionOkAt && <p className="mt-2 text-sky-900">Envie o .cer no Entra ID do cliente: <i>App Registration → Certificados e segredos → Certificados → Carregar certificado</i>. Depois rode o <b>Diagnóstico completo</b>. A impressão digital mostrada no Entra deve ser igual à de cima.</p>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              {!missing.length && <ActionButton action={runDiagnostic.bind(null, c.id)} className="btn">Diagnóstico completo</ActionButton>}
              {c.authMode === "secret" && <ActionButton action={testConnection.bind(null, c.id)} className="btn-secondary">Teste rápido do secret</ActionButton>}
              {c.credentialSetAt && <ActionButton action={removeCredential.bind(null, c.id)} className="btn-secondary" confirm="Remover a credencial do cofre? As próximas execuções vão falhar até uma nova ser enviada.">Remover credencial</ActionButton>}
              {c.connectionOkAt && <Badge tone="green">testada em {dateTime(c.connectionOkAt)}</Badge>}
            </div>
            {c.connectionError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{c.connectionError}</p>}
            <p className="mt-3 text-xs text-slate-500">{google ? "O diagnóstico roda no coletor (cerca de 1 minuto): testa a chave da conta de serviço, a delegação de cada escopo e o banco do cliente." : "O diagnóstico roda no worker (leva cerca de 1 minuto): testa a credencial, o Graph, as permissões concedidas ao app, o SharePoint Admin e o banco do cliente."}</p>
          </section>
          <div className="space-y-6">
          {lastDiag && (
            <section className="card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="card-title !mb-0">Último diagnóstico</h2>
                <Link className="link text-xs" href={`/execucoes/${lastDiag.id}`}>{dateTime(lastDiag.createdAt)} →</Link>
              </div>
              <StatusBadge status={lastDiag.status} />
              {lastDiag.preflight ? <div className="-mx-5 -mb-5 mt-2 [&>section]:border-0 [&>section]:shadow-none"><PreflightCard p={parseJson<Preflight | null>(lastDiag.preflight, null)} /></div> : null}
            </section>
          )}
          <section className="card">
            {google ? (<>
              <h2 className="card-title">Escopos da delegação (só leitura)</h2>
              <p className="muted mb-2">Admin Console → Segurança → Controles de API → Delegação em todo o domínio, para o ID da conta de serviço:</p>
              <ul className="list-disc space-y-1 break-all pl-5 font-mono text-[11px] text-slate-700">{GOOGLE_SCOPES.map((p) => <li key={p}>{p.replace("https://www.googleapis.com/auth/", "")}</li>)}</ul>
            </>) : (<>
            <h2 className="card-title">Permissões do App Registration</h2>
            <p className="muted mb-2">No Entra ID do cliente, conceda (tipo Application, com consentimento do administrador):</p>
            <ul className="list-disc space-y-1.5 break-words pl-5 text-sm text-slate-700 [overflow-wrap:anywhere]">{PERMISSIONS_HELP.map((p) => <li key={p}>{p}</li>)}</ul>
            </>)}
          </section>
          </div>
        </div>
      )}

      {tab === "execucoes" && (
        <section className="card">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {canRun && (active ? <Link href={`/execucoes/${active.id}`} className="btn">Acompanhar execução em andamento</Link>
              : missing.length ? <span className="text-sm text-amber-800">Para executar, configure: {missing.join(", ")}.</span>
              : <Link href={`/clientes/${c.id}/executar`} className="btn">Nova execução</Link>)}
            {canManage && c.dbStatus === "PROVISIONADO" && (
              <ActionButton action={importDbExecutions.bind(null, c.id)} className="btn-secondary">Importar execuções do banco</ActionButton>
            )}
          </div>
          {canManage && c.dbStatus === "PROVISIONADO" && <p className="-mt-2 mb-4 text-xs text-slate-500">&ldquo;Importar&rdquo; traz as coletas que já estão no banco do cliente (ex.: feitas com o ct-assessmentspo on-premises).</p>}
          <AssessmentTable rows={c.assessments} showClient={false} />
        </section>
      )}

      {tab === "higienizacao" && canRun && !google && (
        <Suspense key={`${keep}-${from ?? ""}-${presetSites.length}`} fallback={<div className="card flex items-center gap-3 text-sm text-slate-600"><span className="h-4 w-4 animate-spin rounded-full border-2 border-ct-purple border-t-transparent" />Calculando os arquivos com excesso de versões na última coleta…</div>}>
          <HygieneTab client={c} keep={keep} from={from} sites={presetSites} />
        </Suspense>
      )}

      {tab === "cadastro" && canManage && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card">
            <h2 className="card-title">Cadastro</h2>
            <ActionForm action={updateClient.bind(null, c.id)} className="space-y-3" submit="Salvar">
              <Field label="Nome"><input name="name" required defaultValue={c.name} className="input" /></Field>
              <Field label="CNPJ"><input name="document" defaultValue={c.document ?? ""} className="input" /></Field>
              <Field label="Observações"><textarea name="notes" rows={3} defaultValue={c.notes ?? ""} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c.active} /> Cliente ativo (inativo bloqueia login dos usuários e novas execuções)</label>
            </ActionForm>
          </section>
          <section className="card">
            <h2 className="card-title">Banco de dados isolado</h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">Tipo</dt><dd>{c.dbMode === "EXTERNAL" ? "Banco existente" : "Gerenciado pelo portal"}</dd>
              {c.dbMode === "EXTERNAL" && <><dt className="text-slate-500">Servidor</dt><dd className="break-all font-mono text-xs">{c.dbServer}</dd></>}
              <dt className="text-slate-500">Banco</dt><dd className="font-mono">{c.dbName ?? "—"}</dd>
              <dt className="text-slate-500">Situação</dt><dd><Badge tone={c.dbStatus === "PROVISIONADO" ? "green" : c.dbStatus === "ERRO" ? "red" : "gray"}>{DB_STATUS_LABEL[c.dbStatus] ?? c.dbStatus}</Badge></dd>
              <dt className="text-slate-500">Versão do schema</dt><dd>v{c.dbSchemaVersion}</dd>
            </dl>
            {c.dbError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{c.dbError}</p>}
            <div className="mt-4"><ActionButton action={provisionDb.bind(null, c.id)} className="btn-secondary">{c.dbStatus === "PROVISIONADO" ? "Aplicar atualizações do schema" : "Provisionar banco"}</ActionButton></div>
            <p className="mt-3 text-xs text-slate-500">{c.dbMode === "EXTERNAL" ? "Conecta no banco existente e aplica as atualizações pendentes do schema do coletor (banco vazio recebe o schema padrão)." : "Cria o banco no servidor de clientes (no elastic pool, se configurado) e sobe o schema padrão do coletor ct-assessmentspo. Um banco que já tenha o schema é adotado sem apagar dados."}</p>
            <details className="mt-4 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-ct-purple">Trocar o banco do cliente</summary>
              <ActionForm action={saveDatabase.bind(null, c.id)} className="mt-3" submit="Salvar banco">
                <DbFields c={c} sqlOk={tenantSqlConfigured()} prefix={process.env.TENANT_DB_PREFIX ?? "ctassess_"} editing />
              </ActionForm>
            </details>
          </section>
          <section className="card lg:col-span-2">
            <h2 className="card-title">Visualizadores com acesso a este cliente</h2>
            {c.viewers.length === 0 ? <p className="muted">Nenhum visualizador liberado. Administradores e executores veem todos os clientes.</p> : (
              <ul className="flex flex-wrap gap-2">{c.viewers.map((v) => <li key={v.user.id}><Badge tone={v.user.active ? "blue" : "gray"}>{v.user.name ?? v.user.email}</Badge></li>)}</ul>
            )}
            {can(u.roles, "users:manage") && <p className="mt-3 text-xs text-slate-500">A liberação é feita em <Link className="link" href="/admin/usuarios">Usuários e perfis</Link>.</p>}
          </section>
        </div>
      )}
    </>
  );
}

type Step = { done: boolean; title: string; detail: string; optional?: boolean; action?: { href: string; label: string; primary?: boolean } };
/** Etapas numeradas: a primeira pendente fica em destaque e mostra o botão da ação. */
function Steps({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((s) => !s.done && !s.optional) === -1 ? -1 : steps.findIndex((s) => !s.done);
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => {
        const on = i === current;
        return (
          <li key={i} className="flex gap-3">
            <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-lime-100 text-lime-800" : on ? "bg-ct-purple text-white" : "bg-slate-100 text-slate-500"}`} aria-hidden="true">{s.done ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${s.done ? "text-slate-500" : ""}`}>{s.title}{s.optional && !s.done && <span className="ml-1 text-xs font-normal text-slate-500">(recomendado)</span>}<span className="sr-only">{s.done ? " — concluído" : on ? " — próximo passo" : ""}</span></p>
              <p className="text-xs text-slate-500">{s.detail}</p>
              {on && s.action && <Link href={s.action.href} className={`${s.action.primary || !s.optional ? "btn" : "btn-secondary"} mt-2 !py-1.5 text-xs`}>{s.action.label}</Link>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}


async function certificateInfo(clientId: string) {
  try {
    const pfx = await getSecret(secretName(clientId, "cert"));
    if (!pfx) return null;
    return publicFromPfx(pfx, (await getSecret(secretName(clientId, "certpwd"))) ?? "");
  } catch (e) {
    return { error: `Não foi possível ler o certificado: ${e instanceof Error ? e.message : String(e)}` };
  }
}
