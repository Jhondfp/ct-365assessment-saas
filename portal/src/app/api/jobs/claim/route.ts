import { timingSafeEqual } from "node:crypto";
import { claimNext } from "@/lib/assessments";
import { jobEnv } from "@/lib/jobs";

/**
 * Fila de coletas (JOB_RUNNER=queue). O worker (job/Start-Worker.ps1) chama a cada poucos segundos com o
 * WORKER_TOKEN compartilhado; recebe 204 (nada a fazer) ou as 3 variáveis da coleta para rodar o
 * Invoke-SaasAssessment.ps1. Daí em diante a coleta usa o canal normal /api/jobs/<id>, com o token da execução.
 */
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const want = process.env.WORKER_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return want.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "token inválido" }, { status: 401 });
  let worker = "worker";
  try { worker = String((await req.json())?.worker ?? worker).slice(0, 120); } catch { /* corpo opcional */ }
  const id = await claimNext(worker);
  if (!id) return new Response(null, { status: 204 });
  return Response.json(jobEnv(id), { headers: { "Cache-Control": "no-store" } });
}
