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
    await prisma.assessment.update({ where: { id: a.id }, data: { runner, runnerRef: ref, status: runner === "manual" ? "QUEUED" : "STARTING" } });
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
