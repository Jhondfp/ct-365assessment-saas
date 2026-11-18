import { loadActive } from "@/lib/jobChannel";
import { createTasks, taskSummary, type TaskSite } from "@/lib/tasks";

/** Coleta dividida: a coleta principal cria os lotes (POST, uma vez) e acompanha o andamento (GET). */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { err } = await loadActive(req, id);
  if (err) return err;
  let batches: TaskSite[][] = [];
  try {
    const b = await req.json();
    batches = (Array.isArray(b?.batches) ? b.batches : []).map((x: { sites?: TaskSite[] }) => (Array.isArray(x?.sites) ? x.sites : []).filter((s) => s && typeof s.Url === "string")).filter((x: TaskSite[]) => x.length);
  } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
  if (batches.length > 5000) return Response.json({ error: "lotes demais" }, { status: 400 });
  const s = await createTasks(id, batches);
  return Response.json({ total: s.total, queued: s.queued, running: s.running, done: s.done, failed: s.failed, finished: s.finished });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { err } = await loadActive(req, id);
  if (err) return err;
  const s = await taskSummary(id);
  return Response.json({ total: s.total, queued: s.queued, running: s.running, done: s.done, failed: s.failed, finished: s.finished, containers: s.containers });
}
