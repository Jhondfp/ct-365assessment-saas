import { redirect } from "next/navigation";

/** Endereço antigo do dashboard (iframe): agora é o relatório nativo. O clássico continua em /relatorio/[id]. */
export default async function Dashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ execution?: string }> }) {
  const { id } = await params;
  const { execution } = await searchParams;
  redirect(`/clientes/${id}/relatorio${execution ? `?execucao=${encodeURIComponent(execution)}` : ""}`);
}
