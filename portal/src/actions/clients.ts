"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act } from "@/lib/act";
import { prisma } from "@/lib/prisma";
import { audit, diff } from "@/lib/audit";
import { b, req, s } from "@/lib/form";
import { requireClientPerm, requirePerm } from "@/lib/session";
import { deleteSecret, getSecret, secretName, setSecret } from "@/lib/secrets";
import { dbNameFor, externalConn, inspectDb, normalizeServer, tenantSqlConfigured } from "@/lib/tenantDb";
import { provisionClientDb } from "@/lib/clientDb";
import { ACTIVE } from "@/lib/status";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugify = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

// ───────────── Conexão com o Microsoft 365 (usada no cadastro e na edição) ─────────────

type Conn = { m365TenantId: string; appClientId: string; spoTenant: string; authMode: "secret" | "cert" };

function readConnection(fd: FormData): Conn {
  const m365TenantId = req(fd, "m365TenantId", "Tenant ID").toLowerCase();
  const appClientId = req(fd, "appClientId", "Client ID (Application ID)").toLowerCase();
  if (!GUID.test(m365TenantId)) throw new Error("Tenant ID precisa ser um GUID (Entra ID → Visão geral → ID do locatário).");
  if (!GUID.test(appClientId)) throw new Error("Client ID precisa ser um GUID (App Registration → ID do aplicativo).");
  const spoTenant = req(fd, "spoTenant", "Nome do SharePoint").toLowerCase().replace(/^https?:\/\//, "").replace(/(-admin)?\.sharepoint\.com.*$/, "").replace(/\.onmicrosoft\.com$/, "");
  if (!/^[a-z0-9-]+$/.test(spoTenant)) throw new Error("Nome do SharePoint inválido: use só o prefixo (contoso de contoso.sharepoint.com).");
  return { m365TenantId, appClientId, spoTenant, authMode: fd.get("authMode") === "cert" ? "cert" : "secret" };
}

/** Lê a credencial do formulário (secret ou .pfx). Nulo = nada novo enviado. */
async function readCredential(fd: FormData, mode: Conn["authMode"]) {
  if (mode === "secret") {
    const secret = s(fd, "clientSecret");
    return secret ? { kind: "secret" as const, secret, hint: `secret …${secret.slice(-4)}` } : null;
  }
  const file = fd.get("certFile");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > 100_000) throw new Error("Arquivo de certificado grande demais (esperado um .pfx de poucos KB).");
  return { kind: "cert" as const, pfx: Buffer.from(await file.arrayBuffer()).toString("base64"), password: String(fd.get("certPassword") ?? ""), hint: `certificado ${file.name}` };
}

async function storeCredential(clientId: string, cred: NonNullable<Awaited<ReturnType<typeof readCredential>>>) {
  if (cred.kind === "secret") {
    await setSecret(secretName(clientId, "secret"), cred.secret);
  } else {
    await setSecret(secretName(clientId, "cert"), cred.pfx);
    await setSecret(secretName(clientId, "certpwd"), cred.password);
  }
}

