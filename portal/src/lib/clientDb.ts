import { prisma } from "./prisma";
import { getSecret, secretName } from "./secrets";
import { dbNameFor, externalConn, latestTenantVersion, managedConn, provisionTenantDb, type DbConn } from "./tenantDb";

type ClientDbFields = { id: string; slug: string; dbMode: string; dbServer: string | null; dbUser: string | null; dbName: string | null };

/** Conexão com o banco do cliente: gerenciado (servidor dos clientes) ou existente (senha no cofre). */
export async function clientConn(c: ClientDbFields): Promise<DbConn> {
  if (c.dbMode === "EXTERNAL") {
    if (!c.dbServer || !c.dbUser || !c.dbName) throw new Error("Conexão do banco existente incompleta (servidor, banco e usuário).");
    const pwd = await getSecret(secretName(c.id, "dbpwd"));
    if (!pwd) throw new Error("Senha do banco existente não encontrada no cofre.");
    return externalConn(c.dbServer, c.dbName, c.dbUser, pwd);
  }
  return managedConn(c.dbName ?? dbNameFor(c.slug));
}

/** Prepara o banco e grava a situação no cliente. Devolve as etapas executadas. */
export async function provisionClientDb(clientId: string) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const steps: string[] = [];
  const dbName = c.dbName ?? dbNameFor(c.slug);
  try {
    const version = await provisionTenantDb(await clientConn({ ...c, dbName }), c.dbSchemaVersion, (m) => steps.push(m));
    await prisma.client.update({ where: { id: clientId }, data: { dbName, dbStatus: "PROVISIONADO", dbSchemaVersion: version, dbError: null } });
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
