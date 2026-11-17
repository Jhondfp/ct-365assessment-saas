"use server";
import { act } from "@/lib/act";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { req } from "@/lib/form";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

/** O próprio usuário troca a senha do login local. */
async function changeOwnPassword_(fd: FormData) {
  const me = await currentUser();
  if (!me) redirect("/login");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  const current = String(fd.get("current") ?? "");
  const next = req(fd, "password", "Nova senha");
  if (next !== String(fd.get("confirm") ?? "")) throw new Error("A confirmação não confere com a nova senha.");
  const problem = passwordProblem(next);
  if (problem) throw new Error(problem);
  if (u.passwordHash && !(await verifyPassword(current, u.passwordHash))) throw new Error("Senha atual incorreta.");
  if (u.passwordHash && (await verifyPassword(next, u.passwordHash))) throw new Error("A nova senha precisa ser diferente da atual.");
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
  });
  await audit(prisma, "User", u.id, "PASSWORD", u.id, { senha: "alterada pelo próprio usuário" });
  if (u.mustChangePassword) redirect("/");
  return "Senha alterada.";
}

export const changeOwnPassword = act(changeOwnPassword_);
