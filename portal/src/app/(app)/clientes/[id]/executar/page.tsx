import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPage } from "@/lib/session";
import { AWS_MODULES, GOOGLE_MODULES, MODULES } from "@/lib/collector";
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
  const last = await prisma.assessment.findFirst({ where: { clientId: id, kind: "COLETA", runner: { not: "importado" } }, orderBy: { createdAt: "desc" }, select: { params: true } });
  const prev = last ? (JSON.parse(last.params) as Record<string, unknown>) : null;
  const checked = (k: string, d: boolean) => (prev ? !!prev[k] : d);
  const sites = prev && Array.isArray(prev.sites) ? (prev.sites as string[]).join("\n") : "";

  return (
    <>
      <PageHeader title="Nova execução" subtitle={<><Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link> · roda em {RUNNER_LABEL[RUNNER]}</>} />
      {missing.length > 0 ? (
        <div className="card max-w-2xl text-sm text-amber-900">Antes de executar, configure: {missing.join(", ")}. <Link className="link" href={`/clientes/${c.id}?tab=conexao`}>Ir para a conexão</Link></div>
      ) : (
        c.platform === "AWS" ? (
          <ActionForm action={startAssessment.bind(null, c.id)} className="grid gap-6 lg:grid-cols-3" submit="Iniciar levantamento">
            <section className="card lg:col-span-2">
              <h2 className="card-title">AWS · o que levantar</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {AWS_MODULES.map((m) => (
                  <label key={m.key} className="flex gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                    <input type="checkbox" name={m.key} defaultChecked={checked(m.key, m.default)} className="mt-1" />
                    <span><span className="block text-sm font-medium">{m.label}</span><span className="block text-xs text-slate-500">{m.hint}</span></span>
                  </label>
                ))}
              </div>
            </section>
            <section className="card space-y-2 text-sm text-slate-600">
              <h2 className="card-title">Como funciona</h2>
              <p>Só leitura de inventário e métricas (describe/list): não lemos dados de buckets, bancos nem discos.</p>
              <p>Conta {c.awsAccountId} · regiões: {c.awsRegions ? c.awsRegions.split(",").join(", ") : "todas as habilitadas"}.</p>
              <p>Custos usam o Cost Explorer: a AWS cobra US$ 0,01 por consulta (o levantamento faz uma).</p>
              <p>Contas médias levam poucos minutos; a métrica de CPU de muitas instâncias pode levar mais.</p>
            </section>
          </ActionForm>
        ) :         c.platform === "GOOGLE" ? (
          <ActionForm action={startAssessment.bind(null, c.id)} className="grid gap-6 lg:grid-cols-3" submit="Iniciar levantamento">
            <section className="card lg:col-span-2">
              <h2 className="card-title">Google Workspace · o que levantar</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {GOOGLE_MODULES.map((m) => (
                  <label key={m.key} className="flex gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                    <input type="checkbox" name={m.key} defaultChecked={checked(m.key, m.default)} className="mt-1" />
                    <span><span className="block text-sm font-medium">{m.label}</span><span className="block text-xs text-slate-500">{m.hint}</span></span>
                  </label>
                ))}
              </div>
            </section>
            <section className="card space-y-2 text-sm text-slate-600">
              <h2 className="card-title">Como funciona</h2>
              <p>Os dados vêm dos relatórios do Google já agregados por usuário: não lemos conteúdo de e-mails nem de arquivos.</p>
              <p>Os relatórios de uso do Google têm 2 a 3 dias de atraso: os números são “até anteontem”.</p>
              <p>Mesmo em domínios grandes a coleta costuma levar de minutos a menos de uma hora.</p>
            </section>
          </ActionForm>
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
              <Field label="Containers em paralelo (arquivos)" className="col-span-2"><input name="containers" type="number" min={1} max={16} defaultValue={Number(prev?.files_containers ?? 4)} className="input" /></Field>
            </div>
            <p className="text-xs text-slate-500">
              Com mais de 60 sites, a coleta de arquivos e lixeira é dividida em lotes de até 40 sites (sites muito grandes ficam sozinhos num lote), e até esse número de containers
              trabalha ao mesmo tempo. Cada container usa "Sites em paralelo"; o total de acessos ao SharePoint do cliente é containers × sites em paralelo. Use 1 para não dividir.
            </p>
            <p className="text-xs text-slate-500">Se um container cair no meio, a execução é retomada do ponto em que parou (sites já concluídos não são varridos de novo).</p>
          </section>
        </ActionForm>
        )
      )}
    </>
  );
}
