import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPage } from "@/lib/session";
import { MODULES } from "@/lib/collector";
import { readiness } from "@/lib/assessments";
import { RUNNER, RUNNER_LABEL } from "@/lib/jobs";
import { startAssessment } from "@/actions/assessments";
import { ActionForm } from "@/components/ActionForm";
import { Field, PageHeader } from "@/components/ui";

export default async function Executar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireClientPage(id, "assessments:run");
  const c = await prisma.client.findUnique({ where: { id } });
  if (!c) notFound();
  const missing = readiness(c);
  // reaproveita os módulos da última execução como ponto de partida
  const last = await prisma.assessment.findFirst({ where: { clientId: id }, orderBy: { createdAt: "desc" }, select: { params: true } });
  const prev = last ? (JSON.parse(last.params) as Record<string, unknown>) : null;
  const checked = (k: string, d: boolean) => (prev ? !!prev[k] : d);
  const sites = prev && Array.isArray(prev.sites) ? (prev.sites as string[]).join("\n") : "";

  return (
    <>
      <PageHeader title="Nova execução" subtitle={<><Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link> · roda em {RUNNER_LABEL[RUNNER]}</>} />
      {missing.length > 0 ? (
        <div className="card max-w-2xl text-sm text-amber-900">Antes de executar, configure: {missing.join(", ")}. <Link className="link" href={`/clientes/${c.id}?tab=conexao`}>Ir para a conexão</Link></div>
      ) : (
        <ActionForm action={startAssessment.bind(null, c.id)} className="grid gap-6 lg:grid-cols-3" submit="Iniciar execução">
          <section className="card lg:col-span-2">
            <h2 className="card-title">Workloads a coletar</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODULES.map((m) => (
                <label key={m.key} className="flex gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                  <input type="checkbox" name={m.key} defaultChecked={checked(m.key, m.default)} className="mt-1" />
                  <span><span className="block text-sm font-medium">{m.label}</span><span className="block text-xs text-slate-500">{m.hint}</span></span>
                </label>
              ))}
            </div>
          </section>
          <section className="card space-y-4">
            <h2 className="card-title">Escopo e desempenho</h2>
            <Field label="Sites específicos (um por linha; vazio = todos)"><textarea name="sites" rows={4} defaultValue={sites} className="input font-mono text-xs" placeholder="https://contoso.sharepoint.com/sites/financeiro" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sites em paralelo"><input name="parallel" type="number" min={1} max={16} defaultValue={Number(prev?.sites_parallel_size ?? 8)} className="input" /></Field>
              <Field label="Lote de sites"><input name="sitesBatch" type="number" min={10} max={1000} defaultValue={Number(prev?.sites_batch_size ?? 100)} className="input" /></Field>
            </div>
            <p className="text-xs text-slate-500">Se o container cair no meio, a execução é retomada do ponto em que parou (sites já concluídos não são varridos de novo).</p>
          </section>
        </ActionForm>
      )}
    </>
  );
}
