import { prisma } from "@/lib/prisma";
import { loadActive, mergeLog } from "@/lib/jobChannel";
import type { LogLine } from "@/lib/status";

/**
 * Canal de um lote: sinal de vida, progresso (sites concluídos), linhas de log (vão para o log da coleta, marcadas
 * com o número do lote) e o fim do lote. Coleta cancelada → 409 e o container encerra.
 */
export const dynamic = "force-dynamic";
type Body = { progress?: { steps?: Record<string, { info?: string }> } | unknown; log?: LogLine[]; status?: "done" | "failed"; error?: string; done?: number };

export async function POST(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const { a, err } = await loadActive(req, id);
  if (err) return err;
  const task = await prisma.assessmentTask.findFirst({ where: { id: taskId, assessmentId: id } });
  if (!task) return Response.json({ error: "lote não encontrado" }, { status: 404 });
  if (task.status !== "RUNNING") return Response.json({ error: `lote ${task.status.toLowerCase()}` }, { status: 409 });
  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }

  const data: Record<string, unknown> = { heartbeatAt: new Date() };
  let done = typeof body.done === "number" ? body.done : null;
  if (done == null && body.progress && typeof body.progress === "object") {
    const m = JSON.stringify(body.progress).match(/(\d+) de (\d+) sites processados/);
    if (m) done = Number(m[1]);
  }
  if (done != null) data.done = Math.max(task.done, Math.min(done, task.siteCount));
  if (body.status === "done" || body.status === "failed") {
    data.status = body.status === "done" ? "DONE" : "FAILED";
    data.finishedAt = new Date();
    if (body.status === "done") data.done = task.siteCount;
    if (body.error) data.error = String(body.error).slice(0, 4000);
  }
  await prisma.assessmentTask.update({ where: { id: taskId }, data });
  if (Array.isArray(body.log) && body.log.length) {
    const tagged = body.log.map((l) => ({ ...l, module: `Lote ${task.seq}${l.module ? ` · ${l.module}` : ""}` }));
    await prisma.assessment.update({ where: { id }, data: { logTail: mergeLog(a.logTail, tagged) } });
  }
  return Response.json({ ok: true });
}
