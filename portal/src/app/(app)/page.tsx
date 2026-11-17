import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { assessmentWhere, clientWhere, requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ACTIVE, HAS_DATA, STATUS_LABEL } from "@/lib/status";
import { readiness } from "@/lib/assessments";
import { RUNNER, RUNNER_LABEL } from "@/lib/jobs";
import { SECRET_STORE } from "@/lib/secrets";
import { dateTime, duration } from "@/lib/format";
import { Badge, Empty, Kpi, PageHeader } from "@/components/ui";
import { AssessmentTable, StatusBadge } from "@/components/assessments";

const STALE_DAYS = 90;

export default async function Painel() {
  const u = await requireUser();
  const manage = can(u.roles, "clients:manage");
  const since = new Date(Date.now() - 30 * 86400_000);
  const staleSince = new Date(Date.now() - STALE_DAYS * 86400_000);

  const [clients, running, recent, problems] = await Promise.all([
    prisma.client.findMany({
      where: { active: true, ...clientWhere(u) }, orderBy: { name: "asc" },
      include: { assessments: { where: { kind: "COLETA", status: { in: [...HAS_DATA] } }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, startedAt: true, createdAt: true, status: true } } },
    }),
    prisma.assessment.findMany({ where: { status: { in: [...ACTIVE] }, ...assessmentWhere(u) }, orderBy: { createdAt: "asc" }, include: { client: { select: { id: true, name: true } } } }),
    prisma.assessment.findMany({ where: assessmentWhere(u), take: 8, orderBy: { createdAt: "desc" }, include: { client: { select: { id: true, name: true } }, startedBy: { select: { name: true, email: true } } } }),
    prisma.assessment.findMany({
      where: { status: { in: ["FAILED", "PARTIAL"] }, finishedAt: { gte: since }, runner: { not: "importado" }, ...assessmentWhere(u) },
      orderBy: { finishedAt: "desc" }, take: 6, include: { client: { select: { id: true, name: true } } },
    }),
  ]);
  const ok30 = await prisma.assessment.count({ where: { status: { in: [...HAS_DATA] }, finishedAt: { gte: since }, runner: { not: "importado" }, ...assessmentWhere(u) } });

  const lastOf = (c: (typeof clients)[number]) => c.assessments[0] ? (c.assessments[0].startedAt ?? c.assessments[0].createdAt) : null;
  const pending = manage ? clients.map((c) => ({ c, missing: readiness(c) })).filter((x) => x.missing.length) : [];
  const stale = clients.filter((c) => !readiness(c).length && (!lastOf(c) || lastOf(c)! < staleSince));

  if (!manage) {
    return (
      <>
        <PageHeader title="Painel" subtitle="Relatórios dos clientes liberados para você" />
        {clients.length === 0 ? <Empty>Nenhum cliente liberado para você ainda. Peça a um administrador.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((c) => (
              <Link key={c.id} href={`/clientes/${c.id}/relatorio`} className="card transition hover:border-ct-purple/40 hover:shadow-md">
                <p className="font-semibold">{c.name}</p>
                <p className="mt-1 text-sm text-slate-500">{lastOf(c) ? `Última coleta: ${dateTime(lastOf(c))}` : "Sem coleta ainda"}</p>
                <p className="mt-3 text-sm font-medium text-ct-purple">Abrir relatório →</p>
              </Link>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Painel"
        subtitle={<>Coletas rodam em <b>{RUNNER_LABEL[RUNNER]}</b> · credenciais em <b>{SECRET_STORE === "keyvault" ? "Azure Key Vault" : "cofre local cifrado"}</b></>}
        actions={<><Link href="/execucoes/nova" className="btn">Nova execução</Link><Link href="/clientes/novo" className="btn-secondary">Novo cliente</Link></>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Clientes ativos" value={clients.length} hint={`${clients.length - pending.length} prontos para coletar`} />
        <Kpi label="Rodando ou na fila" value={running.length} tone={running.length ? "warn" : undefined} />
        <Kpi label="Coletas com dados (30 dias)" value={ok30} tone="ok" />
        <Kpi label="Pedem atenção" value={problems.length + stale.length + pending.length} tone={problems.length ? "risk" : undefined} hint="falhas, sem coleta recente, configuração" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {running.length > 0 && (
            <section className="card">
              <h2 className="card-title">Rodando agora</h2>
              <ul className="divide-y divide-slate-100">
                {running.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="flex items-center gap-2"><StatusBadge status={a.status} /><Link className="link" href={`/execucoes/${a.id}`}>{a.client.name}</Link>{a.kind === "DIAGNOSTICO" && <Badge>diagnóstico</Badge>}</span>
                    <span className="text-xs text-slate-500">{a.startedAt ? `há ${duration(a.startedAt)}` : `na fila desde ${dateTime(a.createdAt)}`}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <h2 className="card-title">Últimas execuções</h2>
            <AssessmentTable rows={recent} />
            <Link href="/execucoes" className="link mt-3 inline-block text-sm">Ver todas →</Link>
          </section>
        </div>

        <section className="card h-fit">
          <h2 className="card-title">Pede atenção</h2>
          {problems.length + stale.length + pending.length === 0 ? <p className="muted">Nada pendente.</p> : (
            <ul className="space-y-4 text-sm">
              {problems.map((a) => (
                <li key={a.id}>
                  <Link className="link" href={`/execucoes/${a.id}`}>{a.client.name}</Link>
                  <p className="text-slate-600">Coleta de {dateTime(a.startedAt ?? a.createdAt)}: <b>{STATUS_LABEL[a.status]?.toLowerCase()}</b></p>
                </li>
              ))}
              {stale.map((c) => (
                <li key={c.id}>
                  <Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link>
                  <p className="text-slate-600">{lastOf(c) ? `Sem coleta há mais de ${STALE_DAYS} dias (última em ${dateTime(lastOf(c))})` : "Pronto, mas nunca coletado"}</p>
                </li>
              ))}
              {pending.map(({ c, missing }) => (
                <li key={c.id}>
                  <Link className="link" href={`/clientes/${c.id}?tab=conexao`}>{c.name}</Link>
                  <p className="text-slate-600">Falta configurar: {missing.join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
