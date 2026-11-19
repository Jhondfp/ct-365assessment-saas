import { googleData, googleExport } from "@/lib/googleReport";
import { clientDbFor } from "../guard";

/** Resumo do levantamento Google Workspace em JSON (entrada para o Archie montar escopo e proposta de migração). */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const g = await clientDbFor(clientId);
  if (g.err) return g.err;
  const execution = new URL(req.url).searchParams.get("execution") ?? "";
  if (!/^[\w-]{8,64}$/.test(execution)) return new Response("Parâmetros inválidos", { status: 400 });
  const body = googleExport(g.name, await googleData(clientId, execution));
  const name = g.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(0, 60);
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="migracao-google-${name}.json"`, "Cache-Control": "no-store" },
  });
}
