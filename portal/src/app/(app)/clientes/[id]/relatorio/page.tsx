import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPage } from "@/lib/session";
import { reportData, reportExecutions, sectionCounts, SECTIONS, SECTION_WORKLOAD, type SectionKey } from "@/lib/report";
import { Empty, PageHeader } from "@/components/ui";
import { PrintButton, ReportToolbar } from "@/components/report/ReportToolbar";
import { Adoption, Exchange, Intune, Licensing, Overview, SiteSection } from "@/components/report/sections";

export default async function Relatorio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ execucao?: string; comparar?: string; secao?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireClientPage(id);
  const c = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, dbStatus: true } });
  if (!c) notFound();
  if (c.dbStatus !== "PROVISIONADO") {
    return (<><PageHeader title="Relatório" subtitle={<Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link>} /><Empty>O banco deste cliente ainda não foi preparado. Rode a primeira coleta (ou conecte um banco existente) para gerar o relatório.</Empty></>);
  }
  const execs = await reportExecutions(c.id, c.name);
  const current = sp.execucao && execs.some((e) => e.id === sp.execucao) ? sp.execucao : execs[0]?.id ?? null;
  const compare = sp.comparar && sp.comparar !== current && execs.some((e) => e.id === sp.comparar) ? sp.comparar : null;
  if (!current) {
    return (<><PageHeader title="Relatório" subtitle={<Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link>} /><Empty>Nenhuma coleta com dados ainda. Rode uma coleta ou importe as execuções do banco (aba Execuções do cliente).</Empty></>);
  }
  const [d, p] = await Promise.all([reportData(c.id, current), compare ? reportData(c.id, compare) : Promise.resolve(null)]);
  if (!d || d.error) return (<><PageHeader title="Relatório" subtitle={c.name} /><Empty>Não foi possível ler o banco do cliente: {String(d?.error ?? "sem dados")}</Empty></>);

  const counts = sectionCounts(d);
  const secao = (SECTIONS.some((s) => s.key === sp.secao) ? sp.secao : "visao") as SectionKey;
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ execucao: current, ...(compare ? { comparar: compare } : {}), ...extra }).toString()}`;
  const base = `/clientes/${c.id}/relatorio${qs({})}`;
  const label = execs.find((e) => e.id === current)?.label;

  return (
    <>
      <PageHeader
        title={`Relatório · ${c.name}`}
        subtitle={<>Coleta de {label}{compare && <> · comparando com {execs.find((e) => e.id === compare)?.label}</>}</>}
        actions={<>
          <Link className="btn" href={`/clientes/${c.id}/relatorio/executivo${qs({})}`}>Relatório executivo</Link>
          <PrintButton />
        </>}
      />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <ReportToolbar execs={execs.map(({ id, label }) => ({ id, label }))} current={current} compare={compare} />
        <a className="text-xs text-slate-500 hover:text-ct-purple print:hidden" href={`/relatorio/${c.id}?execution=${encodeURIComponent(current)}`} target="_blank" rel="noopener">Abrir dashboard clássico ↗</a>
      </div>
      <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 print:hidden" aria-label="Seções do relatório">
        {SECTIONS.map((s) => {
          const on = s.key === secao, has = counts[s.key] > 0;
          return (
            <Link key={s.key} href={`/clientes/${c.id}/relatorio${qs({ secao: s.key })}`} title={has ? undefined : `Sem dados nesta coleta (workload ${SECTION_WORKLOAD[s.key]})`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${on ? "border-ct-purple text-ct-purple" : has ? "border-transparent text-slate-600 hover:text-slate-900" : "border-transparent text-slate-300"}`}>
              {s.label}{s.key !== "visao" && has && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{counts[s.key].toLocaleString("pt-BR")}</span>}
            </Link>
          );
        })}
      </nav>
      {secao === "visao" && <Overview d={d} p={p} base={base} />}
      {secao === "sharepoint" && <SiteSection d={d} p={p} type="SharePoint" />}
      {secao === "onedrive" && <SiteSection d={d} p={p} type="OneDrive" />}
      {secao === "licencas" && <Licensing d={d} p={p} />}
      {secao === "adocao" && <Adoption d={d} />}
      {secao === "exchange" && <Exchange d={d} />}
      {secao === "intune" && <Intune d={d} />}
    </>
  );
}
