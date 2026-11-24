import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clientWhere, requirePagePerm } from "@/lib/session";
import { readiness } from "@/lib/assessments";
import { Empty, Field, PageHeader } from "@/components/ui";

/** Nova execução a partir da tela geral: escolhe o cliente e segue para a seleção de workloads. */
export default async function NovaExecucao({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const u = await requirePagePerm("assessments:run");
  const { cliente } = await searchParams;
  if (cliente) redirect(`/clientes/${encodeURIComponent(cliente)}/executar`);
  const clients = (await prisma.client.findMany({ where: { active: true, ...clientWhere(u) }, orderBy: { name: "asc" } }))
    .map((c) => ({ id: c.id, name: c.name, missing: readiness(c) }));
  const ready = clients.filter((c) => !c.missing.length);
  return (
    <>
      <PageHeader title="Nova execução" subtitle="Escolha o cliente; em seguida você seleciona os workloads da coleta." />
      <div className="card max-w-xl">
        {ready.length === 0 ? <Empty>Nenhum cliente pronto para coletar (falta conexão ou credencial). <Link className="link" href="/clientes">Ver clientes</Link></Empty> : (
          <form className="flex flex-wrap items-end gap-3">
            <Field label="Cliente" className="min-w-64 flex-1">
              <select name="cliente" required className="input">{ready.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <button className="btn">Continuar</button>
          </form>
        )}
        {clients.length > ready.length && (
          <p className="mt-4 text-xs text-slate-500">Sem configuração completa: {clients.filter((c) => c.missing.length).map((c) => `${c.name} (${c.missing.join(", ")})`).join("; ")}.</p>
        )}
      </div>
    </>
  );
}
