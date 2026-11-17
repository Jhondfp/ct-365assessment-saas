import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPage } from "@/lib/session";
import { can } from "@/lib/rbac";
import { readiness } from "@/lib/assessments";
import { ACTIVE, DB_STATUS_LABEL } from "@/lib/status";
import { PERMISSIONS_HELP } from "@/lib/collector";
import { SECRET_STORE } from "@/lib/secrets";
import { dateTime } from "@/lib/format";
import { provisionDb, removeCredential, saveConnection, testConnection, updateClient } from "@/actions/clients";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { Badge, Field, PageHeader, Tabs } from "@/components/ui";
import { ConnectionFields } from "@/components/ConnectionFields";
import { AssessmentTable, StatusBadge } from "@/components/assessments";

export default async function Cliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const u = await requireClientPage(id);
  const c = await prisma.client.findUnique({
    where: { id },
    include: {
      viewers: { include: { user: { select: { id: true, name: true, email: true, active: true } } } },
      assessments: { orderBy: { createdAt: "desc" }, take: 50, include: { startedBy: { select: { name: true, email: true } } } },
    },
  });
  if (!c) notFound();
  const { tab: t } = await searchParams;
  const canManage = can(u.roles, "clients:manage");
  const canConn = canManage;
  const canRun = can(u.roles, "assessments:run");
  const tabs = [
    { key: "visao", label: "Visão geral" },
    ...(canConn ? [{ key: "conexao", label: "Conexão Microsoft 365" }] : []),
    { key: "execucoes", label: "Execuções", count: c.assessments.length },
    ...(canManage ? [{ key: "cadastro", label: "Cadastro e banco" }] : []),
  ];
  const tab = tabs.some((x) => x.key === t) ? t! : "visao";
  const missing = readiness(c);
  const active = c.assessments.find((a) => (ACTIVE as readonly string[]).includes(a.status));
  const lastOk = c.assessments.find((a) => a.status === "COMPLETED");

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={<>{c.spoTenant ? `${c.spoTenant}.sharepoint.com` : "Microsoft 365 não configurado"}{!c.active && <span className="ml-2"><Badge>inativo</Badge></span>}</>}
        actions={<>
          {c.dbStatus === "PROVISIONADO" && <Link href={`/clientes/${c.id}/dashboard`} className="btn-secondary">Dashboard</Link>}
          {canRun && !active && !missing.length && <Link href={`/clientes/${c.id}/executar`} className="btn">Nova execução</Link>}
          {active && <Link href={`/execucoes/${active.id}`} className="btn">Acompanhar execução</Link>}
        </>}
      />
      <Tabs base={`/clientes/${c.id}`} current={tab} items={tabs} />

      {tab === "visao" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="card">
            <h2 className="card-title">Prontidão</h2>
            <ul className="space-y-2 text-sm">
              <Check ok={!!(c.m365TenantId && c.appClientId && c.spoTenant)} label="Conexão com o Microsoft 365" />
              <Check ok={!!c.credentialSetAt} label={`Credencial ${c.credentialHint ? `(${c.credentialHint})` : ""}`} />
              <Check ok={!!c.connectionOkAt} label={c.connectionOkAt ? `Conexão testada em ${dateTime(c.connectionOkAt)}` : "Conexão testada"} optional />
              <Check ok={c.dbStatus === "PROVISIONADO"} label={`Banco ${c.dbName ?? ""} (${DB_STATUS_LABEL[c.dbStatus] ?? c.dbStatus})`} optional={!canManage} />
            </ul>
            {missing.length > 0 && <p className="mt-3 text-sm text-amber-800">Falta configurar: {missing.join(", ")}.</p>}
            {c.dbStatus !== "PROVISIONADO" && !missing.length && <p className="mt-3 text-xs text-slate-500">O banco é provisionado automaticamente na primeira execução.</p>}
          </section>
          <section className="card lg:col-span-2">
            <h2 className="card-title">Execuções</h2>
            {active && (
              <p className="mb-3 flex items-center gap-2 text-sm"><StatusBadge status={active.status} /> desde {dateTime(active.startedAt ?? active.createdAt)} — <Link className="link" href={`/execucoes/${active.id}`}>acompanhar</Link></p>
            )}
            {lastOk ? (
              <p className="mb-3 text-sm">Última coleta concluída em <b>{dateTime(lastOk.finishedAt)}</b>{lastOk.totalSites != null && <> · {lastOk.totalSites} sites</>}. <Link className="link" href={`/clientes/${c.id}/dashboard?execution=${lastOk.id}`}>Abrir dashboard</Link></p>
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
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <ActionButton action={testConnection.bind(null, c.id)} className="btn-secondary">Testar conexão</ActionButton>
              {c.credentialSetAt && <ActionButton action={removeCredential.bind(null, c.id)} className="btn-secondary" confirm="Remover a credencial do cofre? As próximas execuções vão falhar até uma nova ser enviada.">Remover credencial</ActionButton>}
              {c.connectionOkAt && <Badge tone="green">testada em {dateTime(c.connectionOkAt)}</Badge>}
            </div>
            {c.connectionError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{c.connectionError}</p>}
          </section>
          <section className="card">
            <h2 className="card-title">Permissões do App Registration</h2>
            <p className="muted mb-2">No Entra ID do cliente, conceda (tipo Application, com consentimento do administrador):</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">{PERMISSIONS_HELP.map((p) => <li key={p}>{p}</li>)}</ul>
          </section>
        </div>
      )}

      {tab === "execucoes" && (
        <section className="card">
          <AssessmentTable rows={c.assessments} showClient={false} />
        </section>
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
              <dt className="text-slate-500">Banco</dt><dd className="font-mono">{c.dbName ?? "—"}</dd>
              <dt className="text-slate-500">Situação</dt><dd><Badge tone={c.dbStatus === "PROVISIONADO" ? "green" : c.dbStatus === "ERRO" ? "red" : "gray"}>{DB_STATUS_LABEL[c.dbStatus] ?? c.dbStatus}</Badge></dd>
              <dt className="text-slate-500">Versão do schema</dt><dd>v{c.dbSchemaVersion}</dd>
            </dl>
            {c.dbError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{c.dbError}</p>}
            <div className="mt-4"><ActionButton action={provisionDb.bind(null, c.id)} className="btn-secondary">{c.dbStatus === "PROVISIONADO" ? "Aplicar atualizações do schema" : "Provisionar banco"}</ActionButton></div>
            <p className="mt-3 text-xs text-slate-500">Cria o banco no servidor de clientes (no elastic pool, se configurado) e sobe o schema padrão do coletor ct-assessmentspo. Um banco que já tenha o schema é adotado sem apagar dados.</p>
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

function Check({ ok, label, optional }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-lime-100 text-lime-800" : optional ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-800"}`}>{ok ? "✓" : optional ? "–" : "!"}</span>
      <span>{label}</span>
    </li>
  );
}
