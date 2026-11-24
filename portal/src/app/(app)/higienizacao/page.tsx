import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clientWhere, requirePagePerm } from "@/lib/session";
import { readiness } from "@/lib/assessments";
import { parseJson } from "@/lib/status";
import { bytes, num } from "@/lib/insights";
import { dateTime, duration } from "@/lib/format";
import type { HygieneParams, HygieneResult } from "@/lib/hygiene";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/assessments";

/** Higienização de todos os clientes: escolhe o cliente para uma nova ação e acompanha o histórico. */
export default async function Higienizacao({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const u = await requirePagePerm("assessments:run");
  const { cliente } = await searchParams;
  if (cliente) redirect(`/clientes/${encodeURIComponent(cliente)}?tab=higienizacao`);
  const cw = clientWhere(u);
  const [clients, runs] = await Promise.all([
    prisma.client.findMany({ where: { active: true, ...cw }, orderBy: { name: "asc" } }),
    prisma.assessment.findMany({
      where: { kind: "HIGIENIZACAO", ...("id" in cw ? { clientId: cw.id } : {}) },
      take: 200, orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, name: true } }, startedBy: { select: { name: true, email: true } } },
    }),
  ]);
  const ready = clients.filter((c) => !readiness(c).length && c.dbStatus === "PROVISIONADO");

  return (
    <>
      <PageHeader title="Higienização" subtitle="Ações que alteram o tenant do cliente a partir do que a coleta encontrou. Sempre manuais, começando pela simulação." />
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-1">
          <h2 className="card-title">Nova higienização</h2>
          {ready.length === 0 ? <Empty>Nenhum cliente pronto: precisa da conexão Microsoft 365 e de uma coleta concluída. <Link className="link" href="/clientes">Ver clientes</Link></Empty> : (
            <form className="space-y-3">
              <Field label="Cliente">
                <select name="cliente" required className="input">{ready.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </Field>
              <button className="btn w-full">Continuar</button>
            </form>
          )}
        </section>
        <section className="card lg:col-span-2">
          <h2 className="card-title">Disponível</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3"><span className="shrink-0 whitespace-nowrap"><Badge tone="purple">Ativo</Badge></span><span><b>Limpeza de versões antigas</b> — mantém as N versões mais recentes de cada arquivo; tenant inteiro ou sites escolhidos; lixeira ou exclusão permanente.</span></li>
          </ul>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Histórico</h2>
        {!runs.length ? <Empty>Nenhuma higienização ainda. Comece por uma simulação: ela mostra o espaço que seria liberado sem apagar nada.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Início</th><th>Cliente</th><th>Ação</th><th>Escopo</th><th>Status</th><th className="text-right">Versões</th><th className="text-right">Espaço</th><th>Duração</th><th>Por</th></tr></thead>
              <tbody>
                {runs.map((r) => {
                  const hp = parseJson<{ hygiene?: HygieneParams }>(r.params, {}).hygiene;
                  const res = parseJson<HygieneResult | null>(r.result, null);
                  const dry = hp?.dryRun ?? true;
                  return (
                    <tr key={r.id}>
                      <td><Link className="link" href={`/execucoes/${r.id}`}>{dateTime(r.startedAt ?? r.createdAt)}</Link></td>
                      <td><Link className="link" href={`/clientes/${r.client.id}?tab=higienizacao`}>{r.client.name}</Link></td>
                      <td>
                        {dry ? <Badge tone="blue">Simulação</Badge> : <Badge tone={hp?.recycle ? "orange" : "red"}>{hp?.recycle ? "Execução · lixeira" : "Execução · permanente"}</Badge>}
                        <span className="ml-1 text-xs text-slate-500">manter {hp?.keep ?? "—"}</span>
                      </td>
                      <td className="text-slate-600">{hp?.scope === "sites" ? `${hp.sites.length} site(s)` : "tenant inteiro"}</td>
                      <td><StatusBadge status={r.status} run={r} /></td>
                      <td className="text-right tabular-nums">{res ? num(res.versoes) : "—"}</td>
                      <td className="text-right tabular-nums">{res ? bytes(res.bytes) : "—"}</td>
                      <td>{r.startedAt ? duration(r.startedAt, r.finishedAt) : "—"}</td>
                      <td className="text-slate-500">{r.startedBy?.name ?? r.startedBy?.email ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
