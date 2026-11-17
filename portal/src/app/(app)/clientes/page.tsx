import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { clientWhere, requirePagePerm } from "@/lib/session";
import { can } from "@/lib/rbac";
import { readiness } from "@/lib/assessments";
import { DB_STATUS_LABEL } from "@/lib/status";
import { dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/assessments";

export default async function Clientes() {
  const u = await requirePagePerm("reports:view");
  const clients = await prisma.client.findMany({
    where: clientWhere(u),
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { assessments: { take: 1, orderBy: { createdAt: "desc" } }, _count: { select: { viewers: true } } },
  });
  return (
    <>
      <PageHeader title="Clientes" subtitle="Cada cliente tem a própria conexão com o Microsoft 365 e um banco de dados isolado." actions={can(u.roles, "clients:manage") && <Link href="/clientes/novo" className="btn">Novo cliente</Link>} />
      <div className="card">
        {clients.length === 0 ? <Empty>{can(u.roles, "clients:all") ? "Nenhum cliente cadastrado." : "Nenhum cliente liberado para você."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Cliente</th><th>Microsoft 365</th><th>Banco</th><th>Última execução</th><th>Visualizadores</th></tr></thead>
              <tbody>
                {clients.map((c) => {
                  const missing = readiness(c);
                  const last = c.assessments[0];
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link>
                        {!c.active && <span className="ml-2"><Badge>inativo</Badge></span>}
                        <p className="text-xs text-slate-500">{c.spoTenant ? `${c.spoTenant}.sharepoint.com` : c.slug}</p>
                      </td>
                      <td>{missing.length ? <Badge tone="orange">pendente</Badge> : c.connectionOkAt ? <Badge tone="green">testada</Badge> : <Badge tone="blue">configurada</Badge>}</td>
                      <td><Badge tone={c.dbStatus === "PROVISIONADO" ? "green" : c.dbStatus === "ERRO" ? "red" : "gray"}>{DB_STATUS_LABEL[c.dbStatus] ?? c.dbStatus}</Badge></td>
                      <td>{last ? <span className="flex items-center gap-2"><StatusBadge status={last.status} /><Link className="link text-xs" href={`/execucoes/${last.id}`}>{dateTime(last.createdAt)}</Link></span> : <span className="muted">—</span>}</td>
                      <td>{c._count.viewers}</td>
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
