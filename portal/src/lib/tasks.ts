import { prisma } from "./prisma";
import { parseJson } from "./status";

/**
 * Lotes de uma coleta dividida (AssessmentTask). A coleta principal reparte a coleta de arquivos/lixeira em lotes
 * de sites; qualquer container da fila pega um lote (POST /api/jobs/claim), inclusive a própria coleta enquanto
 * espera (POST /api/jobs/<id>/tasks/claim). Cada site tem o próprio progresso no banco do cliente
 * (dbo.execution_progress), então pegar de novo um lote interrompido só refaz os sites que faltaram.
 */
export const TASK_STALE_MS = 10 * 60_000;
export const TASK_MAX_ATTEMPTS = 3;
/** Teto padrão de containers trabalhando ao mesmo tempo numa coleta (protege o SharePoint do cliente). */
export const DEFAULT_CONTAINERS = 4;

export type TaskSite = { Url: string; Title?: string; Id?: string; StorageUsageCurrent?: number };

/** Teto de containers da coleta: params.files_containers (definido na tela de execução). */
export function containersCap(params: string | null | undefined) {
  const v = Number(parseJson<Record<string, unknown>>(params ?? null, {}).files_containers);
  return Number.isFinite(v) && v >= 1 ? Math.min(16, Math.floor(v)) : DEFAULT_CONTAINERS;
}

/** Cria os lotes uma única vez (numa retomada da coleta principal, devolve os que já existem). */
export async function createTasks(assessmentId: string, batches: TaskSite[][]) {
  const existing = await prisma.assessment.findUniqueOrThrow({ where: { id: assessmentId }, select: { _count: { select: { tasks: true } } } });
  if (existing._count.tasks === 0 && batches.length) {
    await prisma.assessmentTask.createMany({
      data: batches.map((sites, i) => ({ assessmentId, seq: i + 1, sites: JSON.stringify(sites), siteCount: sites.length })),
    });
  }
  return taskSummary(assessmentId);
}

export async function taskSummary(assessmentId: string) {
  const tasks = await prisma.assessmentTask.findMany({ where: { assessmentId }, orderBy: { seq: "asc" } });
  const stale = Date.now() - TASK_STALE_MS;
  const gaveUp = (t: { status: string; attempts: number }) => t.status === "FAILED" && t.attempts >= TASK_MAX_ATTEMPTS;
  const n = (s: string) => tasks.filter((t) => t.status === s && (s !== "FAILED" || gaveUp(t))).length;
  return {
    total: tasks.length, queued: n("QUEUED") + tasks.filter((t) => t.status === "FAILED" && !gaveUp(t)).length, running: n("RUNNING"), done: n("DONE"), failed: n("FAILED"),
    sites: tasks.reduce((a, t) => a + t.siteCount, 0), sitesDone: tasks.reduce((a, t) => a + (t.status === "DONE" ? t.siteCount : Math.min(t.done, t.siteCount)), 0),
    containers: new Set(tasks.filter((t) => t.status === "RUNNING" && (t.heartbeatAt?.getTime() ?? 0) > stale).map((t) => t.runnerRef ?? "?")).size,
    finished: tasks.length > 0 && tasks.every((t) => t.status === "DONE" || gaveUp(t)),
    tasks: tasks.map((t) => ({ id: t.id, seq: t.seq, status: t.status, siteCount: t.siteCount, done: t.done, attempts: t.attempts, runnerRef: t.runnerRef, error: t.error, heartbeatAt: t.heartbeatAt, startedAt: t.startedAt, finishedAt: t.finishedAt })),
  };
}

/**
 * Reserva o próximo lote (atômico: updateMany com o estado esperado). Pega lote na fila ou lote parado (sem sinal
 * há 10 min). Lote que já parou TASK_MAX_ATTEMPTS vezes é dado como falho. Sem `assessmentId`, procura em todas as
 * coletas em andamento, respeitando o teto de containers de cada uma; a coleta principal (`main`) não conta no teto.
 */
export async function claimTask(workerId: string, assessmentId?: string): Promise<{ assessmentId: string; taskId: string } | null> {
  const stale = new Date(Date.now() - TASK_STALE_MS);
  const candidates = await prisma.assessmentTask.findMany({
    where: {
      ...(assessmentId ? { assessmentId } : {}),
      assessment: { status: "RUNNING" },
      OR: [{ status: "QUEUED" }, { status: "RUNNING", heartbeatAt: { lt: stale } }, { status: "FAILED", attempts: { lt: TASK_MAX_ATTEMPTS } }],
    },
    orderBy: [{ createdAt: "asc" }, { seq: "asc" }], take: 20,
    include: { assessment: { select: { params: true } } },
  });
  const capCache = new Map<string, boolean>();
  for (const t of candidates) {
    if (t.status === "RUNNING" && t.attempts >= TASK_MAX_ATTEMPTS) {
      await prisma.assessmentTask.updateMany({ where: { id: t.id, status: "RUNNING", heartbeatAt: t.heartbeatAt }, data: { status: "FAILED", finishedAt: new Date(), error: t.error ?? `O lote parou de responder ${t.attempts} vezes; desistindo.` } });
      continue;
    }
    if (!assessmentId) {
      if (!capCache.has(t.assessmentId)) {
        const busy = await prisma.assessmentTask.count({ where: { assessmentId: t.assessmentId, status: "RUNNING", heartbeatAt: { gte: stale }, NOT: { runnerRef: "main" } } });
        capCache.set(t.assessmentId, busy < containersCap(t.assessment.params) - 1);
      }
      if (!capCache.get(t.assessmentId)) continue;
    }
    const r = await prisma.assessmentTask.updateMany({
      where: { id: t.id, status: t.status, heartbeatAt: t.heartbeatAt, attempts: t.attempts },
      data: { status: "RUNNING", runnerRef: assessmentId ? "main" : workerId, attempts: { increment: 1 }, heartbeatAt: new Date(), startedAt: t.startedAt ?? new Date() },
    });
    if (r.count) { capCache.delete(t.assessmentId); return { assessmentId: t.assessmentId, taskId: t.id }; }
  }
  return null;
}
