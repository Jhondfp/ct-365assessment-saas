"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act } from "@/lib/act";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { int, s } from "@/lib/form";
import { requireClientPerm } from "@/lib/session";
import { buildParams, MODULES, type ModuleKey } from "@/lib/collector";
import { launchAssessment } from "@/lib/assessments";
import { stopJob } from "@/lib/jobs";
import { ACTIVE } from "@/lib/status";

const lines = (v: string | null) => (v ?? "").split(/[\r\n,;]+/).map((x) => x.trim()).filter(Boolean);

async function startAssessment_(clientId: string, fd: FormData) {
  const me = await requireClientPerm(clientId, "assessments:run");
  const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const modules = Object.fromEntries(MODULES.map((m) => [m.key, fd.get(m.key) === "on"])) as Record<ModuleKey, boolean>;
  if (!Object.values(modules).some(Boolean)) throw new Error("Escolha ao menos um módulo.");
  if (modules.process_owner_status && !modules.process_sites_info) throw new Error("Donos ativos depende do módulo Sites e subsites.");
  if (modules.process_onedrive && !modules.process_sites_info) throw new Error("OneDrive entra pela lista de sites: marque também Sites e subsites.");
  if ((modules.process_sites || modules.process_subsites || modules.process_recycle_bin) && !modules.process_sites_info)
    throw new Error("Arquivos e lixeira usam a lista de sites coletada pelo módulo Sites e subsites: marque-o também.");
  const sites = lines(s(fd, "sites"));
  const bad = sites.find((u) => !/^https:\/\/[^/]+\.sharepoint\.com\//i.test(u));
  if (bad) throw new Error(`URL de site inválida: ${bad}`);
  const params = buildParams({
    modules, sites,
    parallel: int(fd, "parallel", 8, 1, 16), sitesBatch: int(fd, "sitesBatch", 100, 10, 1000), clientName: c.name,
  });
  const id = await launchAssessment(clientId, params, me.id);
  await audit(prisma, "Assessment", id, "CREATE", me.id, { cliente: c.name, modulos: Object.entries(modules).filter(([, v]) => v).map(([k]) => k).join(",") });
  redirect(`/execucoes/${id}`);
}

async function cancelAssessment_(id: string) {
  const a = await prisma.assessment.findUniqueOrThrow({ where: { id } });
  const me = await requireClientPerm(a.clientId, "assessments:run");
  if (!(ACTIVE as readonly string[]).includes(a.status)) throw new Error("Esta execução já terminou.");
  try { await stopJob(a.runner, a.runnerRef); } catch (e) { console.error(e); }
  await prisma.assessment.update({ where: { id }, data: { status: "CANCELED", finishedAt: new Date(), error: `Cancelada por ${me.name ?? me.email}.` } });
  await audit(prisma, "Assessment", id, "CANCEL", me.id);
  revalidatePath(`/execucoes/${id}`);
  return "Execução cancelada.";
}

/** Recomeça uma execução que falhou/foi cancelada com os mesmos parâmetros. O coletor retoma os sites já concluídos. */
async function retryAssessment_(id: string) {
  const a = await prisma.assessment.findUniqueOrThrow({ where: { id } });
  const me = await requireClientPerm(a.clientId, "assessments:run");
  if (a.runner === "importado") throw new Error("Execução importada do banco do cliente: use Nova execução para coletar de novo.");
  if (a.kind === "HIGIENIZACAO" && !(JSON.parse(a.params)?.hygiene?.dryRun)) throw new Error("Para executar uma higienização de novo, use o formulário da aba Higienização (exige confirmação).");
  const kind = a.kind === "DIAGNOSTICO" || a.kind === "HIGIENIZACAO" ? a.kind : "COLETA";
  const newId = await launchAssessment(a.clientId, JSON.parse(a.params), me.id, kind);
  await audit(prisma, "Assessment", newId, "CREATE", me.id, { repeticao_de: id });
  redirect(`/execucoes/${newId}`);
}

export const startAssessment = act(startAssessment_);
export const cancelAssessment = act(cancelAssessment_);
export const retryAssessment = act(retryAssessment_);
