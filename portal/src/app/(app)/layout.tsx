import { signOut, LOCAL_LOGIN } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { assessmentWhere, requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can, ROLE_LABEL } from "@/lib/rbac";
import { ACTIVE } from "@/lib/status";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const [ativas, higAtivas] = await Promise.all([
    prisma.assessment.count({ where: { status: { in: [...ACTIVE] }, ...assessmentWhere(u) } }),
    prisma.assessment.count({ where: { status: { in: [...ACTIVE] }, ...assessmentWhere(u), kind: "HIGIENIZACAO" } }),
  ]);

  const groups = [
    { title: "Visão", items: [{ href: "/", label: "Painel" }] },
    { title: "Assessment", items: [{ href: "/clientes", label: "Clientes" }, { href: "/execucoes", label: "Execuções", badge: ativas }] },
    ...(can(u.roles, "assessments:run") ? [{ title: "Higienização", items: [{ href: "/higienizacao", label: "Higienização", badge: higAtivas }] }] : []),
    ...(can(u.roles, "users:manage")
      ? [{ title: "Administração", items: [{ href: "/admin/usuarios", label: "Usuários e perfis" }, { href: "/admin/auditoria", label: "Auditoria" }] }]
      : []),
  ];
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  const roles = u.roles.map((r) => ROLE_LABEL[r]).join(", ");
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 md:block">
        <Sidebar groups={groups} user={{ name: u.name ?? u.email, roles }} logout={logout} account={LOCAL_LOGIN} />
      </aside>
      <div className="min-w-0 flex-1">
        <details className="border-b bg-ct-bg text-white md:hidden">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">☰ Assessment365</summary>
          <div className="h-[70vh]"><Sidebar groups={groups} user={{ name: u.name ?? u.email, roles: "" }} logout={logout} account={LOCAL_LOGIN} /></div>
        </details>
        <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
