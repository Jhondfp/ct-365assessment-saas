import { readQuery, type Row } from "./tenantDb";

/**
 * Porte para TypeScript das APIs do src/ui/Start-Monitor.ps1 (ct-assessmentspo): mesmo formato de JSON que o
 * dashboard.html consome, lendo as procedures dbo.sp_dash_* do banco do cliente. Cada bloco tem o próprio
 * try/catch, como no original: uma procedure ausente deixa a seção vazia em vez de derrubar o dashboard.
 */
const N = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const S = (v: unknown) => (v == null ? "" : String(v));
const B = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
const D = (v: unknown) => (v == null || v === "" ? "" : new Date(v as string).toISOString().slice(0, 19));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/"/g, "'");

type P = Record<string, string | number | null>;
const exec = (db: string, proc: string, args: P, timeoutMs = 120_000) =>
  readQuery(db, `EXEC dbo.${proc} ${Object.keys(args).map((k) => `@${k} = @${k}`).join(", ")}`, args, timeoutMs);
const one = async (db: string, proc: string, args: P, t?: number) => (await exec(db, proc, args, t))[0] ?? {};

export async function resolveExecutionId(db: string, hint?: string | null) {
  const r = await exec(db, "sp_dash_resolve_execution_id", { execution_id_hint: hint || null });
  return (r[0]?.execution_id as string | undefined) ?? null;
}

const filesSummary = (r: Row) => ({
  total: N(r.total), size_bytes: N(r.size_bytes), versioned_bytes: N(r.versioned_bytes),
  stale_1y: N(r.stale_1y), stale_2y: N(r.stale_2y), stale_3y: N(r.stale_3y), stale_5y: N(r.stale_5y),
  stale_1y_bytes: N(r.stale_1y_bytes), stale_2y_bytes: N(r.stale_2y_bytes), stale_3y_bytes: N(r.stale_3y_bytes), stale_5y_bytes: N(r.stale_5y_bytes),
  preserved: N(r.preserved), total_versions: N(r.total_versions),
});
const sitesSummary = (r: Row) => ({
  total: N(r.total), external_sharing: N(r.external_sharing), teams_connected: N(r.teams_connected), teams_channel: N(r.teams_channel),
  storage_mb: N(r.storage_mb), quota_mb: N(r.quota_mb), subsites: N(r.subsites), doc_items: N(r.doc_items),
});
const fileTypes = (rows: Row[]) => rows.map((r) => ({ type: r.file_type != null ? S(r.file_type) : "sem extensao", count: N(r.cnt), size_bytes: N(r.size_bytes) }));
const fileRows = (rows: Row[]) => rows.map((r) => ({
  file_name: S(r.file_name), file_url: S(r.file_url), site_name: S(r.site_name),
  versions_count: N(r.versions_count), file_size: N(r.file_size), total_file_size: N(r.total_file_size),
}));

async function typeSection(db: string, eid: string, siteType: string, includeTrash: boolean, includeGrowth: boolean) {
  const p = { execution_id: eid, site_type: siteType };
  const s: Record<string, unknown> = {};
  try { s.sites = sitesSummary(await one(db, "sp_dash_sites_summary_by_type", p, 60_000)); } catch { s.sites = { total: 0 }; }
  try { s.files = filesSummary(await one(db, "sp_dash_files_summary_by_type", p)); } catch { s.files = { total: 0 }; }
  try { s.file_types = fileTypes(await exec(db, "sp_dash_file_types_by_type", { ...p, top_n: 30 }, 60_000)); } catch { s.file_types = []; }
  try { s.top_versioned = fileRows(await exec(db, "sp_dash_top_versioned_files", { ...p, top_n: 20 }, 60_000)); } catch { s.top_versioned = []; }
  try {
    const v = await one(db, "sp_dash_version_savings", p, 30_000);
    s.version_savings = { overhead_total_bytes: N(v.overhead_total_bytes), liberado_20v_bytes: N(v.liberado_20v_bytes), liberado_50v_bytes: N(v.liberado_50v_bytes), liberado_100v_bytes: N(v.liberado_100v_bytes) };
  } catch { s.version_savings = { overhead_total_bytes: 0, liberado_20v_bytes: 0, liberado_50v_bytes: 0, liberado_100v_bytes: 0 }; }
  try { s.top_heaviest = fileRows(await exec(db, "sp_dash_top_heaviest_files", { ...p, top_n: 20 }, 60_000)); } catch { s.top_heaviest = []; }
  if (includeTrash) {
    try {
      const t = await one(db, "sp_dash_trash_summary_by_type", p, 60_000);
      s.trash = { total: N(t.total_items), size_bytes: N(t.size_bytes), first_stage: N(t.first_stage), second_stage: N(t.second_stage) };
    } catch { s.trash = { total: 0, size_bytes: 0 }; }
  }
  if (includeGrowth) {
    try {
      s.growth_monthly = (await exec(db, "sp_dash_growth_monthly", p)).map((r) => ({
        year: N(r.year), month: N(r.month), files_created: N(r.files_created), bytes_created_gb: N(r.bytes_created_gb), acumulado_gb: N(r.acumulado_gb),
      }));
    } catch { s.growth_monthly = []; }
  }
  try {
    s.orphaned_sites = (await exec(db, "sp_dash_orphaned_sites", { ...p, top_n: 50 }, 30_000)).map((r) => ({
      title: S(r.site_title), url: S(r.site_url), storage_bytes: N(r.storage_bytes), total_owners: N(r.total_owners),
    }));
  } catch { s.orphaned_sites = []; }
  return s;
}

