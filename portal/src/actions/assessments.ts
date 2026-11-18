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
    containers: int(fd, "containers", 4, 1, 16),
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

/**
 * Exclui uma coleta (Administrador): apaga todos os dados dela no banco do cliente e tira do portal. A exclusão roda
 * no coletor (execução EXCLUSAO, em lotes, porque files_info pode ter milhões de linhas); enquanto isso a coleta
 * fica "Excluindo…" e sai do relatório. Se falhar, volta ao status anterior.
 */
async function deleteCollection_(id: string, fd: FormData) {
  const a = await prisma.assessment.findUniqueOrThrow({ where: { id }, include: { client: { select: { name: true } } } });
  const me = await requireClientPerm(a.clientId, "assessments:delete");
  if (a.kind !== "COLETA") throw new Error("Só coletas podem ser excluídas.");
  if ((ACTIVE as readonly string[]).includes(a.status)) throw new Error("A coleta ainda está rodando: cancele antes de excluir.");
  if (a.status === "EXCLUINDO") throw new Error("A exclusão desta coleta já está em andamento.");
  if (String(fd.get("confirmText") ?? "").trim().toUpperCase() !== "EXCLUIR") throw new Error("Digite EXCLUIR para confirmar.");
  const busy = await prisma.assessment.count({ where: { clientId: a.clientId, kind: "EXCLUSAO", status: { in: [...ACTIVE] } } });
  if (busy) throw new Error("Já existe uma exclusão em andamento para este cliente; aguarde terminar.");
  const jobId = await launchAssessment(a.clientId, { delete_execution: id, previous_status: a.status }, me.id, "EXCLUSAO");
  await prisma.assessment.update({ where: { id }, data: { status: "EXCLUINDO", error: null } });
  await audit(prisma, "Assessment", id, "DELETE_REQUEST", me.id, { cliente: a.client.name, coleta: id, inicio: (a.startedAt ?? a.createdAt).toISOString(), exclusao: jobId });
  redirect(`/execucoes/${jobId}`);
}

/** Corrige duplicatas de uma coleta (retomadas antigas) e remonta o relatório. Roda no coletor (MANUTENCAO). */
async function repairCollection_(id: string) {
  const a = await prisma.assessment.findUniqueOrThrow({ where: { id }, include: { client: { select: { name: true } } } });
  const me = await requireClientPerm(a.clientId, "assessments:run");
  if (a.kind !== "COLETA") throw new Error("Só coletas podem ser corrigidas.");
  if ((ACTIVE as readonly string[]).includes(a.status) || a.status === "EXCLUINDO") throw new Error("A coleta ainda está em andamento.");
  const jobId = await launchAssessment(a.clientId, { repair_execution: id }, me.id, "MANUTENCAO");
  await audit(prisma, "Assessment", id, "REPAIR", me.id, { cliente: a.client.name, coleta: id, execucao: jobId });
  redirect(`/execucoes/${jobId}`);
}

export const startAssessment = act(startAssessment_);
export const repairCollection = act(repairCollection_);
export const deleteCollection = act(deleteCollection_);
export const cancelAssessment = act(cancelAssessment_);
export const retryAssessment = act(retryAssessment_);
