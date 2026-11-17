// Cria ou atualiza o administrador inicial com login local (e-mail + senha).
// Uso: BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... node scripts/bootstrap-admin.mjs
// Sem as variáveis, não faz nada (seguro para rodar a cada inicialização).
// A senha só é gravada se o usuário ainda não tiver senha, ou com BOOTSTRAP_ADMIN_RESET=true.
import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
if (!email || !password) process.exit(0);

if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error("[bootstrap-admin] senha fraca: use 10+ caracteres com letras e números. Nada foi alterado.");
  process.exit(0);
}

// mesmo formato de src/lib/password.ts
function hash(pw) {
  const salt = randomBytes(16);
  const h = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${h.toString("base64")}`;
}

const prisma = new PrismaClient();
try {
  const existing = await prisma.user.findUnique({ where: { email }, include: { roleLinks: true } });
  // aceita true/True/TRUE/1/sim/yes (com ou sem espaços)
  const reset = ["true", "1", "sim", "yes"].includes((process.env.BOOTSTRAP_ADMIN_RESET ?? "").trim().toLowerCase());
  const pw = !existing?.passwordHash || reset
    ? { passwordHash: hash(password), passwordChangedAt: new Date(), mustChangePassword: false, failedLogins: 0, lockedUntil: null }
    : {};
  if (existing) {
    const hasAdmin = existing.roleLinks.some((r) => r.role === "ADMIN");
    await prisma.user.update({ where: { id: existing.id }, data: { active: true, ...pw, ...(hasAdmin ? {} : { roleLinks: { create: [{ role: "ADMIN" }] } }) } });
  } else {
    await prisma.user.create({ data: { email, name: process.env.BOOTSTRAP_ADMIN_NAME ?? "Administrador", roleLinks: { create: [{ role: "ADMIN" }] }, ...pw } });
  }
  console.log(`[bootstrap-admin] ${email}: papel ADMIN garantido${Object.keys(pw).length ? ", senha definida" : " (senha existente mantida)"}.`);
} finally {
  await prisma.$disconnect();
}
