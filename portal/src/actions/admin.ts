"use server";
import { act } from "@/lib/act";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePerm } from "@/lib/session";
import { audit } from "@/lib/audit";
import { b, req, s } from "@/lib/form";
import { isRole } from "@/lib/rbac";
import { hashPassword, passwordProblem } from "@/lib/password";

/** Perfil + clientes liberados (só valem para o Visualizador). */
function readAccess(fd: FormData) {
  const role = s(fd, "role");
  if (!role || !isRole(role)) throw new Error("Escolha o perfil do usuário.");
  const clientIds = role === "VISUALIZADOR" ? [...new Set(fd.getAll("clientIds").map(String).filter(Boolean))] : [];
  return { role, clientIds };
}

async function saveUser_(id: string | null, fd: FormData) {
  const me = await requirePerm("users:manage");
  const { role, clientIds } = readAccess(fd);
  const active = id ? b(fd, "active") : true;
  if (id === me.id && (role !== "ADMIN" || !active)) throw new Error("Você não pode remover o seu próprio perfil de Administrador.");
  const access = { roleLinks: { deleteMany: {}, create: [{ role }] }, clientAccess: { deleteMany: {}, create: clientIds.map((clientId) => ({ clientId })) } };
  let uid = id;
  if (id) {
    const before = await prisma.user.findUniqueOrThrow({ where: { id }, include: { roleLinks: true, clientAccess: true } });
    await prisma.user.update({ where: { id }, data: { name: s(fd, "name"), active, ...access } });
    await audit(prisma, "User", id, "UPDATE", me.id, {
      perfil: [before.roleLinks.map((r) => r.role).join(","), role],
      clientes: [before.clientAccess.map((c) => c.clientId).join(","), clientIds.join(",")],
      ativo: [String(before.active), String(active)],
    });
  } else {
    const email = req(fd, "email", "E-mail").toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
    if (await prisma.user.findUnique({ where: { email } })) throw new Error("Já existe um usuário com este e-mail.");
    const u = await prisma.user.create({ data: { email, name: s(fd, "name"), roleLinks: { create: [{ role }] }, clientAccess: { create: clientIds.map((clientId) => ({ clientId })) } } });
    uid = u.id;
    await audit(prisma, "User", u.id, "INVITE", me.id, { email, perfil: role, clientes: clientIds.join(",") });
  }
  const pw = s(fd, "password");
  if (pw && uid) {
    const p = passwordProblem(pw);
    if (p) throw new Error(p);
    await prisma.user.update({ where: { id: uid }, data: { passwordHash: await hashPassword(pw), mustChangePassword: uid !== me.id, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } });
    await audit(prisma, "User", uid, "PASSWORD", me.id, { senha: "provisória definida pelo administrador" });
  }
  revalidatePath("/admin/usuarios");
  return id ? "Usuário atualizado." : "Usuário cadastrado.";
}

async function removeLocalPassword_(id: string) {
  const me = await requirePerm("users:manage");
  await prisma.user.update({ where: { id }, data: { passwordHash: null, mustChangePassword: false, failedLogins: 0, lockedUntil: null } });
  await audit(prisma, "User", id, "PASSWORD", me.id, { senha: "login local removido" });
  revalidatePath("/admin/usuarios");
  return "Login local removido.";
}

async function createUser_(fd: FormData) { return saveUser_(null, fd); }
async function updateUser_(id: string, fd: FormData) { return saveUser_(id, fd); }

export const createUser = act(createUser_);
export const updateUser = act(updateUser_);
export const removeLocalPassword = act(removeLocalPassword_);