async function provision(clientId: string, userId: string) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (c.dbMode !== "EXTERNAL" && !tenantSqlConfigured()) throw new Error("Configure TENANT_SQL_SERVER, TENANT_SQL_USER e TENANT_SQL_PASSWORD no portal.");
  try {
    const { version, steps, dbName } = await provisionClientDb(clientId);
    await audit(prisma, "Client", clientId, "DATABASE", userId, { banco: dbName, modo: c.dbMode, versao: version });
    return steps.length ? `${steps.join(" ")} Banco pronto (schema v${version}).` : `Banco já estava atualizado (schema v${version}).`;
  } catch (e) {
    throw new Error(`Falha ao preparar o banco: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ───────────── Banco do cliente (gerenciado ou existente) ─────────────

type DbChoice =
  | { mode: "MANAGED"; dbName: string; createNow: boolean }
  | { mode: "EXTERNAL"; dbName: string; server: string; user: string; password: string | null };

/** Lê a escolha do banco. No modo existente, a senha pode ficar em branco na edição (mantém a gravada). */
function readDb(fd: FormData, slug: string): DbChoice {
  if (fd.get("dbMode") === "EXTERNAL") {
    const server = normalizeServer(req(fd, "dbServer", "Servidor do banco"));
    if (!/^[a-z0-9.-]+$/.test(server)) throw new Error("Servidor inválido: use o nome do servidor (ex.: meuservidor.database.windows.net).");
    const dbName = req(fd, "dbExistingName", "Nome do banco existente");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(dbName)) throw new Error("Nome do banco inválido.");
    return { mode: "EXTERNAL", server, dbName, user: req(fd, "dbUser", "Usuário do banco"), password: s(fd, "dbPassword") };
  }
  const dbName = (s(fd, "dbName") ?? dbNameFor(slug)).toLowerCase();
  if (!/^[a-z0-9_]{3,120}$/.test(dbName)) throw new Error("Nome do banco inválido: use letras minúsculas, números e _.");
  return { mode: "MANAGED", dbName, createNow: b(fd, "createDb") };
}

/** Banco existente: testa a conexão ANTES de gravar qualquer coisa, para o cadastro não ficar pela metade. */
async function checkExternal(choice: Extract<DbChoice, { mode: "EXTERNAL" }>, password: string) {
  const st = await inspectDb(externalConn(choice.server, choice.dbName, choice.user, password));
  if (!st.hasSchema && !st.empty) throw new Error(`O banco ${choice.dbName} já tem tabelas e não tem o schema do coletor. Use um banco vazio ou um banco de assessment do ct-assessmentspo.`);
  return st;
}

async function assertDbFree(choice: DbChoice, exceptClientId?: string) {
  const other = await prisma.client.findFirst({
    where: { dbName: choice.dbName, dbServer: choice.mode === "EXTERNAL" ? choice.server : null, ...(exceptClientId ? { id: { not: exceptClientId } } : {}) },
  });
  if (other) throw new Error(`Esse banco já está ligado ao cliente ${other.name}.`);
}

// ───────────── Cliente ─────────────

/** Cadastro completo: dados do cliente, conexão M365 com a credencial e (opcional) criação do banco com o schema padrão. */
async function createClient_(fd: FormData) {
  const me = await requirePerm("clients:manage");
  const name = req(fd, "name", "Nome");
  const slug = slugify(s(fd, "slug") ?? name);
  if (!slug) throw new Error("Identificador inválido.");
  if (await prisma.client.findUnique({ where: { slug } })) throw new Error(`Já existe um cliente com o identificador "${slug}".`);
  const conn = readConnection(fd);
  const cred = await readCredential(fd, conn.authMode);
  if (!cred) throw new Error(conn.authMode === "cert" ? "Envie o certificado .pfx do App Registration." : "Informe o client secret do App Registration.");
  const db = readDb(fd, slug);
  await assertDbFree(db);
  if (db.mode === "MANAGED" && db.createNow && !tenantSqlConfigured()) throw new Error("O servidor dos bancos de clientes não está configurado no portal: desmarque a criação do banco ou configure TENANT_SQL_*.");
  if (db.mode === "EXTERNAL") {
    if (!db.password) throw new Error("Informe a senha do banco existente.");
    await checkExternal(db, db.password);
  }

  const c = await prisma.client.create({
    data: {
      name, slug, document: s(fd, "document"), notes: s(fd, "notes"), ...conn, credentialHint: cred.hint,
      dbMode: db.mode, dbName: db.dbName, ...(db.mode === "EXTERNAL" ? { dbServer: db.server, dbUser: db.user } : {}),
    },
  });
  await storeCredential(c.id, cred);
  if (db.mode === "EXTERNAL") await setSecret(secretName(c.id, "dbpwd"), db.password!);
  await prisma.client.update({ where: { id: c.id }, data: { credentialSetAt: new Date() } });
  await audit(prisma, "Client", c.id, "CREATE", me.id, {
    name, slug, banco: db.mode === "EXTERNAL" ? `${db.server}/${db.dbName} (existente)` : db.dbName, tenant: conn.m365TenantId, credencial: cred.hint,
  });

  let dbMsg = "";
  if (db.mode === "EXTERNAL" || db.createNow) {
    try { await provision(c.id, me.id); } catch (e) { dbMsg = e instanceof Error ? e.message : String(e); }
  }
  // em caso de falha no banco o cliente fica cadastrado e o erro aparece na aba Cadastro e banco
  redirect(`/clientes/${c.id}${dbMsg ? "?tab=cadastro" : ""}`);
}

async function updateClient_(id: string, fd: FormData) {
  const me = await requirePerm("clients:manage");
  const before = await prisma.client.findUniqueOrThrow({ where: { id } });
  const data = { name: req(fd, "name", "Nome"), document: s(fd, "document"), notes: s(fd, "notes"), active: b(fd, "active") };
  await prisma.client.update({ where: { id }, data });
  await audit(prisma, "Client", id, "UPDATE", me.id, diff(before as unknown as Record<string, unknown>, data));
  revalidatePath(`/clientes/${id}`);
}

async function saveConnection_(id: string, fd: FormData) {
  const me = await requireClientPerm(id, "clients:manage");
  const before = await prisma.client.findUniqueOrThrow({ where: { id } });
  const conn = readConnection(fd);
  const cred = await readCredential(fd, conn.authMode);
  let credentialSetAt = before.credentialSetAt, credentialHint = before.credentialHint;
  if (cred) {
    await storeCredential(id, cred);
    credentialSetAt = new Date();
    credentialHint = cred.hint;
  } else if (before.authMode !== conn.authMode) {
    credentialSetAt = null; // trocou o modo sem enviar a credencial do novo modo
    credentialHint = null;
  }
  const data = { ...conn, credentialSetAt, credentialHint };
  await prisma.client.update({ where: { id }, data: { ...data, connectionOkAt: null, connectionError: null } });
  await audit(prisma, "Client", id, "CONNECTION", me.id, diff(before as unknown as Record<string, unknown>, data));
  revalidatePath(`/clientes/${id}`);
  return credentialSetAt ? "Conexão salva." : "Conexão salva. Falta informar a credencial (secret ou certificado).";
}

/**
 * Teste de conexão: pede um token app-only ao Entra ID do cliente e lê a organização no Graph.
 * Com certificado o teste completo (Graph + SharePoint) é feito pelo próprio job, que tem o PnP.
 */
async function testConnection_(id: string) {
  await requireClientPerm(id, "clients:manage");
  const c = await prisma.client.findUniqueOrThrow({ where: { id } });
  if (!c.m365TenantId || !c.appClientId) throw new Error("Preencha e salve a conexão primeiro.");
  if (c.authMode === "cert") {
    if (!(await getSecret(secretName(id, "cert")))) throw new Error("Certificado não enviado.");
    return "Certificado guardado no cofre. A autenticação com certificado é validada no início de cada coleta.";
  }
  const secret = await getSecret(secretName(id, "secret"));
  if (!secret) throw new Error("Client secret não informado.");
  try {
    const tr = await fetch(`https://login.microsoftonline.com/${c.m365TenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: c.appClientId, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
    });
    const tj = await tr.json();
    if (!tr.ok) throw new Error(`${tj.error ?? tr.status}: ${String(tj.error_description ?? "").split("\n")[0]}`);
    const org = await fetch("https://graph.microsoft.com/v1.0/organization?$select=displayName", { headers: { Authorization: `Bearer ${tj.access_token}` } });
    const oj = await org.json();
    if (!org.ok) throw new Error(`Graph ${org.status}: ${oj.error?.message ?? ""} (falta a permissão Directory.Read.All com consentimento?)`);
    await prisma.client.update({ where: { id }, data: { connectionOkAt: new Date(), connectionError: null } });
    revalidatePath(`/clientes/${id}`);
    return `Conectado ao tenant "${oj.value?.[0]?.displayName ?? c.m365TenantId}".`;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await prisma.client.update({ where: { id }, data: { connectionOkAt: null, connectionError: m } });
    revalidatePath(`/clientes/${id}`);
    throw new Error(`Falha na conexão: ${m}`);
  }
}

