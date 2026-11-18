import { prisma } from "./prisma";
import { randomBytes } from "node:crypto";
import { getSecret, secretName, setSecret } from "./secrets";
import { dbNameFor, ensureAppUser, externalConn, latestTenantVersion, managedConn, provisionTenantDb, type DbConn } from "./tenantDb";

type ClientDbFields = { id: string; slug: string; dbMode: string; dbServer: string | null; dbUser: string | null; dbName: string | null };

/**
 * Conexão com o banco do cliente: gerenciado (servidor dos clientes) ou existente (senha no cofre).
 * Banco gerenciado com usuário próprio (dbUser): usa esse usuário, que só enxerga aquele banco (leitura, escrita e
 * procedures). `admin` só para preparar o banco e aplicar migrações.
 */
export async function clientConn(c: ClientDbFields, opts: { admin?: boolean } = {}): Promise<DbConn> {
  if (c.dbMode === "EXTERNAL") {
    if (!c.dbServer || !c.dbUser || !c.dbName) throw new Error("Conexão do banco existente incompleta (servidor, banco e usuário).");
    const pwd = await getSecret(secretName(c.id, "dbpwd"));
    if (!pwd) throw new Error("Senha do banco existente não encontrada no cofre.");
    return externalConn(c.dbServer, c.dbName, c.dbUser, pwd);
  }
  const base = managedConn(c.dbName ?? dbNameFor(c.slug));
  if (opts.admin || !c.dbUser) return base;
  const pwd = await getSecret(secretName(c.id, "dbapp"));
  if (!pwd) throw new Error("Senha do usuário do banco do cliente não encontrada no cofre.");
  return { ...base, user: c.dbUser, password: pwd };
}

/** Usuário próprio do banco gerenciado (contido no banco): criado uma vez, senha forte no cofre. */
async function ensureManagedAppUser(c: ClientDbFields & { name?: string }, admin: DbConn, log: (m: string) => void) {
  if (c.dbMode === "EXTERNAL") return null;
  const user = c.dbUser ?? `app_${c.slug.replace(/[^a-z0-9]/gi, "").slice(0, 40) || "cliente"}`;
  let pwd = c.dbUser ? await getSecret(secretName(c.id, "dbapp")) : null;
  const created = !pwd;
  if (!pwd) pwd = `${randomBytes(30).toString("base64url")}Aa1!`;
  await ensureAppUser(admin, user, pwd, created);
  if (created) {
    await setSecret(secretName(c.id, "dbapp"), pwd);
    log(`Usuário ${user} criado no banco (só leitura, escrita e procedures deste banco); a senha fica no cofre.`);
  }
  return user;
}

/** Prepara o banco e grava a situação no cliente. Devolve as etapas executadas. */
export async function provisionClientDb(clientId: string) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const steps: string[] = [];
  const dbName = c.dbName ?? dbNameFor(c.slug);
  try {
    const admin = await clientConn({ ...c, dbName }, { admin: true });
    const version = await provisionTenantDb(admin, c.dbSchemaVersion, (m) => steps.push(m));
    let dbUser = c.dbUser;
    if (c.dbMode !== "EXTERNAL") {
      try { dbUser = await ensureManagedAppUser({ ...c, dbName }, admin, (m) => steps.push(m)); }
      catch (e) { steps.push(`Não foi possível criar o usuário próprio do banco (segue com o acesso do servidor): ${e instanceof Error ? e.message : e}`); }
    }
    await prisma.client.update({ where: { id: clientId }, data: { dbName, dbStatus: "PROVISIONADO", dbSchemaVersion: version, dbError: null, ...(c.dbMode !== "EXTERNAL" ? { dbUser } : {}) } });
    try {
      const imp = await importExecutions(clientId);
      if (imp.created) steps.push(`${imp.created} execução(ões) anterior(es) encontrada(s) no banco e trazida(s) para o portal.`);
    } catch (e) {
      steps.push(`Não foi possível importar as execuções anteriores: ${e instanceof Error ? e.message : e}`);
    }
    return { version, steps, dbName };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await prisma.client.update({ where: { id: clientId }, data: { dbName, dbStatus: "ERRO", dbError: m } });
    throw new Error(m);
  }
}

