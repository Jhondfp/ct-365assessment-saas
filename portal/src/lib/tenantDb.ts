import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sql from "mssql";

/**
 * Banco isolado de cada cliente (modelo silo) no mesmo servidor Azure SQL, de preferência num elastic pool.
 * O schema é o do coletor ct-assessmentspo (portal/sql/tenant), e o job grava nele com o mesmo login SQL.
 */
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

/** Credenciais que o job recebe para gravar no banco do cliente. */
export const tenantSqlForJob = (database: string) => {
  const c = cfg();
  return { server: c.server, port: c.port, database, user: c.user, password: c.password };
};

export const dbNameFor = (slug: string) => `${cfg().prefix}${slug}`.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 120);
const quoteName = (n: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(n)) throw new Error(`Nome de banco inválido: ${n}`);
  return `[${n}]`;
};

const pools = new Map<string, Promise<sql.ConnectionPool>>();

function pool(database: string) {
  let p = pools.get(database);
  if (!p) {
    const c = cfg();
    if (!tenantSqlConfigured()) throw new Error("Servidor dos bancos de clientes não configurado (TENANT_SQL_SERVER/USER/PASSWORD).");
    p = new sql.ConnectionPool({
      server: c.server, port: c.port, user: c.user, password: c.password, database,
      options: { encrypt: true, trustServerCertificate: c.trust, enableArithAbort: true },
      pool: { max: 10, min: 0, idleTimeoutMillis: 60_000 },
      connectionTimeout: 60_000,
      requestTimeout: 120_000,
    }).connect();
    p.catch(() => pools.delete(database));
    pools.set(database, p);
  }
  return p;
}

export type Row = Record<string, unknown>;

/**
 * Leitura para o dashboard. READ UNCOMMITTED como no Start-Monitor.ps1: a coleta grava em files_info/sites_info
 * em paralelo e os SELECTs não podem esperar pelas locks do bulk insert.
 */
export async function readQuery(database: string, query: string, params: Record<string, string | number | null> = {}, timeoutMs = 120_000): Promise<Row[]> {
  const p = await pool(database);
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

/**
 * Cria o banco do cliente (se não existir) e aplica as migrações pendentes do schema do coletor.
 * A 001 é o SCHEMA.sql completo (DROP + CREATE): só roda num banco vazio. Se o banco já tiver o schema
 * (ex.: base de um assessment feito antes com o ct-assessmentspo), é adotado sem apagar nada.
 */
export async function provisionTenantDb(database: string, currentVersion: number, log: (m: string) => void = () => {}) {
  const c = cfg();
  const masterPool = await pool("master");
  const exists = await masterPool.request().input("n", database).query("SELECT 1 AS x FROM sys.databases WHERE name = @n");
  if (!exists.recordset.length) {
    const q = quoteName(database);
    const create = c.pool ? `CREATE DATABASE ${q} (SERVICE_OBJECTIVE = ELASTIC_POOL(name = ${quoteName(c.pool)}))` : `CREATE DATABASE ${q}`;
    log(`Criando o banco ${database}${c.pool ? ` no elastic pool ${c.pool}` : ""}…`);
    await masterPool.request().batch(create);
  }
  await waitOnline(masterPool, database);

  const db = await pool(database);
  let version = currentVersion;
  if (version === 0) {
    const has = await db.request().query("SELECT OBJECT_ID('dbo.execution_history', 'U') AS id");
    if (has.recordset[0]?.id) {
      log("Schema do coletor já existe neste banco: adotado sem recriar.");
      version = 1;
    }
  }
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
