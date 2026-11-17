import { prisma } from "@/lib/prisma";
import { currentUser, canSeeClient } from "@/lib/session";
import { can } from "@/lib/rbac";
import { clientConn } from "@/lib/clientDb";

/** Usuário logado que pode ver o cliente, e a conexão com o banco do cliente. */
export async function clientDbFor(clientId: string) {
  const u = await currentUser();
  if (!u || !u.active || !can(u.roles, "reports:view") || !canSeeClient(u, clientId)) return { err: Response.json({ error: "Sem acesso" }, { status: 403 }) };
  const c = await prisma.client.findUnique({ where: { id: clientId } });
  if (!c || !c.dbName || c.dbStatus !== "PROVISIONADO") return { err: Response.json({ error: "Banco do cliente ainda não provisionado" }, { status: 409 }) };
  try {
    return { db: await clientConn(c), name: c.name };
  } catch (e) {
    return { err: Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }) };
  }
}
