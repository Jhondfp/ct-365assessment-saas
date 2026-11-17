"use server";
import { redirect } from "next/navigation";
import { act } from "@/lib/act";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { int, s } from "@/lib/form";
import { requireClientPerm } from "@/lib/session";
import { launchAssessment } from "@/lib/assessments";
import { buildParams } from "@/lib/collector";
import type { HygieneParams } from "@/lib/hygiene";

/**
 * Inicia uma higienização (sempre manual). Administrador e Executor.
 * "Simular" não altera nada; "Executar" exige confirmação, e exclusão permanente exige digitar EXCLUIR.
 */
async function startHygiene_(clientId: string, fd: FormData) {
  const me = await requireClientPerm(clientId, "assessments:run");
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  if (c.spoTenant == null) throw new Error("Configure a conexão com o Microsoft 365 do cliente.");

  const action = s(fd, "acao") === "executar" ? "executar" : "simular";
  const keep = int(fd, "keep", 100, 1, 50000);
  const scope = s(fd, "scope") === "sites" ? "sites" : "tenant";
  const host = `https://${c.spoTenant}.sharepoint.com`, myHost = `https://${c.spoTenant}-my.sharepoint.com`;
  const sites = scope === "sites" ? [...new Set(fd.getAll("sites").map(String).map((u) => u.trim().replace(/\/+$/, "")).filter(Boolean))] : [];
  if (scope === "sites" && !sites.length) throw new Error("Escolha ao menos um site ou use o tenant inteiro.");
  const foreign = sites.find((u) => !(u.toLowerCase().startsWith(host.toLowerCase() + "/") || u.toLowerCase().startsWith(myHost.toLowerCase() + "/")));
  if (foreign) throw new Error(`Site fora do tenant do cliente: ${foreign}`);
  const permanent = s(fd, "delete") === "permanente";
  const mode = permanent && s(fd, "method") === "JobSharePoint" ? "JobSharePoint" : "PorArquivo";
  const maxFiles = s(fd, "maxFiles") ? int(fd, "maxFiles", 0, 1, 10_000_000) : undefined;

  if (action === "executar") {
    if (fd.get("ack") !== "on") throw new Error("Confirme que revisou o escopo antes de executar.");
    if (permanent && s(fd, "confirmText")?.toUpperCase() !== "EXCLUIR") throw new Error("Para exclusão permanente, digite EXCLUIR no campo de confirmação.");
  }

  const hygiene: HygieneParams = {
    action: "version_cleanup", keep, dryRun: action === "simular", recycle: !permanent, mode, scope, sites,
    ...(s(fd, "sourceExecutionId") ? { sourceExecutionId: s(fd, "sourceExecutionId")! } : {}), ...(maxFiles ? { maxFiles } : {}),
  };
  const params = { ...buildParams({ modules: {}, sites: [], parallel: 1, sitesBatch: 100, clientName: c.name }), hygiene };
  const id = await launchAssessment(clientId, params, me.id, "HIGIENIZACAO");
  await audit(prisma, "Assessment", id, action === "executar" ? "HYGIENE_EXECUTE" : "HYGIENE_SIMULATE", me.id, {
    cliente: c.name, acao: "limpeza de versões", manter: keep, escopo: scope === "tenant" ? "tenant inteiro" : `${sites.length} site(s)`,
    exclusao: permanent ? `permanente (${mode})` : "lixeira", ...(maxFiles ? { limite_arquivos: maxFiles } : {}),
  });
  redirect(`/execucoes/${id}`);
}

export const startHygiene = act(startHygiene_);
