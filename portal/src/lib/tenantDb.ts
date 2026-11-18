import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sql from "mssql";

/**
 * Banco isolado de cada cliente (modelo silo), com o schema do coletor ct-assessmentspo (portal/sql/tenant).
 * Dois modos (Client.dbMode):
 *  - MANAGED:  o portal cria o banco no servidor dos clientes (TENANT_SQL_*), de preferência num elastic pool.
 *  - EXTERNAL: banco já existente em qualquer SQL Server/Azure SQL (ex.: base de um assessment feito antes com o
 *              ct-assessmentspo). Servidor, banco e usuário ficam no cliente; a senha, no cofre.
 * O job grava no banco do cliente com a mesma conexão (o coletor usa sempre a porta 1433).
 */
export type DbConn = { server: string; port: number; user: string; password: string; database: string; trust: boolean; managed: boolean };

const cfg = () => ({
  server: process.env.TENANT_SQL_SERVER ?? "",
  port: Number(process.env.TENANT_SQL_PORT ?? 1433),
  user: process.env.TENANT_SQL_USER ?? "",
  password: process.env.TENANT_SQL_PASSWORD ?? "",
  pool: process.env.TENANT_SQL_ELASTIC_POOL?.trim() || null,
  trust: process.env.TENANT_SQL_TRUST_CERT === "true",
  prefix: process.env.TENANT_DB_PREFIX ?? "ctassess_",
});

export const tenantSqlConfigured = () => {
  const c = cfg();
  return !!(c.server && c.user && c.password);
};

/** Conexão de um banco gerenciado (servidor dos clientes). */
export function managedConn(database: string): DbConn {
  const c = cfg();
  if (!tenantSqlConfigured()) throw new Error("Servidor dos bancos de clientes não configurado (TENANT_SQL_SERVER/USER/PASSWORD).");
  return { server: c.server, port: c.port, user: c.user, password: c.password, database, trust: c.trust, managed: true };
}

/** Conexão de um banco existente informado no cadastro do cliente. */
export const externalConn = (server: string, database: string, user: string, password: string): DbConn => ({
  // Azure SQL tem certificado válido; SQL Server on-premises com certificado autoassinado exige EXTERNAL_SQL_TRUST_CERT=true
  server: normalizeServer(server), port: 1433, user, password, database, trust: process.env.EXTERNAL_SQL_TRUST_CERT === "true", managed: false,
});

/** Aceita "srv.database.windows.net", "tcp:srv.database.windows.net,1433" ou "srv,1433". */
export const normalizeServer = (v: string) => v.trim().replace(/^tcp:/i, "").replace(/,\s*1433$/, "").replace(/:1433$/, "").toLowerCase();

export const dbNameFor = (slug: string) => `${cfg().prefix}${slug}`.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 120);
const quoteName = (n: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(n)) throw new Error(`Nome de banco inválido: ${n}`);
  return `[${n}]`;
};

const pools = new Map<string, Promise<sql.ConnectionPool>>();

function pool(c: DbConn) {
  // a senha entra na chave (hash): trocar a senha de um banco externo abre um pool novo
  const key = `${c.server}|${c.port}|${c.user}|${c.database}|${createHash("sha256").update(c.password).digest("hex").slice(0, 12)}`;
  let p = pools.get(key);
  if (!p) {
    p = new sql.ConnectionPool({
      server: c.server, port: c.port, user: c.user, password: c.password, database: c.database,
      options: { encrypt: true, trustServerCertificate: c.trust, enableArithAbort: true },
      pool: { max: 10, min: 0, idleTimeoutMillis: 60_000 },
      connectionTimeout: 60_000,
      requestTimeout: 120_000,
    }).connect();
    p.catch(() => pools.delete(key));
    pools.set(key, p);
  }
  return p;
}

export type Row = Record<string, unknown>;

/**
 * Leitura para o dashboard. READ UNCOMMITTED como no Start-Monitor.ps1: a coleta grava em files_info/sites_info
 * em paralelo e os SELECTs não podem esperar pelas locks do bulk insert.
 */
export async function readQuery(db: DbConn, query: string, params: Record<string, string | number | null> = {}, timeoutMs = 120_000): Promise<Row[]> {
  const p = await pool(db);
  const r = p.request();
  (r as unknown as { timeout: number }).timeout = timeoutMs;
  for (const [k, v] of Object.entries(params)) r.input(k, v);
  const res = await r.query(`SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; ${query}`);
  return (res.recordset ?? []) as Row[];
}

/** Separa um script T-SQL nos lotes delimitados por GO (como o SSMS/sqlcmd). */
export function splitBatches(script: string) {
  return script.replace(/^﻿/, "").split(/^\s*GO\s*;?\s*$/im).map((b) => b.trim()).filter((b) => b.replace(/--[^\n]*/g, "").trim() !== "");
}

const SQL_DIR = path.join(process.cwd(), "sql", "tenant");

