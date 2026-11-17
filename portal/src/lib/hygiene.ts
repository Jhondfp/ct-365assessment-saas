import { readQuery, type DbConn } from "./tenantDb";

/**
 * Higienização: consultas no banco do cliente.
 * As estimativas usam a última coleta (files_info.versions_count é estimado pelo rótulo da versão);
 * os números exatos saem da simulação, que lê as versões reais no SharePoint.
 */
export type SiteCandidate = { site_url: string; files: number; est_versions: number; est_bytes: number };

export async function lastCompletedExecution(db: DbConn) {
  const r = await readQuery(db, "SELECT TOP 1 execution_id, start_time FROM dbo.execution_history WHERE status = 'completed' ORDER BY start_time DESC");
  return r[0] ? { id: String(r[0].execution_id), start: r[0].start_time ? new Date(r[0].start_time as string) : null } : null;
}

/**
 * Estimativa por site a partir da coleta. Usa a agregação dbo.agg_version_by_site (histograma de versões por site,
 * instantâneo); só lê files_info se a coleta ainda não tiver agregação. É um teto: a simulação lê as versões reais.
 */
export async function versionCandidatesBySite(db: DbConn, executionId: string, keep: number): Promise<SiteCandidate[]> {
  const fromAgg = await readQuery(db, `
    WITH u AS (SELECT site_name, MIN(site_url) AS site_url FROM dbo.agg_files_by_site WHERE execution_id = @e GROUP BY site_name)
    SELECT u.site_url, SUM(v.file_count) AS files,
           SUM(CAST(v.versions_count - @keep AS BIGINT) * v.file_count) AS est_versions,
           SUM(CAST(v.versions_count - @keep AS FLOAT) * v.sum_file_size_bytes) AS est_bytes
    FROM dbo.agg_version_by_site v JOIN u ON u.site_name = v.site_name
    WHERE v.execution_id = @e AND v.versions_count > @keep
    GROUP BY u.site_url
    ORDER BY est_bytes DESC`, { e: executionId, keep }, 60_000).catch(() => null);
  const hasAgg = fromAgg && (fromAgg.length > 0 || (await readQuery(db, "SELECT TOP 1 1 AS x FROM dbo.agg_version_by_site WHERE execution_id = @e", { e: executionId }, 30_000).catch(() => [])).length > 0);
  const rows = hasAgg ? fromAgg! : await readQuery(db, `
    SELECT site_url, COUNT(*) AS files,
           SUM(CAST(versions_count - @keep AS BIGINT)) AS est_versions,
           SUM(CAST(versions_count - @keep AS BIGINT) * ISNULL(file_size, 0)) AS est_bytes
    FROM dbo.files_info
    WHERE execution_id = @e AND versions_count > @keep AND ISNULL(preservation_hold_library, 0) = 0
      AND (file_compliance_tag IS NULL OR file_compliance_tag = '') AND site_url IS NOT NULL
    GROUP BY site_url
    ORDER BY est_bytes DESC`, { e: executionId, keep }, 300_000);
  return rows.map((r) => ({ site_url: String(r.site_url), files: Number(r.files ?? 0), est_versions: Number(r.est_versions ?? 0), est_bytes: Number(r.est_bytes ?? 0) }));
}

export type HygieneItem = { site_url: string; file_url: string; versions_before: number; versions_deleted: number; bytes: number; status: string; detail: string };

export async function hygieneItems(db: DbConn, runId: string, top = 5000): Promise<HygieneItem[]> {
  try {
    const rows = await readQuery(db, `SELECT TOP (@top) site_url, file_url, versions_before, versions_deleted, bytes, status, detail
      FROM dbo.hygiene_version_items WHERE run_id = @r ORDER BY bytes DESC, id`, { r: runId, top }, 120_000);
    return rows.map((r) => ({
      site_url: String(r.site_url ?? ""), file_url: String(r.file_url ?? ""), versions_before: Number(r.versions_before ?? 0),
      versions_deleted: Number(r.versions_deleted ?? 0), bytes: Number(r.bytes ?? 0), status: String(r.status ?? ""), detail: String(r.detail ?? ""),
    }));
  } catch {
    return []; // banco sem a migração 002 ainda
  }
}

export const ITEM_STATUS: Record<string, string> = {
  simulado: "Simulado", removido: "Removido", sem_excesso: "Sem excesso", protegido: "Protegido (retenção)", erro: "Erro",
  nao_encontrado: "Não encontrado", job_enfileirado: "Job do SharePoint enfileirado",
};

/** Parâmetros guardados na execução (params.hygiene). */
export type HygieneParams = {
  action: "version_cleanup"; keep: number; dryRun: boolean; recycle: boolean; mode: "PorArquivo" | "JobSharePoint";
  scope: "tenant" | "sites"; sites: string[]; sourceExecutionId?: string; maxFiles?: number;
};
export type HygieneResult = {
  run_id: string; acao: string; modo: string; manter_versoes: number; lixeira: boolean; coleta_origem: string; sites: number; arquivos: number;
  arquivos_alterados: number; versoes: number; bytes: number; protegidos: number; erros: number; status: string;
};
