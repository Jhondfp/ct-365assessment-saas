import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPage } from "@/lib/session";
import { can } from "@/lib/rbac";
import { duplicateGroups, evolution, usage, versionSites } from "@/lib/reportExtras";
import { reportData, reportExecutions, sectionCounts, SECTIONS, SECTION_WORKLOAD, type SectionKey } from "@/lib/report";
import { Empty, PageHeader } from "@/components/ui";
import { PrintButton, ReportToolbar } from "@/components/report/ReportToolbar";
import { ReportBody, ReportShell, ReportTabs } from "@/components/report/ReportShell";
import { GoogleReport } from "@/components/report/GoogleReport";
import { googleData } from "@/lib/googleReport";
import { Adoption, Exchange, Intune, Licensing, Overview, SiteSection } from "@/components/report/sections";

export default async function Relatorio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ execucao?: string; comparar?: string; secao?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await requireClientPage(id);
  const c = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, dbStatus: true, platform: true } });
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
  if (c.platform === "GOOGLE") {
    const g = await googleData(c.id, current);
    return (
      <ReportShell>
        <PageHeader title={`Levantamento Google Workspace · ${c.name}`} subtitle={<>Coleta de {execs.find((e) => e.id === current)?.label} · foco na migração para o Microsoft 365</>} actions={<PrintButton />} />
        <div className="mb-5"><ReportToolbar execs={execs.map(({ id, label }) => ({ id, label }))} current={current} compare={null} /></div>
        <ReportBody><GoogleReport d={g} exportHref={`/api/relatorio/${c.id}/migracao?${new URLSearchParams({ execution: current }).toString()}`} /></ReportBody>
      </ReportShell>
    );
  }
  const secao0 = (SECTIONS.some((s) => s.key === sp.secao) ? sp.secao : "visao") as SectionKey;
  const [d, p, evo, versions, use, dups] = await Promise.all([
    reportData(c.id, current), compare ? reportData(c.id, compare) : Promise.resolve(null),
    secao0 === "visao" ? evolution(c.id, execs.slice(execs.findIndex((e) => e.id === current))) : Promise.resolve([]),
    secao0 === "sharepoint" || secao0 === "onedrive" ? versionSites(c.id, current) : Promise.resolve([]),
    secao0 === "licencas" ? usage(c.id, current) : Promise.resolve(null),
    secao0 === "sharepoint" ? duplicateGroups(c.id, current) : Promise.resolve([]),
  ]);
  const dupHref = (hash: string) => `/api/relatorio/${c.id}/duplicados?${new URLSearchParams({ execution: current, hash }).toString()}`;
  const hygieneHref = can(u.roles, "assessments:run")
    ? (sites: string[]) => `/clientes/${c.id}?${new URLSearchParams([["tab", "higienizacao"], ...sites.map((s) => ["site", s])]).toString()}`
    : undefined;
  if (!d || d.error) return (<><PageHeader title="Relatório" subtitle={c.name} /><Empty>Não foi possível ler o banco do cliente: {String(d?.error ?? "sem dados")}</Empty></>);

  const counts = sectionCounts(d);
  const secao = secao0;
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ execucao: current, ...(compare ? { comparar: compare } : {}), ...extra }).toString()}`;
  const base = `/clientes/${c.id}/relatorio${qs({})}`;
  const label = execs.find((e) => e.id === current)?.label;

  return (
    <ReportShell>
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
      <ReportTabs tabs={SECTIONS.map((s) => ({
        key: s.key, label: s.label, href: `/clientes/${c.id}/relatorio${qs({ secao: s.key })}`, on: s.key === secao, has: counts[s.key] > 0,
        title: counts[s.key] > 0 ? undefined : `Sem dados nesta coleta (workload ${SECTION_WORKLOAD[s.key]})`,
      }))} />
      <ReportBody>
      {secao === "visao" && <Overview d={d} p={p} base={base} evo={evo} />}
      {secao === "sharepoint" && <SiteSection d={d} p={p} type="SharePoint" versions={versions} hygieneHref={hygieneHref} duplicates={dups} dupHref={dupHref} />}
      {secao === "onedrive" && <SiteSection d={d} p={p} type="OneDrive" versions={versions} hygieneHref={hygieneHref} />}
      {secao === "licencas" && <Licensing d={d} p={p} use={use} />}
      {secao === "adocao" && <Adoption d={d} />}
      {secao === "exchange" && <Exchange d={d} />}
      {secao === "intune" && <Intune d={d} />}
      </ReportBody>
    </ReportShell>
  );
}
