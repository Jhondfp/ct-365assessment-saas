import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, canSeeClient } from "@/lib/session";
import { can } from "@/lib/rbac";
import { reconcile } from "@/lib/assessments";
import { enabledModules } from "@/lib/collector";
import { manualCommand, RUNNER_LABEL, type Runner } from "@/lib/jobs";
import { ACTIVE, parseJson, type LogLine, type Progress } from "@/lib/status";
import { dateTime, duration } from "@/lib/format";
import { cancelAssessment, retryAssessment } from "@/actions/assessments";
import { ActionButton } from "@/components/ActionForm";
import { Badge, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/assessments";
import { LiveAssessment } from "@/components/LiveAssessment";

export default async function Execucao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  await reconcile(id).catch(() => {});
  const a = await prisma.assessment.findUnique({ where: { id }, include: { client: true, startedBy: { select: { name: true, email: true } } } });
  if (!a || !canSeeClient(u, a.clientId)) notFound();
  const params_ = JSON.parse(a.params) as Record<string, unknown>;
  const active = (ACTIVE as readonly string[]).includes(a.status);
  const canRun = can(u.roles, "assessments:run");
  const cmd = a.runner === "manual" && active && can(u.roles, "clients:manage") ? manualCommand(a.id) : null;

  return (
    <>
      <PageHeader
        title={`Execução · ${a.client.name}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status} /> <span className="font-mono text-xs">{a.id}</span></span>}
        actions={<>
          {a.status === "COMPLETED" && <Link className="btn" href={`/clientes/${a.clientId}/dashboard?execution=${a.id}`}>Abrir dashboard</Link>}
          {canRun && active && <ActionButton action={cancelAssessment.bind(null, a.id)} className="btn-danger" confirm="Cancelar esta execução? O container será parado.">Cancelar</ActionButton>}
          {canRun && (a.status === "FAILED" || a.status === "CANCELED") && <ActionButton action={retryAssessment.bind(null, a.id)} className="btn">Executar de novo</ActionButton>}
        </>}
      />
      <div className="card mb-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="label">Cliente</p><Link className="link" href={`/clientes/${a.clientId}`}>{a.client.name}</Link></div>
        <div><p className="label">Início · duração</p>{dateTime(a.startedAt ?? a.createdAt)} · {a.startedAt ? duration(a.startedAt, a.finishedAt) : "—"}</div>
        <div><p className="label">Onde roda</p>{RUNNER_LABEL[a.runner as Runner] ?? a.runner}{a.runnerRef && <span className="block font-mono text-xs text-slate-500">{a.runnerRef}</span>}</div>
        <div><p className="label">Disparada por</p>{a.startedBy?.name ?? a.startedBy?.email ?? "—"}</div>
        <div className="sm:col-span-2 lg:col-span-4"><p className="label">Módulos</p><div className="flex flex-wrap gap-1">{enabledModules(params_).map((m) => <Badge key={m} tone="purple">{m}</Badge>)}</div></div>
      </div>
      {a.error && <p className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-800 whitespace-pre-wrap">{a.error}</p>}
      {cmd && (
        <div className="card mb-6">
          <h2 className="card-title">Execução manual</h2>
          <p className="muted mb-2">O portal está em JOB_RUNNER=manual. Rode o coletor numa máquina com acesso a este portal (ex.: dentro da rede do cliente):</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">{cmd.docker}</pre>
          <p className="muted my-2">ou, sem Docker, a partir da pasta job/ do repositório (PowerShell 7 + PnP.PowerShell):</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs">{cmd.pwsh}</pre>
        </div>
      )}
      <LiveAssessment
        id={a.id}
        initial={{ status: a.status, attempts: a.attempts, error: a.error, heartbeatAt: a.heartbeatAt?.toISOString() ?? null, progress: parseJson<Progress | null>(a.progress, null), log: parseJson<LogLine[]>(a.logTail, []) }}
      />
    </>
  );
}
