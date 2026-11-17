import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { clientWhere, requirePagePerm } from "@/lib/session";
import { can } from "@/lib/rbac";
import { readiness } from "@/lib/assessments";
import { DB_STATUS_LABEL, HAS_DATA } from "@/lib/status";
import { dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/assessments";

const STALE_MS = 90 * 86400_000;
const FILTERS = [
  { key: "", label: "Todos" }, { key: "pendentes", label: "Configuração pendente" }, { key: "sem-coleta", label: "Sem coleta há +90 dias" }, { key: "inativos", label: "Inativos" },
] as const;

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const u = await requirePagePerm("reports:view");
  const { q = "", f = "" } = await searchParams;
  const manage = can(u.roles, "clients:manage");
  const all = await prisma.client.findMany({
    where: { ...clientWhere(u), ...(q ? { OR: [{ name: { contains: q } }, { spoTenant: { contains: q } }, { slug: { contains: q } }] } : {}) },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      assessments: { where: { kind: "COLETA" }, take: 1, orderBy: { createdAt: "desc" } },
      _count: { select: { viewers: true } },
    },
  });
  const lastData = await prisma.assessment.groupBy({ by: ["clientId"], where: { kind: "COLETA", status: { in: [...HAS_DATA] }, clientId: { in: all.map((c) => c.id) } }, _max: { startedAt: true } });
  const lastMap = new Map(lastData.map((r) => [r.clientId, r._max.startedAt]));
  const now = Date.now();
  const clients = all.filter((c) => {
    if (f === "pendentes") return c.active && readiness(c).length > 0;
    if (f === "sem-coleta") { const l = lastMap.get(c.id); return c.active && !readiness(c).length && (!l || now - l.getTime() > STALE_MS); }
    if (f === "inativos") return !c.active;
    return true;
  });
  const href = (k: string) => `/clientes?${new URLSearchParams({ ...(q ? { q } : {}), ...(k ? { f: k } : {}) })}`;

  return (
    <>
      <PageHeader title="Clientes" subtitle="Cada cliente tem a própria conexão com o Microsoft 365 e um banco de dados isolado." actions={manage && <Link href="/clientes/novo" className="btn">Novo cliente</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="flex gap-2" action="/clientes">
          <input name="q" defaultValue={q} placeholder="Buscar por nome ou SharePoint…" className="input !w-72" aria-label="Buscar clientes" />
          {f && <input type="hidden" name="f" value={f} />}
          <button className="btn-secondary">Buscar</button>
        </form>
        <nav className="flex flex-wrap gap-1" aria-label="Filtros">
          {FILTERS.filter((x) => manage || x.key !== "pendentes").map((x) => (
            <Link key={x.key} href={href(x.key)} className={`rounded-full px-3 py-1 text-xs font-medium ${f === x.key ? "bg-ct-purple text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{x.label}</Link>
          ))}
        </nav>
      </div>
      <div className="card">
        {clients.length === 0 ? <Empty>{q || f ? "Nenhum cliente com esses filtros." : can(u.roles, "clients:all") ? "Nenhum cliente cadastrado." : "Nenhum cliente liberado para você."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Cliente</th><th>Microsoft 365</th><th>Banco</th><th>Última coleta com dados</th><th>Última execução</th>{manage && <th>Visualizadores</th>}</tr></thead>
              <tbody>
                {clients.map((c) => {
                  const missing = readiness(c);
                  const last = c.assessments[0];
                  const lastOk = lastMap.get(c.id);
                  const stale = !lastOk || now - lastOk.getTime() > STALE_MS;
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link>
                        {!c.active && <span className="ml-2"><Badge>inativo</Badge></span>}
                        <p className="text-xs text-slate-500">{c.spoTenant ? `${c.spoTenant}.sharepoint.com` : c.slug}</p>
                      </td>
                      <td>{missing.length ? <Badge tone="orange">pendente</Badge> : c.connectionOkAt ? <Badge tone="green">testada</Badge> : <Badge tone="blue">configurada</Badge>}</td>
                      <td><Badge tone={c.dbStatus === "PROVISIONADO" ? "green" : c.dbStatus === "ERRO" ? "red" : "gray"}>{c.dbMode === "EXTERNAL" ? "existente · " : ""}{DB_STATUS_LABEL[c.dbStatus] ?? c.dbStatus}</Badge></td>
                      <td>
                        {lastOk ? <Link className={`text-sm ${stale ? "text-amber-800" : "link"}`} href={`/clientes/${c.id}/relatorio`}>{dateTime(lastOk)}</Link> : <span className="muted">—</span>}
                        {lastOk && stale && <p className="text-xs text-amber-800">há mais de 90 dias</p>}
                      </td>
                      <td>{last ? <Link href={`/execucoes/${last.id}`}><StatusBadge status={last.status} /></Link> : <span className="muted">—</span>}</td>
                      {manage && <td>{c._count.viewers}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