/** /api/dashboard do Start-Monitor.ps1 */
export async function dashboardJson(db: string, executionId?: string | null) {
  const eid = executionId || (await resolveExecutionId(db));
  if (!eid) return { error: "Nenhuma execucao encontrada no banco" };
  const p = { execution_id: eid };
  const out: Record<string, unknown> = { execution_id: eid };

  try { out.sites = sitesSummary(await one(db, "sp_dash_sites_summary", p)); } catch { out.sites = { total: 0 }; }
  try { out.files = filesSummary(await one(db, "sp_dash_files_summary", p)); } catch (e) { out.files = { total: 0 }; out.files_error = msg(e); }
  try { out.file_types = fileTypes(await exec(db, "sp_dash_file_types", { ...p, top_n: 30 })); } catch (e) { out.file_types = []; out.file_types_error = msg(e); }
  try {
    out.critical_sites = (await exec(db, "sp_dash_critical_sites", p)).map((r) => ({
      title: S(r.site_title), url: S(r.site_url), capability: S(r.sharing_capability), storage_bytes: N(r.storage_bytes),
    }));
  } catch { out.critical_sites = []; }
  try {
    out.all_sites = (await exec(db, "sp_dash_all_sites", { ...p, top_n: 500 }, 60_000)).map((r) => ({
      title: S(r.title), url: S(r.url), site_type: S(r.site_type), external_sharing: B(r.external_sharing),
      capability: S(r.sharing_capability), total_files: N(r.total_files), size_bytes: N(r.size_bytes),
    }));
  } catch (e) { out.all_sites = []; out.all_sites_error = msg(e); }
  try {
    const t = await one(db, "sp_dash_trash_summary", p);
    out.trash = { total: N(t.total_items), size_bytes: N(t.size_bytes), first_stage: N(t.first_stage), second_stage: N(t.second_stage) };
  } catch { out.trash = { total: 0, size_bytes: 0 }; }
  try {
    out.duplicates = (await exec(db, "sp_dash_duplicate_candidates", { ...p, top_n: 20 }, 60_000)).map((r) => ({
      sample_file_name: S(r.sample_file_name), file_type: S(r.file_type), copy_count: N(r.copy_count), distinct_sites: N(r.distinct_sites), wasted_bytes: N(r.wasted_bytes),
    }));
  } catch { out.duplicates = []; }

  // Intune
  try {
    const r = await one(db, "sp_dash_intune_summary", p, 30_000);
    out.intune = {
      total: N(r.total), compliant: N(r.compliant), non_compliant: N(r.non_compliant), encrypted: N(r.encrypted), not_encrypted: N(r.not_encrypted),
      jailbroken: N(r.jailbroken), antivirus_issue: N(r.antivirus_issue), at_risk: N(r.at_risk), stale_30d: N(r.stale_30d),
    };
  } catch { out.intune = { total: 0 }; }
  try {
    out.intune_by_os = (await exec(db, "sp_dash_intune_by_os", p, 30_000)).map((r) => ({ os_type: S(r.os_type), total: N(r.total), compliant: N(r.compliant), encrypted: N(r.encrypted) }));
  } catch { out.intune_by_os = []; }
  try {
    out.intune_by_ownertype = (await exec(db, "sp_dash_intune_by_ownertype", p, 30_000)).map((r) => ({ owner_type: S(r.owner_type), total: N(r.total), compliant: N(r.compliant), encrypted: N(r.encrypted) }));
  } catch { out.intune_by_ownertype = []; }
  try {
    out.intune_compliance_failures = (await exec(db, "sp_dash_intune_compliance_failures", { ...p, top_n: 20 }, 30_000)).map((r) => ({
      policy_name: S(r.policy_name), platform_type: S(r.platform_type), device_count: N(r.device_count),
    }));
  } catch { out.intune_compliance_failures = []; }
  try {
    out.intune_devices = (await exec(db, "sp_dash_intune_devices", { ...p, top_n: 2000 }, 60_000)).map((r) => ({
      device_name: S(r.device_name), owner_name: S(r.owner_name), owner_email: S(r.owner_email), os_type: S(r.os_type), os_version: S(r.os_version),
      device_type: S(r.device_type), compliance_status: S(r.compliance_status), is_encrypted: B(r.is_encrypted), is_jailbroken: B(r.is_jailbroken),
      antivirus_status: S(r.antivirus_status), has_risk: B(r.has_risk), last_checkin_date: D(r.last_checkin_date), model: S(r.model),
      manufacturer: S(r.manufacturer), owner_type: S(r.owner_type), enrollment_type: S(r.enrollment_type),
    }));
  } catch { out.intune_devices = []; }

  // Licenciamento
  try {
    const r = await one(db, "sp_dash_licensing_summary", p, 30_000);
    out.licensing = {
      total_skus: N(r.total_skus), total_licenses: N(r.total_licenses), used_licenses: N(r.used_licenses),
      available_licenses: N(r.available_licenses), low_utilization_skus: N(r.low_utilization_skus), fully_used_skus: N(r.fully_used_skus),
    };
  } catch { out.licensing = { total_skus: 0 }; }
  try {
    out.licensing_by_sku = (await exec(db, "sp_dash_licensing_by_sku", p, 30_000)).map((r) => ({
      friendly_name: S(r.friendly_name), sku_part_number: S(r.sku_part_number), total_licenses: N(r.total_licenses),
      used_licenses: N(r.used_licenses), available_licenses: N(r.available_licenses), utilization_pct: N(r.utilization_pct),
    }));
  } catch { out.licensing_by_sku = []; }

  // Adoção
  try {
    out.adoption_by_service = (await exec(db, "sp_dash_adoption_by_service", p, 30_000)).map((r) => ({
      service: S(r.service), licensed_users: N(r.licensed_users), active_users: N(r.active_users), inactive_users: N(r.inactive_users),
    }));
  } catch { out.adoption_by_service = []; }
  try {
    out.adoption_inactive_users = (await exec(db, "sp_dash_adoption_inactive_users", { ...p, top_n_per_service: 15 }, 30_000)).map((r) => ({
      service: S(r.service), user_principal_name: S(r.user_principal_name), last_activity_date: D(r.last_activity_date),
    }));
  } catch { out.adoption_inactive_users = []; }

  // Exchange
  try {
    const r = await one(db, "sp_dash_mailbox_summary", p, 30_000);
    out.mailbox = { total: N(r.total), storage_total_bytes: N(r.storage_total_bytes), storage_avg_bytes: N(r.storage_avg_bytes), with_archive: N(r.with_archive), near_quota: N(r.near_quota) };
  } catch { out.mailbox = { total: 0 }; }
  try {
    out.mailbox_list = (await exec(db, "sp_dash_mailbox_list", { ...p, top_n: 2000 }, 60_000)).map((r) => ({
      user_principal_name: S(r.user_principal_name), display_name: S(r.display_name), item_count: N(r.item_count),
      storage_used_bytes: N(r.storage_used_bytes), quota_bytes: N(r.quota_bytes), quota_pct: N(r.quota_pct),
      has_archive: B(r.has_archive), last_activity_date: D(r.last_activity_date),
    }));
  } catch { out.mailbox_list = []; }

  out.sharepoint = await typeSection(db, eid, "SharePoint", true, true);
  out.onedrive = await typeSection(db, eid, "OneDrive", false, false);
  return out;
}

/** /api/executions do Start-Monitor.ps1 (o nome do cliente vem do portal, não do banco). */
export async function executionsJson(db: string, clientName: string) {
  try {
    const r = await exec(db, "sp_dash_executions_list", {}, 60_000);
    return r.map((x) => ({ execution_id: S(x.execution_id), client_name: clientName, start_time: S(x.start_time), sites: N(x.sites), files: N(x.files), status: S(x.status) }));
  } catch {
    return [];
  }
}
