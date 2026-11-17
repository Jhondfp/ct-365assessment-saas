import { prisma } from "@/lib/prisma";
import { currentUser, canSeeClient } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getSecret, secretName } from "@/lib/secrets";
import { publicFromPfx } from "@/lib/certificate";

/** Certificado PÚBLICO (.cer) do cliente, para enviar ao App Registration. A chave privada nunca sai do cofre. */
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u || !u.active || !can(u.roles, "clients:manage")) return new Response("Não autorizado", { status: 401 });
  const c = await prisma.client.findUnique({ where: { id }, select: { id: true, slug: true, authMode: true } });
  if (!c || !canSeeClient(u, c.id)) return new Response("Não encontrado", { status: 404 });
  const pfx = c.authMode === "cert" ? await getSecret(secretName(c.id, "cert")) : null;
  if (!pfx) return new Response("Este cliente não tem certificado no cofre.", { status: 404 });
  try {
    const info = publicFromPfx(pfx, (await getSecret(secretName(c.id, "certpwd"))) ?? "");
    return new Response(info.cerPem, {
      headers: { "Content-Type": "application/x-x509-ca-cert", "Content-Disposition": `attachment; filename="ct-assessment-${c.slug}.cer"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(`Não foi possível ler o certificado: ${e instanceof Error ? e.message : String(e)}`, { status: 422 });
  }
}
