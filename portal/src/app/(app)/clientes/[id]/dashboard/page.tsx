import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientPage } from "@/lib/session";
import { Empty, PageHeader } from "@/components/ui";

export default async function Dashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ execution?: string }> }) {
  const { id } = await params;
  const { execution } = await searchParams;
  await requireClientPage(id);
  const c = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, dbStatus: true } });
  if (!c) notFound();
  const src = `/relatorio/${c.id}?embed=1${execution ? `&execution=${encodeURIComponent(execution)}` : ""}`;
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={<Link className="link" href={`/clientes/${c.id}`}>{c.name}</Link>}
        actions={c.dbStatus === "PROVISIONADO" && <a href={`/relatorio/${c.id}${execution ? `?execution=${encodeURIComponent(execution)}` : ""}`} target="_blank" rel="noopener" className="btn-secondary">Abrir em tela cheia ↗</a>}
      />
      {c.dbStatus !== "PROVISIONADO" ? (
        <Empty>O banco deste cliente ainda não foi provisionado. Rode a primeira execução para gerar o dashboard.</Empty>
      ) : (
        <iframe src={src} title={`Dashboard ${c.name}`} className="h-[calc(100vh-11rem)] w-full rounded-xl border border-slate-200 bg-[#0d1117]" />
      )}
    </>
  );
}
