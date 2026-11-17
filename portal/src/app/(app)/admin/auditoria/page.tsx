import { prisma } from "@/lib/prisma";
import { requirePagePerm } from "@/lib/session";
import { parseChanges } from "@/lib/audit";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export default async function Auditoria() {
  await requirePagePerm("users:manage");
  const logs = await prisma.auditLog.findMany({ take: 300, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } } });
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Últimas 300 alterações (usuários, clientes, conexões, bancos e execuções)" />
      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Quando</th><th>Quem</th><th>Entidade</th><th>Ação</th><th>Detalhes</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs">{dateTime(l.createdAt)}</td>
                <td className="text-xs">{l.user?.name ?? l.user?.email ?? "sistema"}</td>
                <td className="text-xs">{l.entity}<span className="block font-mono text-[10px] text-slate-400">{l.entityId}</span></td>
                <td className="text-xs font-medium">{l.action}</td>
                <td className="max-w-md break-words font-mono text-[11px] text-slate-600">{JSON.stringify(parseChanges(l.changes) ?? {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