export async function tenantMigrations() {
  const files = (await readdir(SQL_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  return files.map((f) => ({ version: Number(f.split("_")[0]), file: f }));
}
export const latestTenantVersion = async () => Math.max(0, ...(await tenantMigrations()).map((m) => m.version));

async function waitOnline(master: sql.ConnectionPool, name: string) {
  for (let i = 0; i < 60; i++) {
    const r = await master.request().input("n", name).query("SELECT state_desc FROM sys.databases WHERE name = @n");
    if (r.recordset[0]?.state_desc === "ONLINE") return;
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error(`O banco ${name} não ficou ONLINE em 5 minutos.`);
}

/** Situação de um banco: conecta e diz se já tem o schema do coletor, se está vazio e quantas coletas guarda. */
export async function inspectDb(c: DbConn) {
  let db: sql.ConnectionPool;
  try {
    db = await pool(c);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`Não foi possível conectar em ${c.server}/${c.database}: ${m}${c.managed ? "" : " — confira servidor, banco, usuário e senha e se o firewall do servidor libera os serviços do Azure."}`);
  }
  const r = await db.request().query(`
    SELECT OBJECT_ID('dbo.execution_history', 'U') AS hist,
           (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped = 0) AS tables`);
  const hasSchema = !!r.recordset[0]?.hist;
  let executions = 0;
  if (hasSchema) executions = Number((await db.request().query("SELECT COUNT(*) AS n FROM dbo.execution_history")).recordset[0]?.n ?? 0);
  return { hasSchema, empty: Number(r.recordset[0]?.tables ?? 0) === 0, executions };
}

/**
 * Prepara o banco do cliente e aplica as migrações pendentes do schema do coletor.
 * - MANAGED: cria o banco (se não existir) no servidor dos clientes.
 * - EXTERNAL: o banco tem que existir; só conecta.
 * A 001 é o SCHEMA.sql completo (DROP + CREATE): só roda num banco VAZIO. Banco que já tem o schema é adotado sem
 * apagar nada; banco com outras tabelas e sem o schema é recusado (nunca roda o DROP em cima de dados de terceiros).
 */
export async function provisionTenantDb(c: DbConn, currentVersion: number, log: (m: string) => void = () => {}) {
  if (c.managed) {
    const master = await pool({ ...c, database: "master" });
    const exists = await master.request().input("n", c.database).query("SELECT 1 AS x FROM sys.databases WHERE name = @n");
    if (!exists.recordset.length) {
      const ep = cfg().pool;
      const q = quoteName(c.database);
      log(`Criando o banco ${c.database}${ep ? ` no elastic pool ${ep}` : ""}…`);
      await master.request().batch(ep ? `CREATE DATABASE ${q} (SERVICE_OBJECTIVE = ELASTIC_POOL(name = ${quoteName(ep)}))` : `CREATE DATABASE ${q}`);
    }
    await waitOnline(master, c.database);
  }

  const st = await inspectDb(c);
  let version = currentVersion;
  if (version === 0 && st.hasSchema) {
    log(`Schema do coletor encontrado (${st.executions} coleta(s) gravada(s)): banco aproveitado sem apagar dados.`);
    version = 1;
  }
  if (version === 0 && !st.empty) {
    throw new Error(`O banco ${c.database} já tem tabelas e não tem o schema do coletor. Use um banco vazio ou um banco de assessment do ct-assessmentspo.`);
  }
  const db = await pool(c);
  for (const m of await tenantMigrations()) {
    if (m.version <= version) continue;
    log(`Aplicando ${m.file}…`);
    const script = await readFile(path.join(SQL_DIR, m.file), "utf8");
    for (const batch of splitBatches(script)) {
      const r = db.request();
      (r as unknown as { timeout: number }).timeout = 600_000;
      await r.batch(batch);
    }
    version = m.version;
  }
  return version;
}

/**
 * Usuário contido no banco do cliente (Azure SQL): entra só nesse banco, com leitura, escrita e EXECUTE nas
 * procedures — sem DDL nem acesso ao servidor. `reset` troca a senha de um usuário que já exista.
 */
export async function ensureAppUser(admin: DbConn, user: string, password: string, reset: boolean) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(user)) throw new Error("Nome de usuário inválido.");
  const db = await pool(admin);
  const q = quoteName(user);
  const exists = (await db.request().input("u", user).query("SELECT 1 AS x FROM sys.database_principals WHERE name = @u")).recordset.length > 0;
  const pwdLit = password.replace(/'/g, "''");
  if (!exists) {
    try { await db.request().batch(`CREATE USER ${q} WITH PASSWORD = N'${pwdLit}'`); }
    catch (e) {
      // SQL Server fora do Azure: usuário com senha exige banco "contido" (o Azure SQL já é)
      if (!String((e as Error).message).includes("contained database")) throw e;
      await db.request().batch("ALTER DATABASE CURRENT SET CONTAINMENT = PARTIAL");
      await db.request().batch(`CREATE USER ${q} WITH PASSWORD = N'${pwdLit}'`);
    }
  }
  else if (reset) await db.request().batch(`ALTER USER ${q} WITH PASSWORD = N'${pwdLit}'`);
  await db.request().batch(`ALTER ROLE db_datareader ADD MEMBER ${q}; ALTER ROLE db_datawriter ADD MEMBER ${q}; GRANT EXECUTE TO ${q};`);
}
