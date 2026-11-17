import { clientConn } from "@/lib/clientDb";
import { hygieneItems, ITEM_STATUS, type HygieneParams, type HygieneResult } from "@/lib/hygiene";
import { bytes, num } from "@/lib/insights";
import { Stat } from "@/components/charts";
import { DataTable } from "@/components/DataTable";

/** Resultado de uma higienização: parâmetros, resumo e lista arquivo a arquivo (dbo.hygiene_version_items). */
export async function HygieneResultView({ runId, client, params, result }: {
  runId: string; client: { id: string; slug: string; dbMode: string; dbServer: string | null; dbUser: string | null; dbName: string | null };
  params: HygieneParams | undefined; result: HygieneResult | null;
}) {
  let items: Awaited<ReturnType<typeof hygieneItems>> = [];
  try { items = await hygieneItems(await clientConn(client), runId); } catch { /* banco indisponível */ }
  const dry = params?.dryRun ?? true;
  const rows = items.map((i) => ({ ...i, status: ITEM_STATUS[i.status] ?? i.status, site: i.site_url.replace(/^https:\/\/[^/]+/, ""), arquivo: i.file_url.split("/").pop() }));
  return (
    <div className="mb-6 space-y-6">
      <div className={`rounded-xl border p-4 text-sm ${dry ? "border-sky-200 bg-sky-50 text-sky-900" : params?.recycle ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900"}`}>
        <b>{dry ? "Simulação — nada foi alterado no tenant." : params?.recycle ? "Execução — versões enviadas para a lixeira dos sites (recuperáveis por ~93 dias)." : "Execução — exclusão PERMANENTE."}</b>{" "}
        Limpeza de versões: manter {params?.keep} por arquivo · {params?.scope === "sites" ? `${params.sites.length} site(s)` : "tenant inteiro"}
        {params && !params.recycle && <> · {params.mode === "JobSharePoint" ? "job do SharePoint (site inteiro)" : "por arquivo"}</>}
        {params?.maxFiles ? <> · limite de {num(params.maxFiles)} arquivos</> : null}.
      </div>
      {result && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label={dry ? "Versões a apagar" : "Versões apagadas"} value={num(result.versoes)} />
          <Stat label={dry ? "Espaço a liberar" : "Espaço liberado"} value={bytes(result.bytes)} hint={!dry && params?.recycle ? "liberado quando a lixeira for esvaziada" : undefined} tone="ok" />
          <Stat label="Arquivos afetados" value={num(result.arquivos_alterados)} hint={`de ${num(result.arquivos)} candidatos`} />
          <Stat label="Sites" value={num(result.sites)} />
          <Stat label="Protegidos / erros" value={`${num(result.protegidos)} / ${num(result.erros)}`} tone={result.erros ? "warn" : undefined} />
        </div>
      )}
      {params?.mode === "JobSharePoint" && !dry && <p className="text-sm text-slate-600">No modo job do SharePoint a limpeza roda no servidor depois de enfileirada; os números acima são a estimativa da leitura por arquivo. Uma nova coleta mostra o resultado final.</p>}
      <section className="card">
        <h2 className="card-title">Arquivos</h2>
        <DataTable file={`higienizacao-${runId.slice(0, 8)}`} initialSort={{ key: "bytes", dir: "desc" }} cols={[
          { key: "arquivo", label: "Arquivo", kind: "link", hrefKey: "file_url" }, { key: "site", label: "Site" },
          { key: "versions_before", label: "Versões antes", kind: "num" }, { key: "versions_deleted", label: dry ? "A apagar" : "Apagadas", kind: "num" },
          { key: "bytes", label: "Espaço", kind: "bytes" }, { key: "status", label: "Situação" }, { key: "detail", label: "Detalhe" },
        ]} rows={rows} empty="Nenhum item registrado ainda." />
      </section>
    </div>
  );
}
