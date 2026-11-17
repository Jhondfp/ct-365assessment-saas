import { cache } from "react";
import { prisma } from "./prisma";
import { clientConn } from "./clientDb";
import { readQuery, type DbConn } from "./tenantDb";
import { idleLicenses } from "./insights";

/**
 * Dados extras do relatório nativo (além do porte do Start-Monitor em dashboard.ts): evolução entre coletas,
 * excedente de versões por site e uso real dos usuários. Leem as tabelas de agregação/base do coletor direto,
 * cada bloco tolerante a falha (seção vazia em vez de derrubar o relatório).
 */
const N = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const isOneDrive = (url: string) => /-my\.sharepoint\.com/i.test(url);

async function conn(clientId: string): Promise<DbConn | null> {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (!c.dbName || c.dbStatus !== "PROVISIONADO") return null;
  return clientConn(c);
}

export type EvolutionPoint = {
  id: string; date: Date | null; label: string;
  sites: number; storageMB: number; external: number;
  files: number; staleBytes: number; versionBytes: number;
  licenses: number; idleLicenses: number; hasFiles: boolean; hasLicensing: boolean;
};

/** Indicadores por coleta (até as 12 mais recentes, em ordem cronológica). */
export const evolution = cache(async (clientId: string, execs: { id: string; date: Date | null; label: string }[]): Promise<EvolutionPoint[]> => {
  const list = execs.slice(0, 12);
  if (list.length < 2) return [];
  const db = await conn(clientId);
  if (!db) return [];
  const params: Record<string, string> = {};
  list.forEach((e, i) => { params[`e${i}`] = e.id; });
  const inList = list.map((_, i) => `@e${i}`).join(", ");
  const safe = async (q: string) => { try { return await readQuery(db, q, params, 120_000); } catch { return []; } };
  const [sites, files, lic] = await Promise.all([
    safe(`SELECT execution_id, COUNT(*) AS sites, CAST(SUM(ISNULL(storage_used, 0)) AS BIGINT) AS storage_mb,
                 SUM(CASE WHEN is_external_sharing_enabled = 1 THEN 1 ELSE 0 END) AS ext
          FROM dbo.sites_info WHERE execution_id IN (${inList}) GROUP BY execution_id`),
    safe(`SELECT execution_id, SUM(total_files) AS files, CAST(SUM(total_size_bytes) AS BIGINT) AS size_bytes,
                 CAST(SUM(total_size_with_ver_bytes) AS BIGINT) AS ver_bytes, CAST(SUM(stale_2y_bytes) AS BIGINT) AS stale_bytes
          FROM dbo.agg_files_by_site WHERE execution_id IN (${inList}) GROUP BY execution_id`),
    safe(`SELECT execution_id, sku_part_number, friendly_name, total_licenses, used_licenses
          FROM dbo.licensing_info WHERE execution_id IN (${inList})`),
  ]);
  const by = <T extends Record<string, unknown>>(rows: T[]) => new Map(rows.map((r) => [String(r.execution_id), r]));
  const S = by(sites), F = by(files);
  return list.map((e) => {
    const s = S.get(e.id), f = F.get(e.id);
    const skus = lic.filter((r) => String(r.execution_id) === e.id).map((r) => ({
      ...r, total_licenses: N(r.total_licenses), used_licenses: N(r.used_licenses), available_licenses: Math.max(0, N(r.total_licenses) - N(r.used_licenses)),
    }));
    const idle = idleLicenses(skus);
    return {
      id: e.id, date: e.date, label: e.label,
      sites: N(s?.sites), storageMB: N(s?.storage_mb), external: N(s?.ext),
      files: N(f?.files), staleBytes: N(f?.stale_bytes), versionBytes: Math.max(0, N(f?.ver_bytes) - N(f?.size_bytes)),
      licenses: skus.reduce((a, r, i) => a + (idle.rows[i].free ? 0 : r.total_licenses), 0), idleLicenses: idle.idle,
      hasFiles: !!f, hasLicensing: skus.length > 0,
    };
  }).reverse();
});

export type VersionSite = { url: string; name: string; overhead: number; files100: number; files50: number; versions: number; size: number; type: "SharePoint" | "OneDrive" };

/** Sites com mais espaço ocupado por versões antigas (agg_files_by_site, instantâneo). */
export const versionSites = cache(async (clientId: string, executionId: string): Promise<VersionSite[]> => {
  const db = await conn(clientId);
  if (!db) return [];
  try {
    const rows = await readQuery(db, `
      SELECT TOP 200 site_url, site_name, version_overhead_bytes, files_over_100_versions, files_over_50_versions, total_versions, total_size_bytes
      FROM dbo.agg_files_by_site WHERE execution_id = @e AND version_overhead_bytes > 0
      ORDER BY version_overhead_bytes DESC`, { e: executionId }, 60_000);
    return rows.map((r) => {
      const url = String(r.site_url ?? "");
      return {
        url, name: String(r.site_name || url.replace(/^https:\/\/[^/]+/, "")), overhead: N(r.version_overhead_bytes),
        files100: N(r.files_over_100_versions), files50: N(r.files_over_50_versions), versions: N(r.total_versions), size: N(r.total_size_bytes),
        type: isOneDrive(url) ? "OneDrive" : "SharePoint",
      };
    });
  } catch { return []; }
});

export type UsageSummary = {
  total: number; collab: number; emailOnly: number; inactive: number;
  inactiveUsers: { user: string; last: string | null }[]; emailOnlyUsers: { user: string; last: string | null }[];
};

/**
 * Uso real por usuário (30 dias antes da coleta, em qualquer serviço): quem usa colaboração (Teams/SharePoint/OneDrive),
 * quem só usa e-mail e quem não usa nada. Os relatórios do Graph listam usuários licenciados para cada serviço.
 */
export const usage = cache(async (clientId: string, executionId: string): Promise<UsageSummary | null> => {
  const db = await conn(clientId);
  if (!db) return null;
  try {
    const rows = await readQuery(db, `
      WITH u AS (
        SELECT user_principal_name AS upn,
               MAX(CASE WHEN service = 'Exchange' AND last_activity_date >= DATEADD(DAY, -30, collected_at) THEN 1 ELSE 0 END) AS mail,
               MAX(CASE WHEN service <> 'Exchange' AND last_activity_date >= DATEADD(DAY, -30, collected_at) THEN 1 ELSE 0 END) AS collab,
               MAX(last_activity_date) AS last_any
        FROM dbo.user_activity
        WHERE execution_id = @e AND ISNULL(is_deleted, 0) = 0 AND user_principal_name IS NOT NULL
        GROUP BY user_principal_name)
      SELECT upn, mail, collab, last_any FROM u`, { e: executionId }, 60_000);
    if (!rows.length) return null;
    const iso = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
    const inactive = rows.filter((r) => !N(r.mail) && !N(r.collab));
    const emailOnly = rows.filter((r) => N(r.mail) && !N(r.collab));
    return {
      total: rows.length, collab: rows.filter((r) => N(r.collab)).length, emailOnly: emailOnly.length, inactive: inactive.length,
      inactiveUsers: inactive.map((r) => ({ user: String(r.upn), last: iso(r.last_any) })),
      emailOnlyUsers: emailOnly.map((r) => ({ user: String(r.upn), last: iso(r.last_any) })),
    };
  } catch { return null; }
});
