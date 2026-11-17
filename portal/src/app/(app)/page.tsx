import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { assessmentWhere, clientWhere, requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ACTIVE } from "@/lib/status";
import { readiness } from "@/lib/assessments";
import { RUNNER, RUNNER_LABEL } from "@/lib/jobs";
import { SECRET_STORE } from "@/lib/secrets";
import { Kpi, PageHeader, Badge } from "@/components/ui";
import { AssessmentTable } from "@/components/assessments";

export default async function Painel() {
  const u = await requireUser();

  const since = new Date(Date.now() - 30 * 86400_000);
  const [clients, ativos, ok30, fail30, recent] = await Promise.all([
    prisma.client.findMany({ where: { active: true, ...clientWhere(u) }, orderBy: { name: "asc" } }),
    prisma.assessment.count({ where: { status: { in: [...ACTIVE] }, ...assessmentWhere(u) } }),
    prisma.assessment.count({ where: { status: "COMPLETED", finishedAt: { gte: since }, ...assessmentWhere(u) } }),
    prisma.assessment.count({ where: { status: "FAILED", finishedAt: { gte: since }, ...assessmentWhere(u) } }),
    prisma.assessment.findMany({ where: assessmentWhere(u), take: 12, orderBy: { createdAt: "desc" }, include: { client: { select: { id: true, name: true } }, startedBy: { select: { name: true, email: true } } } }),
  ]);
  const manage = can(u.roles, "clients:manage");
  const pendentes = !manage ? [] : clients.map((c) => ({ c, missing: [...readiness(c), ...(c.dbStatus !== "PROVISIONADO" ? ["banco"] : [])] })).filter((x) => x.missing.length);

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle={can(u.roles, "clients:manage") && <>Coletas rodam em <b>{RUNNER_LABEL[RUNNER]}</b> · credenciais em <b>{SECRET_STORE === "keyvault" ? "Azure Key Vault" : "cofre local cifrado"}</b></>}
        actions={can(u.roles, "clients:manage") && <Link href="/clientes/novo" className="btn">Novo cliente</Link>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Clientes ativos" value={clients.length} />
        <Kpi label="Execuções em andamento" value={ativos} tone={ativos ? "warn" : undefined} />
        <Kpi label="Concluídas (30 dias)" value={ok30} tone="ok" />
        <Kpi label="Falhas (30 dias)" value={fail30} tone={fail30 ? "risk" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="card-title">Execuções recentes</h2>
          <AssessmentTable rows={recent} />
        </section>
        {manage ? <section className="card">
          <h2 className="card-title">Configuração pendente</h2>
          {pendentes.length === 0 ? (
            <p className="muted">Todos os clientes ativos estão prontos para executar.</p>
          ) : (
            <ul className="space-y-3">
              {pendentes.map(({ c, missing }) => (
                <li key={c.id}>
                  <Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link>
                  <div className="mt-1 flex flex-wrap gap-1">{missing.map((m) => <Badge key={m} tone="orange">{m}</Badge>)}</div>
                </li>
              ))}
            </ul>
          )}
        </section> : (
          <section className="card">
            <h2 className="card-title">Meus clientes</h2>
            {clients.length === 0 ? <p className="muted">Nenhum cliente liberado para você. Fale com um administrador.</p> : (
              <ul className="space-y-2">{clients.map((c) => <li key={c.id}><Link className="link" href={`/clientes/${c.id}/dashboard`}>{c.name}</Link></li>)}</ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}
