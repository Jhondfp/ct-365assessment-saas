import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { currentUser, canSeeClient } from "@/lib/session";
import { can } from "@/lib/rbac";

/** Download do log completo da execução (texto). */
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u || !u.active || !can(u.roles, "reports:view")) return new Response("Não autenticado", { status: 401 });
  const a = await prisma.assessment.findUnique({ where: { id }, select: { clientId: true, client: { select: { slug: true } }, fullLog: true } });
  if (!a || !canSeeClient(u, a.clientId) || !a.fullLog) return new Response("Log não disponível", { status: 404 });
  const text = new Uint8Array(gunzipSync(Buffer.from(a.fullLog.content)));
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="coleta-${a.client.slug}-${id.slice(0, 8)}.log"`, "Cache-Control": "no-store" },
  });
}
