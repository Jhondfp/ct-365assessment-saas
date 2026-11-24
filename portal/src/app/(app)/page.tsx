import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { assessmentWhere, clientWhere, requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ACTIVE, HAS_DATA, STATUS_LABEL, parseJson } from "@/lib/status";
import { readiness } from "@/lib/assessments";
import { dateTime, duration } from "@/lib/format";
import { Badge, Empty, Kpi, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/assessments";

const STALE_DAYS = 90;

/** Progresso de uma execução: workloads concluídos e, se a coleta foi dividida, lotes e sites. */
function progressOf(a: { workloads: string | null; tasks: { status: string; siteCount: number; done: number }[] }) {
  const w = Object.values(parseJson<Record<string, { status: string }>>(a.workloads, {}));
  const wDone = w.filter((x) => ["ok", "failed", "skipped"].includes(x.status)).length;
  const lots = a.tasks.length, lotsDone = a.tasks.filter((t) => t.status === "DONE").length;
  const sites = a.tasks.reduce((n, t) => n + t.siteCount, 0), sitesDone = a.tasks.reduce((n, t) => n + Math.min(t.done, t.siteCount), 0);
  const pct = lots ? Math.round((sitesDone / Math.max(sites, 1)) * 100) : w.length ? Math.round((wDone / w.length) * 100) : 0;
  return { pct, label: lots ? `${lotsDone} de ${lots} lotes · ${sitesDone.toLocaleString("pt-BR")} de ${sites.toLocaleString("pt-BR")} sites` : w.length ? `${wDone} de ${w.length} etapas` : "preparando" };
}

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
    prisma.assessment.findMany({
      where: { status: { in: [...ACTIVE] }, ...assessmentWhere(u) }, orderBy: { createdAt: "asc" },
      include: { client: { select: { id: true, name: true } }, tasks: { select: { status: true, siteCount: true, done: true } } },
    }),
    prisma.assessment.findMany({
      where: { ...assessmentWhere(u), status: { in: [...HAS_DATA] }, runner: { not: "importado" } }, take: 6, orderBy: { finishedAt: "desc" },
      include: { client: { select: { id: true, name: true } } },
    }),
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
        subtitle="Coletas em andamento, últimos resultados e clientes que pedem atenção."
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
          <section className="card">
            <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="card-title !mb-0">Rodando agora</h2><Link href="/execucoes" className="link text-xs">Todas as execuções →</Link></div>
            {running.length === 0 ? (
              <Empty>Nenhuma coleta em andamento. <Link className="link" href="/execucoes/nova">Iniciar uma coleta</Link></Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {running.map((a) => {
                  const pr = progressOf(a);
                  return (
                    <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><StatusBadge status={a.status} run={a} /><Link className="font-medium hover:text-ct-purple" href={`/execucoes/${a.id}`}>{a.client.name}</Link>{a.kind !== "COLETA" && <Badge>{a.kind === "DIAGNOSTICO" ? "diagnóstico" : a.kind.toLowerCase()}</Badge>}</span>
                        <span className="text-xs text-slate-500">{a.startedAt ? `há ${duration(a.startedAt)}` : `na fila desde ${dateTime(a.createdAt)}`}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pr.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${a.client.name}`}><div className="h-full rounded-full bg-ct-purple" style={{ width: `${pr.pct}%` }} /></div>
                        <span className="w-10 text-right text-xs font-medium tabular-nums">{pr.pct}%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{pr.label}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="card-title">Últimas coletas concluídas</h2>
            {recent.length === 0 ? <Empty>Nenhuma coleta concluída ainda.</Empty> : (
              <ul className="divide-y divide-slate-100">
                {recent.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">{a.client.name}{a.status === "PARTIAL" && <Badge tone="orange">com alertas</Badge>}</p>
                      <p className="text-xs text-slate-500">{dateTime(a.finishedAt ?? a.createdAt)}{a.totalSites != null && <> · {a.totalSites.toLocaleString("pt-BR")} sites</>}{a.startedAt && a.finishedAt && <> · {duration(a.startedAt, a.finishedAt)} de coleta</>}</p>
                    </div>
                    <span className="flex gap-2">
                      <Link href={`/execucoes/${a.id}`} className="btn-secondary !py-1.5 text-xs">Execução</Link>
                      <Link href={`/clientes/${a.client.id}/relatorio?execucao=${a.id}`} className="btn !py-1.5 text-xs">Ver relatório</Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card h-fit">
          <h2 className="card-title">Pede atenção</h2>
          {problems.length + stale.length + pending.length === 0 ? <p className="muted">Nada pendente.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {problems.map((a) => (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">{a.client.name}</p>
                  <p className="text-slate-600">Coleta de {dateTime(a.startedAt ?? a.createdAt)}: <b>{STATUS_LABEL[a.status]?.toLowerCase()}</b></p>
                  <Link className="btn-secondary mt-2 !py-1.5 text-xs" href={`/execucoes/${a.id}`}>Ver o que houve</Link>
                </li>
              ))}
              {stale.map((c) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-slate-600">{lastOf(c) ? `Sem coleta há mais de ${STALE_DAYS} dias (última em ${dateTime(lastOf(c))})` : "Pronto, mas nunca coletado"}</p>
                  <Link className="btn-secondary mt-2 !py-1.5 text-xs" href={`/clientes/${c.id}/executar`}>Nova coleta</Link>
                </li>
              ))}
              {pending.map(({ c, missing }) => (
                <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-slate-600">Falta configurar: {missing.join(", ")}</p>
                  <Link className="btn-secondary mt-2 !py-1.5 text-xs" href={`/clientes/${c.id}?tab=conexao`}>Configurar conexão</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
