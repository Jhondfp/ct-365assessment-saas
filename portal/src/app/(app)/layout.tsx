import { signOut, LOCAL_LOGIN } from "@/auth";
import { cookies } from "next/headers";
import { Sidebar, SidebarShell } from "@/components/Sidebar";
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
    { title: "Operação", items: [
      { href: "/", label: "Painel", icon: "painel" as const },
      { href: "/clientes", label: "Clientes", icon: "clientes" as const },
      { href: "/execucoes", label: "Execuções", icon: "execucoes" as const, badge: ativas },
      ...(can(u.roles, "assessments:run") ? [{ href: "/higienizacao", label: "Higienização", icon: "higienizacao" as const, badge: higAtivas }] : []),
    ] },
    ...(can(u.roles, "users:manage")
      ? [{ title: "Administração", items: [{ href: "/admin/usuarios", label: "Usuários e perfis", icon: "usuarios" as const }, { href: "/admin/auditoria", label: "Auditoria", icon: "auditoria" as const }, { href: "/admin/documentacao", label: "Documentação técnica", icon: "docs" as const }] }]
      : []),
  ];
  const collapsed = (await cookies()).get("ct_sidebar")?.value === "1";
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  const roles = u.roles.map((r) => ROLE_LABEL[r]).join(", ");
  return (
    <div className="flex min-h-screen">
      <SidebarShell groups={groups} user={{ name: u.name ?? u.email, roles }} logout={logout} account={LOCAL_LOGIN} initialCollapsed={collapsed} />
      <div className="min-w-0 flex-1">
        <details className="border-b bg-ct-bg text-white md:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span aria-hidden="true">☰</span> Assessment365</summary>
          <div className="h-[75vh]"><Sidebar groups={groups} user={{ name: u.name ?? u.email, roles }} logout={logout} account={LOCAL_LOGIN} /></div>
        </details>
        <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
