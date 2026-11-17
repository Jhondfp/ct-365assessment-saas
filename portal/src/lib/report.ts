import { cache } from "react";
import { prisma } from "./prisma";
import { clientConn } from "./clientDb";
import { dashboardJson, executionsJson } from "./dashboard";
import { HAS_DATA } from "./status";
import type { Dash } from "./insights";

export type ExecOption = { id: string; label: string; date: Date | null };

/** Execuções com dados do cliente: coletas do portal (inclui importadas) + as que só existem no banco do cliente. */
export const reportExecutions = cache(async (clientId: string, clientName: string) => {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const portal = await prisma.assessment.findMany({
    where: { clientId, kind: "COLETA", status: { in: [...HAS_DATA] } },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }], take: 50, select: { id: true, startedAt: true, createdAt: true, status: true },
  });
  const opts: ExecOption[] = portal.map((a) => ({ id: a.id, date: a.startedAt ?? a.createdAt, label: "" }));
  try {
    const db = await executionsJson(await clientConn(c), clientName);
    for (const e of db) {
      if (opts.some((o) => o.id === e.execution_id)) continue;
      const d = e.start_time ? new Date(`${e.start_time.replace(" ", "T")}:00Z`) : null;
      opts.push({ id: e.execution_id, date: d && !isNaN(d.getTime()) ? d : null, label: "" });
    }
  } catch { /* banco indisponível: fica só com a lista do portal */ }
  opts.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  for (const o of opts) {
    o.label = o.date ? o.date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : o.id.slice(0, 8);
  }
  return opts;
});

/** Dados do relatório de uma execução (cache por request: as abas e o executivo reaproveitam). */
export const reportData = cache(async (clientId: string, executionId: string | null): Promise<Dash | null> => {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (!c.dbName || c.dbStatus !== "PROVISIONADO") return null;
  return (await dashboardJson(await clientConn(c), executionId)) as Dash;
});

export const SECTIONS = [
  { key: "visao", label: "Visão geral" },
  { key: "sharepoint", label: "SharePoint" },
  { key: "onedrive", label: "OneDrive" },
  { key: "licencas", label: "Licenciamento" },
  { key: "adocao", label: "Adoção" },
  { key: "exchange", label: "Exchange" },
  { key: "intune", label: "Intune" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

/** Quais seções têm dado nesta execução (as demais aparecem desabilitadas, explicando o workload que falta). */
export function sectionCounts(d: Dash): Record<SectionKey, number> {
  return {
    visao: 1,
    sharepoint: Number(d.sharepoint?.sites?.total ?? 0),
    onedrive: Number(d.onedrive?.sites?.total ?? 0),
    licencas: Number(d.licensing?.total_skus ?? 0),
    adocao: (d.adoption_by_service ?? []).length,
    exchange: Number(d.mailbox?.total ?? 0),
    intune: Number(d.intune?.total ?? 0),
  };
}
export const SECTION_WORKLOAD: Record<SectionKey, string> = {
  visao: "", sharepoint: "Sites e subsites + Arquivos", onedrive: "Sites e subsites (com OneDrive) + Arquivos", licencas: "Licenciamento",
  adocao: "Adoção", exchange: "Caixas de e-mail", intune: "Dispositivos Intune",
};