async function removeCredential_(id: string) {
  const me = await requireClientPerm(id, "clients:manage");
  await Promise.all((["secret", "cert", "certpwd"] as const).map((k) => deleteSecret(secretName(id, k))));
  await prisma.client.update({ where: { id }, data: { credentialSetAt: null, credentialHint: null, connectionOkAt: null } });
  await audit(prisma, "Client", id, "CONNECTION", me.id, { credencial: "removida" });
  revalidatePath(`/clientes/${id}`);
  return "Credencial removida do cofre.";
}

/** Troca o banco do cliente: outro banco gerenciado ou um banco existente (com teste de conexão antes de gravar). */
async function saveDatabase_(id: string, fd: FormData) {
  const me = await requirePerm("clients:manage");
  const before = await prisma.client.findUniqueOrThrow({ where: { id } });
  if (await prisma.assessment.count({ where: { clientId: id, status: { in: [...ACTIVE] } } })) throw new Error("Há uma coleta em andamento: aguarde terminar para trocar o banco.");
  const db = readDb(fd, before.slug);
  await assertDbFree(db, id);
  const same = db.mode === before.dbMode && db.dbName === before.dbName && (db.mode === "MANAGED" || (db.server === before.dbServer && db.user === before.dbUser));
  if (db.mode === "EXTERNAL") {
    const pwd = db.password ?? (same || (db.server === before.dbServer && db.user === before.dbUser) ? await getSecret(secretName(id, "dbpwd")) : null);
    if (!pwd) throw new Error("Informe a senha do banco existente.");
    await checkExternal(db, pwd);
    if (db.password) await setSecret(secretName(id, "dbpwd"), db.password);
  }
  await prisma.client.update({
    where: { id },
    data: {
      dbMode: db.mode, dbName: db.dbName,
      dbServer: db.mode === "EXTERNAL" ? db.server : null, dbUser: db.mode === "EXTERNAL" ? db.user : null,
      // banco diferente: começa do zero (o provisionamento detecta schema existente e adota)
      ...(same ? {} : { dbStatus: "PENDENTE", dbSchemaVersion: 0, dbError: null }),
    },
  });
  if (before.dbMode === "EXTERNAL" && db.mode === "MANAGED") await deleteSecret(secretName(id, "dbpwd"));
  await audit(prisma, "Client", id, "DATABASE", me.id, {
    banco: [before.dbMode === "EXTERNAL" ? `${before.dbServer}/${before.dbName}` : before.dbName, db.mode === "EXTERNAL" ? `${db.server}/${db.dbName}` : db.dbName],
  });
  let msg = "Banco salvo.";
  if (db.mode === "EXTERNAL" || (db.mode === "MANAGED" && db.createNow)) msg = await provision(id, me.id);
  revalidatePath(`/clientes/${id}`);
  return msg;
}

/** Cria o banco do cliente (se não existir) e sobe/atualiza o schema padrão do coletor. */
async function provisionDb_(id: string) {
  const me = await requirePerm("clients:manage");
  try {
    return await provision(id, me.id);
  } finally {
    revalidatePath(`/clientes/${id}`);
  }
}

export const createClient = act(createClient_);
export const updateClient = act(updateClient_);
export const saveConnection = act(saveConnection_);
export const testConnection = act(testConnection_);
export const removeCredential = act(removeCredential_);
export const provisionDb = act(provisionDb_);
export const saveDatabase = act(saveDatabase_);
