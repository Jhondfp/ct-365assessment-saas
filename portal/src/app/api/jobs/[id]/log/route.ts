import { prisma } from "@/lib/prisma";
import { verifyJobToken } from "@/lib/jobToken";
import { ACTIVE } from "@/lib/status";

/** O job envia o log completo (gzip) no fim da execução, antes do resultado final. */
export const dynamic = "force-dynamic";
const MAX = 50 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!verifyJobToken(id, req.headers.get("authorization"))) return Response.json({ error: "token inválido" }, { status: 401 });
  const a = await prisma.assessment.findUnique({ where: { id }, select: { status: true } });
  if (!a) return Response.json({ error: "execução não encontrada" }, { status: 404 });
  if (!(ACTIVE as readonly string[]).includes(a.status)) return Response.json({ error: "execução encerrada" }, { status: 409 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX) return Response.json({ error: "log vazio ou grande demais" }, { status: 413 });
  await prisma.assessmentLog.upsert({ where: { assessmentId: id }, create: { assessmentId: id, content: buf, size: buf.length }, update: { content: buf, size: buf.length, createdAt: new Date() } });
  return Response.json({ ok: true });
}
