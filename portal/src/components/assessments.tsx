import Link from "next/link";
import { Badge, Empty } from "./ui";
import { dateTime, duration } from "@/lib/format";
import { isStalled, STATUS_LABEL, STATUS_TONE } from "@/lib/status";

/** Passe `run` (status + runner + heartbeatAt) para mostrar "Interrompida" quando o worker parou de responder. */
export function StatusBadge({ status, run }: { status: string; run?: Parameters<typeof isStalled>[0] }) {
  if (run && isStalled(run)) return <span title="O worker parou de responder (reinício ou nova versão). A coleta volta para a fila e é retomada de onde parou."><Badge tone="orange">Interrompida · aguardando retomada</Badge></span>;
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

type Row = {
  id: string; status: string; runner?: string; heartbeatAt?: Date | null; createdAt: Date; startedAt: Date | null; finishedAt: Date | null; totalSites: number | null;
  client?: { id: string; name: string }; startedBy?: { name: string | null; email: string } | null;
};

export function AssessmentTable({ rows, showClient = true }: { rows: Row[]; showClient?: boolean }) {
  if (!rows.length) return <Empty>Nenhuma execução ainda. <Link className="link" href="/execucoes/nova">Iniciar uma coleta</Link></Empty>;
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
              <td><StatusBadge status={a.status} run={a} /></td>
              <td>{a.startedAt && (a.finishedAt || ["QUEUED", "STARTING", "RUNNING"].includes(a.status)) ? duration(a.startedAt, a.finishedAt) : "—"}</td>
              <td>{a.totalSites ?? "—"}</td>
              <td className="text-slate-500">{a.startedBy?.name ?? a.startedBy?.email ?? (a.runner === "importado" ? "fora do portal" : "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
