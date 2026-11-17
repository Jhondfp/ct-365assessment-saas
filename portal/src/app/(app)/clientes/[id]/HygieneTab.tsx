import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { clientConn } from "@/lib/clientDb";
import { lastCompletedExecution, versionCandidatesBySite, type HygieneParams, type HygieneResult } from "@/lib/hygiene";
import { bytes, num } from "@/lib/insights";
import { parseJson } from "@/lib/status";
import { dateTime } from "@/lib/format";
import { startHygiene } from "@/actions/hygiene";
import { HygieneForm } from "@/components/HygieneForm";
import { StatusBadge } from "@/components/assessments";
import { Badge, Empty } from "@/components/ui";

/** Aba Higienização do cliente: formulário (limpeza de versões) e histórico de simulações/execuções. */
export async function HygieneTab({ client, keep, from, sites = [] }: { client: { id: string; slug: string; dbMode: string; dbServer: string | null; dbUser: string | null; dbName: string | null; dbStatus: string }; keep: number; from?: string; sites?: string[] }) {
  const history = await prisma.assessment.findMany({
    where: { clientId: client.id, kind: "HIGIENIZACAO" }, orderBy: { createdAt: "desc" }, take: 20,
    include: { startedBy: { select: { name: true, email: true } } },
  });
  if (client.dbStatus !== "PROVISIONADO") return <Empty>O banco do cliente ainda não está pronto. Rode uma coleta antes de higienizar.</Empty>;

  let source: { id: string; label: string } | null = null, candidates: Awaited<ReturnType<typeof versionCandidatesBySite>> = [], error: string | null = null;
  try {
    const db = await clientConn(client);
    const last = await lastCompletedExecution(db);
    if (last) {
      source = { id: last.id, label: last.start ? dateTime(last.start) : last.id.slice(0, 8) };
      candidates = await versionCandidatesBySite(db, last.id, keep);
    }
  } catch (e) { error = e instanceof Error ? e.message : String(e); }

  const prev = from ? history.find((h) => h.id === from) : undefined;
  const pp = prev ? parseJson<{ hygiene?: HygieneParams }>(prev.params, {}).hygiene : undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Limpeza de versões antigas.</b> Mantém as N versões mais recentes de cada arquivo e apaga as mais antigas. Sempre rode <b>Simular</b> antes:
          ela não altera nada e mostra exatamente o que sairia. A execução é manual e fica registrada na auditoria.
        </div>
        {error ? <Empty>Não foi possível ler o banco do cliente: {error}</Empty>
          : !source ? <Empty>Nenhuma coleta concluída com o workload Arquivos. Rode uma coleta antes: é ela que aponta os arquivos com excesso de versões.</Empty>
          : candidates.length === 0 ? <Empty>Nenhum arquivo com mais de {keep} versões na coleta de {source.label}. Experimente um número menor de versões a manter.</Empty>
          : <HygieneForm key={`${keep}-${from ?? ""}-${sites.length}`} action={startHygiene.bind(null, client.id)} keep={keep} candidates={candidates} source={source}
              defaults={pp ? { scope: pp.scope, sites: pp.sites, permanent: !pp.recycle, method: pp.mode, maxFiles: pp.maxFiles } : sites.length ? { scope: "sites", sites } : undefined} />}
      </div>
      <section className="card h-fit">
        <h2 className="card-title">Histórico</h2>
        {history.length === 0 ? <p className="muted">Nenhuma higienização ainda.</p> : (
          <ul className="divide-y divide-slate-100">
            {history.map((h) => {
              const hp = parseJson<{ hygiene?: HygieneParams }>(h.params, {}).hygiene;
              const r = parseJson<HygieneResult | null>(h.result, null);
              return (
                <li key={h.id} className="py-3 text-sm first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="link" href={`/execucoes/${h.id}`}>{dateTime(h.createdAt)}</Link>
                    <Badge tone={hp?.dryRun ? "blue" : "red"}>{hp?.dryRun ? "simulação" : "execução"}</Badge>
                    <StatusBadge status={h.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    manter {hp?.keep} · {hp?.scope === "sites" ? `${hp.sites.length} site(s)` : "tenant inteiro"} · {hp?.recycle ? "lixeira" : `permanente${hp?.mode === "JobSharePoint" ? " (job do SharePoint)" : ""}`}
                  </p>
                  {r && <p className="text-xs text-slate-700">{num(r.versoes)} versões em {num(r.arquivos_alterados)} arquivos · {bytes(r.bytes)}</p>}
                  <p className="text-xs text-slate-400">{h.startedBy?.name ?? h.startedBy?.email}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
