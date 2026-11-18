import { prisma } from "@/lib/prisma";
import { currentUser, canSeeClient } from "@/lib/session";
import { can } from "@/lib/rbac";
import { reconcile } from "@/lib/assessments";
import { parseJson } from "@/lib/status";
import { taskSummary } from "@/lib/tasks";

/** Polling da página da execução: status, etapas e log. */
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u || !u.active || !can(u.roles, "reports:view")) return Response.json({ error: "não autenticado" }, { status: 401 });
  await reconcile(id).catch(() => {});
  const a = await prisma.assessment.findUnique({ where: { id } });
  if (!a || !canSeeClient(u, a.clientId)) return Response.json({ error: "não encontrada" }, { status: 404 });
  const lotes = await taskSummary(id);
  return Response.json({
    batches: lotes.total ? { total: lotes.total, queued: lotes.queued, running: lotes.running, done: lotes.done, failed: lotes.failed, sites: lotes.sites, sitesDone: lotes.sitesDone, containers: lotes.containers } : null,
    status: a.status, attempts: a.attempts, error: a.error, startedAt: a.startedAt, finishedAt: a.finishedAt, heartbeatAt: a.heartbeatAt,
    progress: parseJson(a.progress, null), log: parseJson(a.logTail, []), workloads: parseJson(a.workloads, null), preflight: parseJson(a.preflight, null),
  }, { headers: { "Cache-Control": "no-store" } });
}
