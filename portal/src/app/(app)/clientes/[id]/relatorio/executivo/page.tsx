import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPage } from "@/lib/session";
import { reportData, reportExecutions } from "@/lib/report";
import { GB, bytes, findings, growth, idleLicenses, mb, num, pct, savings, usd, SEV_LABEL } from "@/lib/insights";
import { LogoCT } from "@/components/LogoCT";
import { Empty } from "@/components/ui";
import { PrintButton } from "@/components/report/ReportToolbar";
import { FindingList } from "@/components/report/sections";

/** Relatório executivo (2–3 páginas A4): para entregar ao cliente. Use "Imprimir / PDF" do navegador. */
export default async function Executivo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ execucao?: string; comparar?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireClientPage(id);
  const c = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, dbStatus: true, spoTenant: true, platform: true } });
  if (!c) notFound();
  if (c.platform === "GOOGLE" || c.platform === "AWS") redirect(`/clientes/${c.id}/relatorio`);
  const execs = await reportExecutions(c.id, c.name);
  const current = sp.execucao && execs.some((e) => e.id === sp.execucao) ? sp.execucao : execs[0]?.id ?? null;
  const d = current ? await reportData(c.id, current) : null;
  if (!d || d.error) return <Empty>Sem dados para o relatório executivo.</Empty>;

  const s = d.sites ?? {}, f = d.files ?? {};
  const sv = savings(f, d.trash ?? {});
  const lic = idleLicenses(d.licensing_by_sku ?? []);
  const g = growth(s, d.sharepoint?.growth_monthly ?? []);
  const F = findings(d);
  const counts = { critical: F.filter((x) => x.sev === "critical").length, high: F.filter((x) => x.sev === "high").length };
  const when = execs.find((e) => e.id === current)?.label;
  const kpis: [string, string, string?][] = [
    ["Sites", num(s.total), `${num(s.teams_connected)} conectados ao Teams`],
    ["Armazenamento", mb(s.storage_mb), s.quota_mb ? `${pct(s.storage_mb, s.quota_mb)}% da cota` : undefined],
    ["Arquivos", num(f.total), bytes(f.size_bytes)],
    ["Parado há +2 anos", bytes(f.stale_2y_bytes), `${pct(f.stale_2y, f.total)}% dos arquivos`],
    ["Sites com acesso externo", num(s.external_sharing), `${pct(s.external_sharing, s.total)}% dos sites`],
    ["Licenças não atribuídas", num(lic.idle), lic.monthly ? `~${usd(lic.monthly)}/mês` : undefined],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link className="link text-sm" href={`/clientes/${c.id}/relatorio?execucao=${current}`}>← Voltar ao relatório</Link>
        <PrintButton label="Imprimir / salvar PDF" />
      </div>
      <article className="space-y-8 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ct-purple">Assessment de governança Microsoft 365</p>
            <h1 className="mt-1 text-3xl font-semibold">{c.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{c.spoTenant ? `${c.spoTenant}.sharepoint.com · ` : ""}coleta de {when}</p>
          </div>
          <LogoCT width={150} className="text-ct-ink" />
        </header>

        <section>
          <h2 className="text-lg font-semibold">Resumo</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            O ambiente tem <b>{num(s.total)} sites</b> com <b>{mb(s.storage_mb)}</b> em uso{s.quota_mb ? <> ({pct(s.storage_mb, s.quota_mb)}% da cota)</> : null}.
            {" "}A análise encontrou <b>{F.length} ponto(s) de atenção</b>{counts.critical + counts.high > 0 && <>, sendo <b>{counts.critical + counts.high} de prioridade alta ou crítica</b></>}.
            {" "}A economia potencial estimada é de <b>{usd(sv.totalM + lic.monthly)} por mês</b> com arquivamento, limpeza de versões e lixeiras e ajuste de licenças.
            {g.monthsToFull != null && <> No ritmo atual de crescimento ({bytes((g.monthlyGB ?? 0) * GB)}/mês), a cota do SharePoint enche em cerca de <b>{g.monthsToFull} meses</b>.</>}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {kpis.map(([k, v, h]) => (
              <div key={k} className="rounded-xl border border-slate-200 p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
                {h && <p className="text-xs text-slate-500">{h}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="break-before-auto">
          <h2 className="text-lg font-semibold">Achados e recomendações</h2>
          <p className="mb-3 text-sm text-slate-500">Ordenados por prioridade ({Object.entries(SEV_LABEL).map(([, l]) => l).join(" › ")}).</p>
          <FindingList items={F} />
        </section>

        <section className="break-inside-avoid">
          <h2 className="text-lg font-semibold">Economia estimada</h2>
          <table className="tbl mt-3">
            <thead><tr><th>Ação</th><th className="text-right">Volume</th><th className="text-right">US$/mês</th></tr></thead>
            <tbody>
              <tr><td>Arquivar conteúdo sem alteração há +2 anos</td><td className="text-right tabular-nums">{bytes(sv.archiveGB * GB)}</td><td className="text-right tabular-nums">{usd(sv.archiveM)}</td></tr>
              <tr><td>Limitar o histórico de versões</td><td className="text-right tabular-nums">{bytes(sv.versionGB * 0.6 * GB)}</td><td className="text-right tabular-nums">{usd(sv.versionsM)}</td></tr>
              <tr><td>Esvaziar lixeiras dos sites</td><td className="text-right tabular-nums">{bytes(sv.trashGB * GB)}</td><td className="text-right tabular-nums">{usd(sv.trashM)}</td></tr>
              <tr><td>Ajustar licenças não atribuídas</td><td className="text-right tabular-nums">{num(lic.idle)} licenças</td><td className="text-right tabular-nums">{usd(lic.monthly)}</td></tr>
              <tr className="font-semibold"><td>Total</td><td /><td className="text-right tabular-nums">{usd(sv.totalM + lic.monthly)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Valores de referência (armazenamento extra do SharePoint a US$ 0,20/GB/mês e preço público das licenças). Servem para dimensionar a oportunidade; não refletem o contrato do cliente.</p>
        </section>

        <section className="break-inside-avoid">
          <h2 className="text-lg font-semibold">Próximos passos sugeridos</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            {F.slice(0, 5).map((x, i) => <li key={i}><b>{x.title}:</b> {x.action}</li>)}
            {F.length === 0 && <li>Manter a coleta periódica para acompanhar a evolução do ambiente.</li>}
          </ol>
        </section>

        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          Gerado pelo CT Assessment 365 · Cloud Target · {new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </footer>
      </article>
    </div>
  );
}
