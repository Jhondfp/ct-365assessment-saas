import { prisma } from "@/lib/prisma";
import { requirePagePerm } from "@/lib/session";
import { PERM_LABEL, PERMISSION_MATRIX, ROLE_HINT, ROLE_LABEL, ROLES, isRole, type Perm, type Role } from "@/lib/rbac";
import { dateTime } from "@/lib/format";
import { createUser, removeLocalPassword, updateUser } from "@/actions/admin";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { ModalButton } from "@/components/Modal";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";

type Client = { id: string; name: string; active: boolean };
const TONE: Record<Role, "purple" | "green" | "blue"> = { ADMIN: "purple", EXECUTOR: "green", VISUALIZADOR: "blue" };

function UserFields({ clients, role, clientIds = [], name, email, active }: { clients: Client[]; role?: Role; clientIds?: string[]; name?: string | null; email?: string; active?: boolean }) {
  return (
    <div className="space-y-3">
      {email === undefined && <Field label="E-mail (conta Microsoft 365 ou login local)"><input name="email" type="email" required className="input" /></Field>}
      <Field label="Nome"><input name="name" defaultValue={name ?? ""} className="input" /></Field>
      <fieldset>
        <legend className="label">Perfil</legend>
        <div className="space-y-1.5">
          {ROLES.map((r) => (
            <label key={r} className="flex items-start gap-2 text-sm">
              <input type="radio" name="role" value={r} required defaultChecked={role === r} className="mt-1" />
              <span><b className="font-medium">{ROLE_LABEL[r]}</b> <span className="text-xs text-slate-500">— {ROLE_HINT[r]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Clientes liberados (vale só para o perfil Visualizador)</legend>
        {clients.length === 0 ? <p className="text-xs text-slate-500">Nenhum cliente cadastrado ainda.</p> : (
          <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="clientIds" value={c.id} defaultChecked={clientIds.includes(c.id)} /> {c.name}{!c.active && <span className="text-xs text-slate-400">(inativo)</span>}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Field label="Senha provisória (opcional — habilita o login local)"><input name="password" type="password" autoComplete="new-password" className="input" /></Field>
      {active !== undefined && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={active} /> Ativo</label>}
    </div>
  );
}

export default async function Usuarios() {
  const me = await requirePagePerm("users:manage");
  const [users, clients] = await Promise.all([
    prisma.user.findMany({ orderBy: { email: "asc" }, include: { roleLinks: true, clientAccess: { include: { client: { select: { name: true } } } } } }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true } }),
  ]);
  return (
    <>
      <PageHeader title="Usuários e perfis" subtitle="Quem acessa o portal, com qual perfil e — para visualizadores — quais clientes" actions={
        <ModalButton label="Novo usuário" title="Novo usuário" className="btn">
          <ActionForm action={createUser} submit="Cadastrar" reset><UserFields clients={clients} /></ActionForm>
        </ModalButton>
      } />
      <section className="card mb-6 overflow-x-auto">
        {users.length === 0 ? <Empty>Nenhum usuário.</Empty> : (
          <table className="tbl">
            <thead><tr><th>Usuário</th><th>Perfil</th><th>Clientes</th><th>Login</th><th>Último acesso</th><th /></tr></thead>
            <tbody>
              {users.map((u) => {
                const role = u.roleLinks.map((r) => r.role).find(isRole);
                return (
                  <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                    <td><p className="font-medium">{u.name ?? "—"}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                    <td>{role ? <Badge tone={TONE[role]}>{ROLE_LABEL[role]}</Badge> : <Badge tone="orange">aguardando perfil</Badge>}</td>
                    <td className="max-w-xs text-xs">{role === "VISUALIZADOR" ? (u.clientAccess.map((c) => c.client.name).join(", ") || <span className="text-amber-700">nenhum cliente liberado</span>) : role ? <span className="text-slate-500">todos</span> : "—"}</td>
                    <td className="text-xs">{[u.entraOid && "Microsoft", u.passwordHash && "senha"].filter(Boolean).join(" + ") || "—"}{u.lockedUntil && u.lockedUntil > new Date() && <> <Badge tone="red">bloqueado</Badge></>}</td>
                    <td className="text-xs">{dateTime(u.lastLoginAt)}</td>
                    <td className="whitespace-nowrap text-right">
                      <ModalButton label="Editar" title={u.email} className="btn-secondary btn-sm">
                        <ActionForm action={updateUser.bind(null, u.id)} submit="Salvar">
                          <UserFields clients={clients} role={role} clientIds={u.clientAccess.map((c) => c.clientId)} name={u.name} email={u.email} active={u.active} />
                        </ActionForm>
                        {u.passwordHash && u.id !== me.id && <div className="mt-3 border-t pt-3"><ActionButton action={removeLocalPassword.bind(null, u.id)} confirm="Remover o login local deste usuário?">Remover login local</ActionButton></div>}
                      </ModalButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2 className="card-title">O que cada perfil pode fazer</h2>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Permissão</th>{ROLES.map((r) => <th key={r} className="text-center">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {(Object.keys(PERMISSION_MATRIX) as Perm[]).map((p) => (
                <tr key={p}><td>{PERM_LABEL[p]}</td>{ROLES.map((r) => <td key={r} className="text-center">{PERMISSION_MATRIX[p].includes(r) ? "✓" : ""}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
