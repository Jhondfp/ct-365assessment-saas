/**
 * Perfis do portal (nesta fase, só a equipe Cloud Target acessa):
 *  - ADMIN:        mexe em tudo — usuários e perfis, clientes, bancos, coletas, auditoria.
 *  - EXECUTOR:     cadastra e edita clientes (conexão M365, banco) e executa coletas de qualquer cliente.
 *  - VISUALIZADOR: só consulta execuções e dashboards dos clientes liberados para ele (UserClient).
 */
export const ROLES = ["ADMIN", "EXECUTOR", "VISUALIZADOR"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administrador", EXECUTOR: "Executor", VISUALIZADOR: "Visualizador" };
export const ROLE_HINT: Record<Role, string> = {
  ADMIN: "Acesso total, inclusive usuários e perfis",
  EXECUTOR: "Cadastra clientes e executa coletas de todos os clientes",
  VISUALIZADOR: "Só vê execuções e dashboards dos clientes liberados",
};

export type Perm = "users:manage" | "clients:all" | "clients:manage" | "assessments:run" | "reports:view";

const MATRIX: Record<Perm, Role[]> = {
  "users:manage": ["ADMIN"],
  "clients:all": ["ADMIN", "EXECUTOR"],
  "clients:manage": ["ADMIN", "EXECUTOR"],
  "assessments:run": ["ADMIN", "EXECUTOR"],
  "reports:view": ["ADMIN", "EXECUTOR", "VISUALIZADOR"],
};

export const can = (roles: readonly Role[] | undefined, perm: Perm) => !!roles?.some((r) => MATRIX[perm].includes(r));
export const PERMISSION_MATRIX = MATRIX;
export const PERM_LABEL: Record<Perm, string> = {
  "users:manage": "Gerir usuários, perfis e clientes liberados",
  "clients:all": "Ver todos os clientes",
  "clients:manage": "Cadastrar e editar clientes, conexão Microsoft 365 e banco de dados",
  "assessments:run": "Iniciar, cancelar e repetir coletas",
  "reports:view": "Ver execuções e dashboards (Visualizador: só dos clientes liberados)",
};
export const isRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r);
