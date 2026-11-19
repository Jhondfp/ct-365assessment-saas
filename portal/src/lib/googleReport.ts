import { cache } from "react";
import { prisma } from "./prisma";
import { clientConn } from "./clientDb";
import { readQuery, type Row } from "./tenantDb";

/**
 * Levantamento Google Workspace → Microsoft 365: lê as tabelas g_* do banco do cliente (job/google) e aplica as
 * regras de migração (licença sugerida por usuário, ondas por unidade organizacional, pontos de atenção).
 * As regras são sugestões para dimensionar a proposta, não substituem a análise de requisitos.
 */
const N = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const B = (v: unknown) => v === true || v === 1 || v === "1";
const D = (v: unknown) => (v ? new Date(v as string) : null);

export type GUser = {
  email: string; name: string; ou: string; suspended: boolean; archived: boolean; admin: boolean; twoSv: boolean;
  lastLogin: Date | null; aliases: number; gmailMB: number; driveMB: number; photosMB: number;
  gmailLast: Date | null; driveLast: Date | null; external: number; anyone: number; license: string | null;
};
export type Plan = "Sem licença (avaliar)" | "Microsoft 365 F3" | "Microsoft 365 Business Basic" | "Office 365 E1" | "Microsoft 365 Business Standard" | "Microsoft 365 E3";
export type PlanReason = { plan: Plan; reason: string };

export const PLAN_ORDER: Plan[] = ["Microsoft 365 E3", "Microsoft 365 Business Standard", "Office 365 E1", "Microsoft 365 Business Basic", "Microsoft 365 F3", "Sem licença (avaliar)"];

/**
 * Plano sugerido pelo uso real (30 dias antes do relatório): inativo/suspenso → avaliar; caixa > 50 GB → E3 (100 GB +
 * arquivo morto); usa Drive → Standard (até 300 usuários) ou E3; só e-mail pequeno → F3; só e-mail → Basic/E1.
 */
export function suggestPlan(u: GUser, ref: Date, bigTenant: boolean): PlanReason {
  const days = (d: Date | null) => (d ? (ref.getTime() - d.getTime()) / 86_400_000 : Infinity);
  if (u.suspended || u.archived) return { plan: "Sem licença (avaliar)", reason: u.archived ? "conta arquivada" : "conta suspensa" };
  if (days(u.lastLogin) > 90 && days(u.gmailLast) > 90) return { plan: "Sem licença (avaliar)", reason: "sem login nem e-mail há mais de 90 dias" };
  if (u.gmailMB > 50 * 1024) return { plan: "Microsoft 365 E3", reason: "caixa acima de 50 GB (E3 tem 100 GB + arquivo morto)" };
  const usesDrive = days(u.driveLast) <= 30 || u.driveMB > 1024;
  if (usesDrive) return bigTenant ? { plan: "Microsoft 365 E3", reason: "usa Drive; mais de 300 usuários (sem plano Business)" } : { plan: "Microsoft 365 Business Standard", reason: "usa Drive (arquivos e colaboração)" };
  if (u.gmailMB < 2 * 1024) return { plan: "Microsoft 365 F3", reason: "só e-mail, caixa abaixo de 2 GB" };
  return bigTenant ? { plan: "Office 365 E1", reason: "só e-mail; mais de 300 usuários" } : { plan: "Microsoft 365 Business Basic", reason: "só e-mail" };
}

export type Wave = { name: string; ous: string[]; users: number; gb: number };

/** Ondas por unidade organizacional (1º nível), empacotadas até ~150 usuários ou ~1,5 TB por onda. */
export function suggestWaves(users: GUser[], maxUsers = 150, maxGB = 1536): Wave[] {
  const byOu = new Map<string, { users: number; gb: number }>();
  for (const u of users) {
    if (u.suspended || u.archived) continue;
    const top = "/" + (u.ou.split("/").filter(Boolean)[0] ?? "");
    const v = byOu.get(top) ?? { users: 0, gb: 0 };
    v.users++; v.gb += (u.gmailMB + u.driveMB) / 1024; byOu.set(top, v);
  }
  const ous = [...byOu.entries()].sort((a, b) => a[1].users - b[1].users);
  const waves: Wave[] = [];
  let cur: Wave | null = null;
  for (const [ou, v] of ous) {
    if (!cur || (cur.users + v.users > maxUsers && cur.users > 0) || (cur.gb + v.gb > maxGB && cur.users > 0)) {
      cur = { name: `Onda ${waves.length + 1}`, ous: [], users: 0, gb: 0 }; waves.push(cur);
    }
    cur.ous.push(ou === "/" ? "/ (raiz)" : ou); cur.users += v.users; cur.gb += v.gb;
  }
  return waves;
}

