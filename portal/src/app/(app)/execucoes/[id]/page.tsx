import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canSeeClient } from "@/lib/session";
import { can } from "@/lib/rbac";
import { reconcile } from "@/lib/assessments";
import { enabledModules } from "@/lib/collector";
import { manualCommand, RUNNER_LABEL, type Runner } from "@/lib/jobs";
import { ACTIVE, HAS_DATA, parseJson, type LogLine, type Preflight, type Progress, type Workload } from "@/lib/status";
import { explainError } from "@/lib/errors";
import { dateTime, duration } from "@/lib/format";
import { cancelAssessment, retryAssessment } from "@/actions/assessments";
import { ActionButton } from "@/components/ActionForm";
import { Badge, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/assessments";
import { LiveAssessment } from "@/components/LiveAssessment";
import { HygieneResultView } from "@/components/HygieneResult";
import { taskSummary } from "@/lib/tasks";
import { DeleteCollection } from "@/components/DeleteCollection";
import type { HygieneParams, HygieneResult } from "@/lib/hygiene";

export default async function Execucao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  await reconcile(id).catch(() => {});
  const a = await prisma.assessment.findUnique({
    where: { id },
    include: { client: true, startedBy: { select: { name: true, email: true } }, fullLog: { select: { size: true } } },
  });
  if (!a || !canSeeClient(u, a.clientId)) notFound();
  const params_ = parseJson<Record<string, unknown>>(a.params, {});
  const active = (ACTIVE as readonly string[]).includes(a.status);
  const hasData = (HAS_DATA as readonly string[]).includes(a.status);
  const diagnostic = a.kind === "DIAGNOSTICO";
  const hygiene = a.kind === "HIGIENIZACAO";
  const deletion = a.kind === "EXCLUSAO";
  const canDelete = a.kind === "COLETA" && !active && a.status !== "EXCLUINDO" && can(u.roles, "assessments:delete");
  const hp = (params_ as { hygiene?: HygieneParams }).hygiene;
  const imported = a.runner === "importado";
  const canRun = can(u.roles, "assessments:run");
  const cmd = a.runner === "manual" && active && can(u.roles, "clients:manage") ? manualCommand(a.id) : null;
  const explained = explainError(a.error);
  const lotes = await taskSummary(a.id);

  return (
    <>
      <PageHeader
        title={deletion ? `Exclusão de coleta · ${a.client.name}` : hygiene ? `${hp?.dryRun ? "Simulação de higienização" : "Higienização"} · ${a.client.name}` : diagnostic ? `Diagnóstico · ${a.client.name}` : `Execução · ${a.client.name}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status} run={a} /><span>{dateTime(a.startedAt ?? a.createdAt)}</span>{a.startedAt && (a.finishedAt || active) && <span className="text-slate-400">· {duration(a.startedAt, a.finishedAt)}</span>}</span>}
        actions={<>
          {hasData && !diagnostic && !hygiene && !deletion && <Link className="btn" href={`/clientes/${a.clientId}/relatorio?execucao=${a.id}`}>Ver relatório</Link>}
          {hygiene && !active && canRun && <Link className={hp?.dryRun && hasData ? "btn" : "btn-secondary"} href={`/clientes/${a.clientId}?tab=higienizacao&from=${a.id}&keep=${hp?.keep ?? 100}`}>{hp?.dryRun ? "Executar com estes parâmetros" : "Repetir pelo formulário"}</Link>}
          {a.fullLog && <a className="btn-secondary" href={`/api/execucoes/${a.id}/log`}>Baixar log completo</a>}
          {canRun && active && <ActionButton action={cancelAssessment.bind(null, a.id)} className="btn-danger" confirm="Cancelar esta execução?">Cancelar</ActionButton>}
          {canRun && !imported && !hygiene && !deletion && a.status !== "EXCLUINDO" && !active && a.status !== "COMPLETED" && <ActionButton action={retryAssessment.bind(null, a.id)} className="btn-secondary">{diagnostic ? "Rodar diagnóstico de novo" : "Executar de novo"}</ActionButton>}
        </>}
      />

      {a.error && !active && (
        <div className={`mb-6 rounded-xl border p-4 ${a.status === "PARTIAL" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
          {explained && <p className={`font-medium ${a.status === "PARTIAL" ? "text-amber-900" : "text-red-900"}`}>{explained.title}</p>}
          {explained && <p className="mt-0.5 text-sm text-slate-700">{explained.hint}</p>}
          {!explained && a.status === "PARTIAL" && <p className="font-medium text-amber-900">Alguns workloads não foram concluídos</p>}
          <details className={explained || a.status === "PARTIAL" ? "mt-2" : ""} open={!explained && a.status !== "PARTIAL"}>
            <summary className="cursor-pointer text-xs text-slate-500">{explained || a.status === "PARTIAL" ? "Detalhe técnico" : "Erro"}</summary>
            <p className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-slate-700">{a.error}</p>
          </details>
        </div>
      )}
      {diagnostic && a.status === "COMPLETED" && (
        <div className="mb-6 rounded-xl border border-lime-200 bg-lime-50 p-4 text-sm text-lime-900">Conexão OK: o worker autenticou no Microsoft 365, leu as permissões, entrou no SharePoint Admin e acessou o banco do cliente.</div>
      )}

      {a.status === "EXCLUINDO" && <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Esta coleta está sendo excluída: os dados dela estão sendo apagados do banco do cliente e ela já não aparece no relatório. Quando terminar, some do portal.</div>}
      {deletion && <div className={`mb-6 rounded-xl border p-4 text-sm ${a.status === "COMPLETED" ? "border-lime-200 bg-lime-50 text-lime-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
        {a.status === "COMPLETED" ? "Coleta excluída: os dados foram apagados do banco do cliente e ela saiu do portal." : "Apagando os dados da coleta no banco do cliente, tabela por tabela (em lotes). Em bancos grandes pode levar alguns minutos."}
        {parseJson<{ linhas?: number } | null>(a.result, null)?.linhas != null && <> {Number(parseJson<{ linhas?: number }>(a.result, {}).linhas).toLocaleString("pt-BR")} linhas removidas.</>}
      </div>}
      {canDelete && <DeleteCollection id={a.id} />}
      {hygiene && <HygieneResultView runId={a.id} client={a.client} params={hp} result={parseJson<HygieneResult | null>(a.result, null)} />}

      {cmd && (
        <div className="card mb-6">
          <h2 className="card-title">Execução manual</h2>
          <p className="muted mb-2">O portal está em JOB_RUNNER=manual. Rode o coletor numa máquina com acesso a este portal:</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">{cmd.docker}</pre>
          <p className="muted my-2">ou, sem Docker, a partir da pasta job/ do repositório (PowerShell 7 + PnP.PowerShell):</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">{cmd.pwsh}</pre>
        </div>
      )}

      <LiveAssessment
        id={a.id}
        diagnostic={diagnostic || deletion}
        initial={{
          status: a.status, attempts: a.attempts, error: a.error, heartbeatAt: a.heartbeatAt?.toISOString() ?? null,
          progress: parseJson<Progress | null>(a.progress, null), log: parseJson<LogLine[]>(a.logTail, []),
          workloads: parseJson<Record<string, Workload> | null>(a.workloads, null), preflight: parseJson<Preflight | null>(a.preflight, null),
          batches: lotes.total ? { total: lotes.total, queued: lotes.queued, running: lotes.running, done: lotes.done, failed: lotes.failed, sites: lotes.sites, sitesDone: lotes.sitesDone, containers: lotes.containers } : null,
        }}
      />

      <details className="card mt-6">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">Detalhes da execução</summary>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="label">Cliente</dt><dd><Link className="link" href={`/clientes/${a.clientId}`}>{a.client.name}</Link></dd></div>
          <div><dt className="label">Disparada por</dt><dd>{a.startedBy?.name ?? a.startedBy?.email ?? (imported ? "fora do portal" : "—")}</dd></div>
          <div><dt className="label">Onde rodou</dt><dd>{RUNNER_LABEL[a.runner as Runner | "importado"] ?? a.runner}{a.runnerRef && <span className="block font-mono text-xs text-slate-500">{a.runnerRef}</span>}</dd></div>
          <div><dt className="label">Identificador</dt><dd className="break-all font-mono text-xs">{a.id}</dd></div>
          {!diagnostic && !hygiene && !deletion && (
            <div className="sm:col-span-2 lg:col-span-4"><dt className="label">Workloads solicitados</dt><dd className="flex flex-wrap gap-1">{imported ? <span className="muted">Não registrados (execução feita fora do portal).</span> : enabledModules(params_).map((m) => <Badge key={m} tone="purple">{m}</Badge>)}</dd></div>
          )}
          {Array.isArray(params_.sites) && (params_.sites as string[]).length > 0 && (
            <div className="sm:col-span-2 lg:col-span-4"><dt className="label">Sites específicos</dt><dd className="font-mono text-xs">{(params_.sites as string[]).join(", ")}</dd></div>
          )}
        </dl>
      </details>
    </>
  );
}
