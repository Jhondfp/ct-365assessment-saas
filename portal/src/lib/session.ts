import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./prisma";
import { can, isRole, type Perm, type Role } from "./rbac";

/** Usuário logado, lido do banco a cada request (mudança de perfil vale na hora). */
export const currentUser = cache(async () => {
  const s = await auth();
  const id = (s?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, active: true, mustChangePassword: true, roleLinks: { select: { role: true } }, clientAccess: { select: { clientId: true } } },
  });
  if (!u) return null;
  const { roleLinks, clientAccess, ...rest } = u;
  return { ...rest, roles: roleLinks.map((r) => r.role).filter(isRole) as Role[], clientIds: clientAccess.map((c) => c.clientId) };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/** Para páginas: exige login, usuário ativo e com perfil. */
export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!u.active) redirect("/login?error=inativo");
  if (u.mustChangePassword) redirect("/minha-conta?obrigatorio=1");
  if (u.roles.length === 0) redirect("/aguardando");
  return u;
}

export async function requirePagePerm(perm: Perm) {
  const u = await requireUser();
  if (!can(u.roles, perm)) redirect("/sem-acesso");
  return u;
}

export async function requirePerm(perm: Perm) {
  const u = await requireUser();
  if (!can(u.roles, perm)) throw new Error("Sem permissão para esta ação.");
  return u;
}

/** Administrador e Executor veem todos os clientes; Visualizador, só os liberados. */
export const canSeeClient = (u: Pick<CurrentUser, "roles" | "clientIds">, clientId: string) => can(u.roles, "clients:all") || u.clientIds.includes(clientId);

/** Filtros Prisma do que o usuário enxerga. */
export const clientWhere = (u: CurrentUser) => (can(u.roles, "clients:all") ? {} : { id: { in: u.clientIds } });
/** Coletas que o usuário enxerga (diagnósticos de conexão ficam fora das listagens: aparecem na aba de conexão). */
export const assessmentWhere = (u: CurrentUser) => ({ kind: "COLETA", ...(can(u.roles, "clients:all") ? {} : { clientId: { in: u.clientIds } }) });

/** Para páginas de um cliente: 404 se o usuário não pode vê-lo (não revela que existe). */
export async function requireClientPage(clientId: string, perm: Perm = "reports:view") {
  const u = await requirePagePerm(perm);
  if (!canSeeClient(u, clientId)) notFound();
  return u;
}

/** Para server actions de um cliente. */
export async function requireClientPerm(clientId: string, perm: Perm) {
  const u = await requirePerm(perm);
  if (!canSeeClient(u, clientId)) throw new Error("Sem acesso a este cliente.");
  return u;
}