export const googleData = cache(async (clientId: string, executionId: string) => {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const db = await clientConn(c);
  const p = { e: executionId };
  const q = async (sql: string) => { try { return await readQuery(db, sql, p, 120_000); } catch { return [] as Row[]; } };
  const [users, groups, domains, ous, licenses, resources, devices] = await Promise.all([
    q(`SELECT u.*, (SELECT TOP 1 l.sku_name FROM dbo.g_licenses l WHERE l.execution_id = u.execution_id AND l.user_email = u.primary_email) AS sku
       FROM dbo.g_users u WHERE u.execution_id = @e`),
    q("SELECT email, name, direct_members, aliases_count FROM dbo.g_groups WHERE execution_id = @e"),
    q("SELECT domain_name, is_primary, verified, is_alias, parent_domain FROM dbo.g_domains WHERE execution_id = @e"),
    q("SELECT org_unit_path, name FROM dbo.g_orgunits WHERE execution_id = @e"),
    q("SELECT sku_name, COUNT(*) AS n FROM dbo.g_licenses WHERE execution_id = @e GROUP BY sku_name ORDER BY n DESC"),
    q("SELECT resource_email, name, category, capacity FROM dbo.g_resources WHERE execution_id = @e"),
    q("SELECT device_kind, model, os, owner_email, status, last_sync FROM dbo.g_devices WHERE execution_id = @e"),
  ]);
  const us: GUser[] = users.map((r) => ({
    email: String(r.primary_email), name: String(r.full_name ?? ""), ou: String(r.org_unit_path ?? "/"), suspended: B(r.suspended), archived: B(r.archived),
    admin: B(r.is_admin) || B(r.is_delegated_admin), twoSv: B(r.is_2sv_enrolled), lastLogin: D(r.last_login), aliases: N(r.aliases_count),
    gmailMB: N(r.gmail_mb), driveMB: N(r.drive_mb), photosMB: N(r.photos_mb), gmailLast: D(r.gmail_last_activity), driveLast: D(r.drive_last_activity),
    external: N(r.drive_items_external), anyone: N(r.drive_items_anyone_link), license: r.sku ? String(r.sku) : null,
  }));
  const reportDate = users.map((r) => D(r.report_date)).find(Boolean) ?? new Date();
  const active = us.filter((u) => !u.suspended && !u.archived);
  const bigTenant = active.length > 300;
  const plans = us.map((u) => ({ ...u, ...suggestPlan(u, reportDate, bigTenant) }));
  return {
    reportDate, users: plans, active: active.length, bigTenant,
    groups: groups.map((g) => ({ email: String(g.email), name: String(g.name ?? ""), members: N(g.direct_members), aliases: N(g.aliases_count) })),
    domains: domains.map((d) => ({ name: String(d.domain_name), primary: B(d.is_primary), verified: B(d.verified), alias: B(d.is_alias), parent: d.parent_domain ? String(d.parent_domain) : null })),
    ous: ous.map((o) => String(o.org_unit_path)),
    licenses: licenses.map((l) => ({ sku: String(l.sku_name ?? "—"), n: N(l.n) })),
    resources: resources.map((r) => ({ email: String(r.resource_email ?? ""), name: String(r.name ?? ""), category: String(r.category ?? ""), capacity: N(r.capacity) })),
    devices: devices.map((d) => ({ kind: String(d.device_kind), model: String(d.model ?? ""), os: String(d.os ?? ""), owner: String(d.owner_email ?? ""), status: String(d.status ?? ""), lastSync: D(d.last_sync) })),
    waves: suggestWaves(us),
  };
});
export type GoogleData = Awaited<ReturnType<typeof googleData>>;

/** Resumo para o Archie (escopo/proposta): volumes, contagens, licenças sugeridas, ondas e pontos de atenção. */
export function googleExport(clientName: string, d: GoogleData) {
  const sum = (f: (u: GoogleData["users"][number]) => number) => d.users.reduce((a, u) => a + f(u), 0);
  const plans: Record<string, number> = {};
  for (const u of d.users) plans[u.plan] = (plans[u.plan] ?? 0) + 1;
  return {
    origem: "CT Assessment 365 · levantamento Google Workspace", cliente: clientName, data_relatorio_uso: d.reportDate.toISOString().slice(0, 10),
    ambiente_atual: "Google Workspace", destino: "Microsoft 365",
    usuarios: { total: d.users.length, ativos: d.active, suspensos_ou_arquivados: d.users.filter((u) => u.suspended || u.archived).length, admins: d.users.filter((u) => u.admin).length, sem_2_etapas: d.users.filter((u) => !u.twoSv && !u.suspended).length },
    dominios: d.domains.map((x) => ({ dominio: x.name, principal: x.primary, alias: x.alias })),
    grupos: d.groups.length, unidades_organizacionais: d.ous.length, salas_e_recursos: d.resources.length, dispositivos: d.devices.length,
    volumes_gb: { email: +(sum((u) => u.gmailMB) / 1024).toFixed(1), drive: +(sum((u) => u.driveMB) / 1024).toFixed(1), fotos: +(sum((u) => u.photosMB) / 1024).toFixed(1) },
    caixas_acima_50gb: d.users.filter((u) => u.gmailMB > 50 * 1024).length, caixas_acima_100gb: d.users.filter((u) => u.gmailMB > 100 * 1024).length,
    compartilhamento_externo: { usuarios_com_itens_externos: d.users.filter((u) => u.external > 0).length, itens_externos: sum((u) => u.external), itens_qualquer_pessoa_com_link: sum((u) => u.anyone) },
    licencas_google: d.licenses, licencas_m365_sugeridas: plans,
    ondas: d.waves.map((w) => ({ onda: w.name, unidades: w.ous, usuarios: w.users, volume_gb: +w.gb.toFixed(1) })),
  };
}
