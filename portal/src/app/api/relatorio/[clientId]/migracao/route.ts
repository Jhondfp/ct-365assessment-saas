import { prisma } from "@/lib/prisma";
import { googleData, googleExport } from "@/lib/googleReport";
import { awsData, awsExport } from "@/lib/awsReport";
import { clientDbFor } from "../guard";

/** Resumo do levantamento de migração (Google Workspace → M365 ou AWS → Azure) em JSON, para o Archie montar escopo e proposta. */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const g = await clientDbFor(clientId);
  if (g.err) return g.err;
  const execution = new URL(req.url).searchParams.get("execution") ?? "";
  if (!/^[\w-]{8,64}$/.test(execution)) return new Response("Parâmetros inválidos", { status: 400 });
  const { platform } = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { platform: true } });
  if (platform !== "GOOGLE" && platform !== "AWS") return new Response("Exportação disponível só para levantamentos de migração (Google Workspace ou AWS).", { status: 400 });
  const body = platform === "AWS" ? awsExport(g.name, await awsData(clientId, execution)) : googleExport(g.name, await googleData(clientId, execution));
  const name = g.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(0, 60);
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="migracao-${platform === "AWS" ? "aws" : "google"}-${name}.json"`, "Cache-Control": "no-store" },
  });
}