/** Garante banco pronto e schema na última versão antes de uma coleta. */
export async function ensureClientDb(id: string) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id } });
  if (c.dbStatus === "PROVISIONADO" && c.dbSchemaVersion >= (await latestTenantVersion()) && c.dbName) return;
  await provisionClientDb(id);
}

/** Runner das execuções trazidas do banco do cliente (feitas fora do portal, ex.: ct-assessmentspo on-premises). */
export const IMPORTED = "importado";

/**
 * Traz para o portal as execuções que já estão no banco do cliente e não foram disparadas por ele (ex.: assessments
 * rodados antes com o ct-assessmentspo on-premises). O id é o próprio execution_id, então o dashboard abre direto
 * nelas. Fonte: dbo.execution_history e, para versões antigas do coletor que não gravavam histórico,
 * as execuções que só existem em sites_info/files_info (via sp_dash_executions_list).
 * Execuções disparadas pelo portal não são tocadas; as importadas são atualizadas (ex.: on-prem terminou depois).
 */
export async function importExecutions(clientId: string) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (!c.dbName || c.dbStatus !== "PROVISIONADO") return { created: 0, updated: 0 };
  const db = await clientConn(c);
  const { readQuery } = await import("./tenantDb");

  type Ex = { id: string; start: Date | null; end: Date | null; status: string; sites: number | null };
  const found = new Map<string, Ex>();
  try {
    const rows = await readQuery(db, "SELECT execution_id, start_time, end_time, status, total_sites_processed FROM dbo.execution_history");
    for (const r of rows) {
      const id = String(r.execution_id ?? "").trim();
      if (!id) continue;
      found.set(id, {
        id, start: r.start_time ? new Date(r.start_time as string) : null, end: r.end_time ? new Date(r.end_time as string) : null,
        status: String(r.status ?? "").toLowerCase(), sites: r.total_sites_processed == null ? null : Number(r.total_sites_processed),
      });
    }
  } catch { /* banco muito antigo sem execution_history: segue com a lista do dashboard */ }
  try {
    const rows = await readQuery(db, "EXEC dbo.sp_dash_executions_list");
    for (const r of rows) {
      const id = String(r.execution_id ?? "").trim();
      if (!id) continue;
      const prev = found.get(id);
      if (prev) { if (prev.sites == null) prev.sites = Number(r.sites ?? 0); continue; }
      const st = String(r.start_time ?? "");
      found.set(id, { id, start: st ? new Date(`${st.replace(" ", "T")}:00Z`) : null, end: null, status: "completed", sites: Number(r.sites ?? 0) });
    }
  } catch { /* procedure ausente */ }

  let created = 0, updated = 0;
  for (const e of found.values()) {
    if (e.id.length > 64) continue;
    const status = e.status === "completed" ? "COMPLETED" : e.status === "failed" ? "FAILED" : "FAILED";
    const error = e.status === "running" ? "Execução feita fora do portal sem fim registrado (interrompida ou ainda em andamento)." : e.status === "failed" ? "Execução feita fora do portal terminou com falha." : null;
    const data = { status, startedAt: e.start, finishedAt: e.end ?? (status === "COMPLETED" ? e.start : null), totalSites: e.sites, error };
    const existing = await prisma.assessment.findUnique({ where: { id: e.id }, select: { clientId: true, runner: true } });
    if (!existing) {
      await prisma.assessment.create({ data: { id: e.id, clientId, runner: IMPORTED, params: "{}", createdAt: e.start ?? new Date(), ...data } });
      created++;
    } else if (existing.runner === IMPORTED && existing.clientId === clientId) {
      await prisma.assessment.update({ where: { id: e.id }, data });
      updated++;
    }
  }
  return { created, updated };
}
