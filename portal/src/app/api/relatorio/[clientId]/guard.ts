import { prisma } from "@/lib/prisma";
import { currentUser, canSeeClient } from "@/lib/session";
import { can } from "@/lib/rbac";

/** Usuário logado que pode ver o cliente, e o banco do cliente. */
export async function clientDbFor(clientId: string) {
  const u = await currentUser();
  if (!u || !u.active || !can(u.roles, "reports:view") || !canSeeClient(u, clientId)) return { err: Response.json({ error: "Sem acesso" }, { status: 403 }) };
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, dbName: true, dbStatus: true } });
  if (!c || !c.dbName || c.dbStatus !== "PROVISIONADO") return { err: Response.json({ error: "Banco do cliente ainda não provisionado" }, { status: 409 }) };
  return { db: c.dbName, name: c.name };
}
