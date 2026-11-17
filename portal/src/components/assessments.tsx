import Link from "next/link";
import { Badge, Empty } from "./ui";
import { dateTime, duration } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/status";

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

type Row = {
  id: string; status: string; createdAt: Date; startedAt: Date | null; finishedAt: Date | null; totalSites: number | null;
  client?: { id: string; name: string }; startedBy?: { name: string | null; email: string } | null;
};

export function AssessmentTable({ rows, showClient = true }: { rows: Row[]; showClient?: boolean }) {
  if (!rows.length) return <Empty>Nenhuma execução ainda.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Início</th>
            {showClient && <th>Cliente</th>}
            <th>Status</th>
            <th>Duração</th>
            <th>Sites</th>
            <th>Por</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td><Link className="link" href={`/execucoes/${a.id}`}>{dateTime(a.startedAt ?? a.createdAt)}</Link></td>
              {showClient && <td>{a.client ? <Link className="link" href={`/clientes/${a.client.id}`}>{a.client.name}</Link> : "—"}</td>}
              <td><StatusBadge status={a.status} /></td>
              <td>{a.startedAt ? duration(a.startedAt, a.finishedAt) : "—"}</td>
              <td>{a.totalSites ?? "—"}</td>
              <td className="text-slate-500">{a.startedBy?.name ?? a.startedBy?.email ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
