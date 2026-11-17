import { prisma } from "@/lib/prisma";
import { verifyJobToken } from "@/lib/jobToken";
import { getSecret, secretName } from "@/lib/secrets";
import { clientConn } from "@/lib/clientDb";
import { ACTIVE, parseJson, type LogLine } from "@/lib/status";

/**
 * Canal do job (container do coletor) com o portal. Autenticado pelo token HMAC da execução e aceito só
 * enquanto a execução está ativa: depois de terminada/cancelada o token não serve para mais nada.
 *  GET  → configuração da execução (auth.json + params.json do coletor, com a credencial do M365 e do banco)
 *  POST → progresso (global_status.json), últimas linhas de log e o resultado final
 */
export const dynamic = "force-dynamic";
const MAX_LOG = 500;

async function load(req: Request, id: string) {
  if (!verifyJobToken(id, req.headers.get("authorization"))) return { err: Response.json({ error: "token inválido" }, { status: 401 }) };
  const a = await prisma.assessment.findUnique({ where: { id }, include: { client: true } });
  if (!a) return { err: Response.json({ error: "execução não encontrada" }, { status: 404 }) };
  if (!(ACTIVE as readonly string[]).includes(a.status)) return { err: Response.json({ error: `execução ${a.status.toLowerCase()}`, status: a.status }, { status: 409 }) };
  return { a };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { a, err } = await load(req, id);
  if (err) return err;
  const c = a.client;
  if (!c.dbName || !c.m365TenantId || !c.appClientId || !c.spoTenant) return Response.json({ error: "cliente sem conexão ou banco configurado" }, { status: 409 });

  const db = await clientConn(c);
  const auth: Record<string, unknown> = {
    tenant_id: c.m365TenantId,
    client_id: c.appClientId,
    spo_tenant: c.spoTenant,
    auth_mode: c.authMode,
    connection: "sql",
    server: db.server,
    database: db.database,
    database_username: db.user,
    database_password: db.password,
    proxy_url: "",
  };
  let certBase64: string | null = null;
  if (c.authMode === "cert") {
    certBase64 = await getSecret(secretName(c.id, "cert"));
    auth.cert_password = (await getSecret(secretName(c.id, "certpwd"))) ?? "";
    if (!certBase64) return Response.json({ error: "certificado do cliente não encontrado no cofre" }, { status: 409 });
  } else {
    auth.client_secret = await getSecret(secretName(c.id, "secret"));
    if (!auth.client_secret) return Response.json({ error: "client secret do cliente não encontrado no cofre" }, { status: 409 });
  }

  const updated = await prisma.assessment.update({
    where: { id },
    data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: a.startedAt ?? new Date(), heartbeatAt: new Date() },
  });
  return Response.json({
    executionId: a.id,
    attempt: updated.attempts,
    clientName: c.name,
    auth,
    certBase64,
    params: JSON.parse(a.params),
  }, { headers: { "Cache-Control": "no-store" } });
}

type EventBody = {
  status?: "running" | "completed" | "partial" | "failed"; progress?: unknown; log?: LogLine[]; error?: string; totalSites?: number;
  workloads?: unknown; preflight?: unknown;
};
const FINAL: Record<string, string> = { completed: "COMPLETED", partial: "PARTIAL", failed: "FAILED" };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { a, err } = await load(req, id);
  if (err) return err;
  let body: EventBody;
  try { body = await req.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }

  const data: Record<string, unknown> = { heartbeatAt: new Date() };
  if (body.progress && typeof body.progress === "object") data.progress = JSON.stringify(body.progress).slice(0, 200_000);
  if (Array.isArray(body.log) && body.log.length) {
    const merged = [...parseJson<LogLine[]>(a.logTail, []), ...body.log.slice(-MAX_LOG)].slice(-MAX_LOG);
    data.logTail = JSON.stringify(merged);
  }
  if (typeof body.totalSites === "number") data.totalSites = body.totalSites;
  if (body.workloads && typeof body.workloads === "object") data.workloads = JSON.stringify(body.workloads).slice(0, 100_000);
  if (body.preflight && typeof body.preflight === "object") data.preflight = JSON.stringify(body.preflight).slice(0, 100_000);
  if (body.status && FINAL[body.status]) {
    data.status = FINAL[body.status];
    data.finishedAt = new Date();
    if (body.error) data.error = String(body.error).slice(0, 8000);
  } else if (a.status !== "RUNNING") data.status = "RUNNING";
  await prisma.assessment.update({ where: { id }, data });
  return Response.json({ ok: true });
}
