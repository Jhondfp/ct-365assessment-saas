import { dashboardJson } from "@/lib/dashboard";
import { clientDbFor } from "../guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const g = await clientDbFor(clientId);
  if (g.err) return g.err;
  const execution = new URL(req.url).searchParams.get("execution");
  try {
    return Response.json(await dashboardJson(g.db, execution), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
