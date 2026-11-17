import { executionsJson } from "@/lib/dashboard";
import { clientDbFor } from "../guard";

export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const g = await clientDbFor(clientId);
  if (g.err) return g.err;
  return Response.json(await executionsJson(g.db, g.name), { headers: { "Cache-Control": "no-store" } });
}
