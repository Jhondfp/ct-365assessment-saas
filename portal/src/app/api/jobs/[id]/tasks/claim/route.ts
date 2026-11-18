import { loadActive } from "@/lib/jobChannel";
import { claimTask } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";

/** A própria coleta pega um lote dela (enquanto houver) em vez de ficar só esperando os outros containers. */
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { err } = await loadActive(req, id);
  if (err) return err;
  const t = await claimTask("main", id);
  if (!t) return new Response(null, { status: 204 });
  const task = await prisma.assessmentTask.findUniqueOrThrow({ where: { id: t.taskId } });
  return Response.json({ id: task.id, seq: task.seq, sites: JSON.parse(task.sites) }, { headers: { "Cache-Control": "no-store" } });
}
