import { prisma } from "./prisma";
import { dbNameFor, latestTenantVersion, provisionTenantDb } from "./tenantDb";
import { acaExecutionStatus, startJob } from "./jobs";
import { ACTIVE } from "./status";
import type { CollectorParams } from "./collector";

/** Garante banco provisionado e schema na última versão antes de uma execução. */
export async function ensureClientDb(id: string) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id } });
  const latest = await latestTenantVersion();
  if (c.dbStatus === "PROVISIONADO" && c.dbSchemaVersion >= latest && c.dbName) return c.dbName;
  const dbName = c.dbName ?? dbNameFor(c.slug);
  const version = await provisionTenantDb(dbName, c.dbSchemaVersion);
  await prisma.client.update({ where: { id }, data: { dbName, dbStatus: "PROVISIONADO", dbSchemaVersion: version, dbError: null } });
  return dbName;
}

/** O que falta para o cliente poder executar (vazio = pronto). */
export function readiness(c: { active: boolean; m365TenantId: string | null; appClientId: string | null; spoTenant: string | null; credentialSetAt: Date | null }) {
  const missing: string[] = [];
  if (!c.active) missing.push("cliente inativo");
  if (!c.m365TenantId || !c.appClientId || !c.spoTenant) missing.push("conexão com o Microsoft 365");
  if (!c.credentialSetAt) missing.push("credencial (client secret ou certificado)");
  return missing;
}

/**
 * Cria a execução e dispara o job. Uma execução ativa por cliente: duas coletas simultâneas no mesmo banco
 * disputariam as mesmas tabelas e o throttling do mesmo tenant.
 */
export async function launchAssessment(clientId: string, params: CollectorParams, userId: string) {
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const missing = readiness(c);
  if (missing.length) throw new Error(`Antes de executar, configure: ${missing.join(", ")}.`);
  const running = await prisma.assessment.findFirst({ where: { clientId, status: { in: [...ACTIVE] } } });
  if (running) throw new Error("Já existe uma execução ativa para este cliente. Aguarde terminar ou cancele.");
  await ensureClientDb(clientId);

  const a = await prisma.assessment.create({ data: { clientId, startedById: userId, params: JSON.stringify(params), runner: "manual", status: "QUEUED" } });
  try {
    const { runner, ref } = await startJob(a.id);
    await prisma.assessment.update({ where: { id: a.id }, data: { runner, runnerRef: ref, status: runner === "manual" || runner === "queue" ? "QUEUED" : "STARTING" } });
  } catch (e) {
    await prisma.assessment.update({ where: { id: a.id }, data: { status: "FAILED", error: `Falha ao iniciar o job: ${e instanceof Error ? e.message : e}`, finishedAt: new Date() } });
  }
  return a.id;
}

const STALE_MS = 15 * 60_000;

/**
 * Reconciliação: se o job parou de mandar sinal (container morreu sem avisar), consulta o Azure.
 * Com retry configurado no Container Apps Job, o mesmo ASSESSMENT_ID volta e o coletor retoma de onde parou.
 */
export async function reconcile(id: string) {
  const a = await prisma.assessment.findUnique({ where: { id } });
  if (!a || !["STARTING", "RUNNING"].includes(a.status) || a.runner !== "aca" || !a.runnerRef) return;
  const last = (a.heartbeatAt ?? a.startedAt ?? a.createdAt).getTime();
  if (Date.now() - last < STALE_MS) return;
  const st = await acaExecutionStatus(a.runnerRef);
  if (st === "Failed" || st === "Stopped" || st === "Succeeded") {
    await prisma.assessment.updateMany({
      where: { id, status: { in: ["STARTING", "RUNNING"] } },
      data: { status: st === "Stopped" ? "CANCELED" : "FAILED", finishedAt: new Date(), error: a.error ?? `O job terminou no Azure com estado ${st} sem reportar o fim ao portal.` },
    });
  }
}

/** Quantas vezes o worker pode pegar a mesma coleta (a primeira + retomadas depois de queda). */
const MAX_ATTEMPTS = 4;
/** Sem sinal do worker por este tempo = o container caiu e a coleta volta para a fila (retomada). */
const QUEUE_STALE_MS = 10 * 60_000;

/**
 * Fila de coletas (JOB_RUNNER=queue): entrega ao worker a próxima coleta. Prioriza retomar uma coleta cujo worker
 * parou de mandar sinal (ou falha de vez se já passou do limite de tentativas); senão, a mais antiga na fila.
 * A reserva é atômica (updateMany com o status esperado), então dois workers nunca pegam a mesma coleta.
 */
export async function claimNext(workerId: string) {
  const stale = new Date(Date.now() - QUEUE_STALE_MS);
  const orphans = await prisma.assessment.findMany({
    where: { runner: "queue", status: { in: ["STARTING", "RUNNING"] }, OR: [{ heartbeatAt: { lt: stale } }, { heartbeatAt: null, createdAt: { lt: stale } }] },
    orderBy: { createdAt: "asc" }, take: 5,
  });
  for (const o of orphans) {
    if (o.attempts >= MAX_ATTEMPTS) {
      await prisma.assessment.updateMany({
        where: { id: o.id, status: o.status },
        data: { status: "FAILED", finishedAt: new Date(), error: o.error ?? `O worker parou de responder ${o.attempts} vezes nesta coleta; desistindo.` },
      });
      continue;
    }
    const r = await prisma.assessment.updateMany({ where: { id: o.id, status: o.status, heartbeatAt: o.heartbeatAt }, data: { status: "STARTING", runnerRef: workerId, heartbeatAt: new Date() } });
    if (r.count) return o.id;
  }
  const next = await prisma.assessment.findMany({ where: { runner: "queue", status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: 5 });
  for (const n of next) {
    // um cliente por vez: não pega a coleta se o mesmo cliente já tem outra rodando
    const busy = await prisma.assessment.count({ where: { clientId: n.clientId, id: { not: n.id }, status: { in: ["STARTING", "RUNNING"] } } });
    if (busy) continue;
    const r = await prisma.assessment.updateMany({ where: { id: n.id, status: "QUEUED" }, data: { status: "STARTING", runnerRef: workerId, heartbeatAt: new Date() } });
    if (r.count) return n.id;
  }
  return null;
}
