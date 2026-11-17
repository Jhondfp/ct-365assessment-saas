import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { Provider } from "next-auth/providers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

/**
 * Autenticação mista (mesmo padrão do Target360):
 *  - Microsoft 365 (Entra ID) multi-tenant: entra com a conta corporativa de qualquer tenant (equipe Cloud Target
 *    hoje; parceiros ou clientes no futuro). Só entra quem foi cadastrado ou é de domínio interno — ver gate().
 *  - Login local (e-mail + senha): contingência e pessoas sem conta Microsoft 365. AUTH_LOCAL_LOGIN=true.
 *  - Login de desenvolvimento (só com e-mail): AUTH_DEV_LOGIN=true, ignorado em produção.
 */
const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const ADMIN_EMAILS = list(process.env.ADMIN_EMAILS);
const INTERNAL_DOMAINS = list(process.env.INTERNAL_EMAIL_DOMAINS);
export const DEV_LOGIN = process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
const filled = (v?: string) => !!v && !v.trim().startsWith("<");
export const ENTRA_ENABLED = filled(process.env.AUTH_MICROSOFT_ENTRA_ID_ID) && filled(process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET);
export const LOCAL_LOGIN = process.env.AUTH_LOCAL_LOGIN === "true";
/** organizations = qualquer conta corporativa/escolar (multi-tenant). Pode ser fixado num tenant ou num Entra External ID. */
const ENTRA_ISSUER = filled(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER)
  ? process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!
  : "https://login.microsoftonline.com/organizations/v2.0";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const providers: Provider[] = [];

if (ENTRA_ENABLED) providers.push(
  MicrosoftEntraID({
    issuer: ENTRA_ISSUER,
    authorization: { params: { scope: "openid profile email", prompt: "select_account" } },
    // sem foto: evita estourar o cookie da sessão JWT
    profile(p) {
      return {
        id: p.oid ?? p.sub,
        name: p.name,
        email: String(p.email ?? p.preferred_username ?? "").toLowerCase(),
      };
    },
  }),
);

if (LOCAL_LOGIN) {
  providers.push(
    Credentials({
      id: "local",
      name: "E-mail e senha",
      credentials: { email: { label: "E-mail", type: "email" }, password: { label: "Senha", type: "password" } },
      async authorize(c) {
        const email = String(c?.email ?? "").toLowerCase().trim();
        const password = String(c?.password ?? "");
        if (!email || !password) return null;
        const u = await prisma.user.findUnique({ where: { email } });
        // mesma resposta para usuário inexistente, senha errada ou bloqueio: não revela qual foi
        if (!u || !u.passwordHash || !u.active) return null;
        if (u.lockedUntil && u.lockedUntil > new Date()) return null;
        if (!(await verifyPassword(password, u.passwordHash))) {
          const fails = u.failedLogins + 1;
          await prisma.user.update({
            where: { id: u.id },
            data: { failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : u.lockedUntil },
          });
          return null;
        }
        if (u.failedLogins || u.lockedUntil) await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } });
        return { id: u.id, email: u.email, name: u.name };
      },
    }),
  );
}

if (DEV_LOGIN) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Login de desenvolvimento",
      credentials: { email: { label: "E-mail", type: "email" } },
      async authorize(c) {
        const email = String(c?.email ?? "").toLowerCase().trim();
        if (!email) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  );
}

type Gate = { ok: true } | { ok: false; error: string };

/**
 * Regras de entrada: nesta fase só a equipe Cloud Target acessa. Quem já foi cadastrado pelo administrador entra
 * (se ativo); quem não foi só entra se for de domínio interno (INTERNAL_EMAIL_DOMAINS — fica aguardando perfil)
 * ou estiver em ADMIN_EMAILS (entra como Administrador).
 */
async function gate(email: string, name: string | null | undefined, via: "entra" | "dev", tid?: string, oid?: string): Promise<Gate> {
  const u = await prisma.user.findUnique({ where: { email } });
  if (u) {
    if (!u.active) return { ok: false, error: "inativo" };
    await prisma.user.update({
      where: { id: u.id },
      data: { lastLoginAt: new Date(), name: u.name ?? name, ...(via === "entra" ? { entraOid: oid ?? u.entraOid, entraTenantId: tid ?? u.entraTenantId } : {}) },
    });
    return { ok: true };
  }
  const internal = INTERNAL_DOMAINS.includes(email.split("@")[1] ?? "");
  const admin = ADMIN_EMAILS.includes(email);
  if (!internal && !admin) return { ok: false, error: "convite" };
  await prisma.user.create({
    data: {
      email, name, lastLoginAt: new Date(),
      ...(via === "entra" ? { entraOid: oid, entraTenantId: tid } : {}),
      roleLinks: { create: admin ? [{ role: "ADMIN" }] : [] },
    },
  });
  return { ok: true };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // atrás do proxy do Azure Container Apps o host vem do cabeçalho; AUTH_URL fixa a URL pública
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 10 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      if (account?.provider === "local") {
        // authorize já validou senha e status do usuário
        await prisma.user.update({ where: { email }, data: { lastLoginAt: new Date() } });
        return true;
      }
      const via = account?.provider === "microsoft-entra-id" ? "entra" : "dev";
      const p = (profile ?? {}) as { tid?: string; oid?: string };
      const r = await gate(email, user.name, via, p.tid, p.oid);
      return r.ok ? true : `/login?error=${r.error}`;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const u = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() }, select: { id: true } });
        token.uid = u?.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) (session.user as { id?: string }).id = token.uid as string;
      return session;
    },
  },
});
