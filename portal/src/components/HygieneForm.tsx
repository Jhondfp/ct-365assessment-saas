"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ActionForm } from "./ActionForm";
import type { ActResult } from "@/lib/act";

type Cand = { site_url: string; files: number; est_versions: number; est_bytes: number };
type Defaults = { scope?: "tenant" | "sites"; sites?: string[]; permanent?: boolean; method?: "PorArquivo" | "JobSharePoint"; maxFiles?: number };

const GB = 1073741824;
const fmtBytes = (b: number) => (b >= 1024 * GB ? `${(b / (1024 * GB)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} TB` : b >= GB ? `${(b / GB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : `${Math.round(b / 1048576).toLocaleString("pt-BR")} MB`);
const short = (u: string) => u.replace(/^https:\/\/[^/]+/, "");

function Option({ name, value, checked, onChange, title, hint, tone }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; hint: string; tone?: "danger" }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${checked ? (tone === "danger" ? "border-red-400 bg-red-50" : "border-ct-purple bg-ct-purple/5") : "border-slate-200"}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1" />
      <span><span className="block font-medium">{title}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );
}

/** Formulário da limpeza de versões: simular (padrão) ou executar, tenant inteiro ou sites, lixeira ou permanente. */
export function HygieneForm({ action, keep, candidates, source, defaults = {} }: {
  action: (fd: FormData) => Promise<ActResult<unknown>>; keep: number; candidates: Cand[]; source: { id: string; label: string } | null; defaults?: Defaults;
}) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const [acao, setAcao] = useState<"simular" | "executar">("simular");
  const [scope, setScope] = useState<"tenant" | "sites">(defaults.scope ?? "tenant");
  const [permanent, setPermanent] = useState(!!defaults.permanent);
  const [method, setMethod] = useState<"PorArquivo" | "JobSharePoint">(defaults.method ?? "PorArquivo");
  const [picked, setPicked] = useState<Set<string>>(new Set(defaults.sites ?? []));
  const [q, setQ] = useState("");
  const [keepInput, setKeepInput] = useState(String(keep));

  const visible = useMemo(() => candidates.filter((c) => !q || c.site_url.toLowerCase().includes(q.toLowerCase())), [candidates, q]);
  const scoped = scope === "tenant" ? candidates : candidates.filter((c) => picked.has(c.site_url));
  const tot = scoped.reduce((a, c) => ({ files: a.files + c.files, versions: a.versions + c.est_versions, bytes: a.bytes + c.est_bytes }), { files: 0, versions: 0, bytes: 0 });
  const toggle = (u: string) => setPicked((p) => { const n = new Set(p); if (n.has(u)) n.delete(u); else n.add(u); return n; });
  const applyKeep = () => { const q2 = new URLSearchParams(sp.toString()); q2.set("keep", keepInput); router.push(`${path}?${q2.toString()}`); };

  return (
    <ActionForm action={action} className="space-y-6" submit={acao === "simular" ? "Simular limpeza" : permanent ? "Executar exclusão permanente" : "Executar limpeza"}
      submitClass={acao === "executar" ? "btn-danger" : "btn"}
      confirm={acao === "executar" ? `Confirma a ${permanent ? "EXCLUSÃO PERMANENTE" : "limpeza"} de versões ${scope === "tenant" ? "no tenant inteiro" : `em ${picked.size} site(s)`}?` : undefined}>
      <input type="hidden" name="acao" value={acao} />
      <input type="hidden" name="keep" value={keepInput || keep} />
      {source && <input type="hidden" name="sourceExecutionId" value={source.id} />}

      <section className="card space-y-4">
        <h2 className="card-title">1. Regra</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">Versões a manter por arquivo (contando a atual)</span>
            <input value={keepInput} onChange={(e) => setKeepInput(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="input !w-40" />
          </label>
          {String(keep) !== keepInput && keepInput && <><button type="button" onClick={applyKeep} className="btn-secondary">Recalcular estimativa</button><span className="text-xs text-amber-800">A lista e a estimativa abaixo ainda são para {keep} versões.</span></>}
          <p className="text-xs text-slate-500">Arquivos com até {keep} versões não são tocados. A versão atual nunca é apagada.</p>
        </div>
        <p className="text-xs text-slate-500">Candidatos da coleta de {source?.label ?? "—"}. Ficam de fora a Preservation Hold Library e arquivos com rótulo de retenção.</p>
      </section>

      <section className="card space-y-4">
        <h2 className="card-title">2. Escopo</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Option name="scope" value="tenant" checked={scope === "tenant"} onChange={() => setScope("tenant")} title="Tenant inteiro" hint={`Todos os ${candidates.length} sites com arquivos acima de ${keep} versões.`} />
          <Option name="scope" value="sites" checked={scope === "sites"} onChange={() => setScope("sites")} title="Sites selecionados" hint="Escolha na lista abaixo." />
        </div>
        {scope === "sites" && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar sites…" className="input !w-64 !py-1.5" />
              <span className="flex gap-2 text-xs">
                <button type="button" className="btn-secondary btn-sm" onClick={() => setPicked(new Set([...picked, ...visible.map((v) => v.site_url)]))}>Marcar visíveis</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setPicked(new Set())}>Limpar</button>
              </span>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              <table className="tbl">
                <thead className="sticky top-0 bg-white"><tr><th className="w-8" /><th>Site</th><th className="text-right">Arquivos</th><th className="text-right">Versões (estim.)</th><th className="text-right">Espaço (estim.)</th></tr></thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.site_url} className="cursor-pointer" onClick={() => toggle(c.site_url)}>
                      <td><input type="checkbox" name="sites" value={c.site_url} checked={picked.has(c.site_url)} onChange={() => toggle(c.site_url)} onClick={(e) => e.stopPropagation()} /></td>
                      <td className="break-all">{short(c.site_url)}</td>
                      <td className="text-right tabular-nums">{c.files.toLocaleString("pt-BR")}</td>
                      <td className="text-right tabular-nums">{c.est_versions.toLocaleString("pt-BR")}</td>
                      <td className="text-right tabular-nums">{fmtBytes(c.est_bytes)}</td>
                    </tr>
                  ))}
                  {!visible.length && <tr><td colSpan={5} className="text-center text-slate-500">Nenhum site.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="rounded-lg bg-slate-50 p-3 text-sm">
          Estimativa pela coleta: <b>{tot.files.toLocaleString("pt-BR")} arquivos</b>, até <b>{tot.versions.toLocaleString("pt-BR")} versões</b>, cerca de <b>{fmtBytes(tot.bytes)}</b>.
          <span className="block text-xs text-slate-500">É um teto: a coleta estima as versões pelo número da versão. A simulação lê as versões reais e dá o número exato.</span>
        </p>
      </section>

      <section className="card space-y-4">
        <h2 className="card-title">3. Exclusão</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Option name="delete" value="lixeira" checked={!permanent} onChange={() => setPermanent(false)} title="Mandar para a lixeira (recuperável)" hint="As versões vão para a lixeira do site e podem ser restauradas por ~93 dias. O espaço só é liberado quando a lixeira for esvaziada." />
          <Option name="delete" value="permanente" checked={permanent} onChange={() => setPermanent(true)} tone="danger" title="Exclusão permanente" hint="Não passa pela lixeira: libera o espaço na hora e NÃO dá para recuperar." />
        </div>
        {permanent && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Option name="method" value="PorArquivo" checked={method === "PorArquivo"} onChange={() => setMethod("PorArquivo")} title="Por arquivo" hint="Só nos arquivos candidatos, com relatório arquivo a arquivo." />
            <Option name="method" value="JobSharePoint" checked={method === "JobSharePoint"} onChange={() => setMethod("JobSharePoint")} title="Job do SharePoint (site inteiro)" hint="Limpeza oficial do SharePoint em todas as bibliotecas dos sites do escopo. Mais rápido em sites grandes; roda no servidor." />
          </div>
        )}
        <label className="block max-w-xs">
          <span className="label">Limite de arquivos (opcional, para piloto)</span>
          <input name="maxFiles" inputMode="numeric" defaultValue={defaults.maxFiles ?? ""} className="input" placeholder="sem limite" />
        </label>
      </section>

      <section className="card space-y-4">
        <h2 className="card-title">4. Simular ou executar</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Option name="_acao" value="simular" checked={acao === "simular"} onChange={() => setAcao("simular")} title="Simular (recomendado)" hint="Não altera nada no tenant. Mostra exatamente o que seria apagado e quanto libera." />
          <Option name="_acao" value="executar" checked={acao === "executar"} onChange={() => setAcao("executar")} tone="danger" title="Executar" hint="Apaga as versões antigas conforme as escolhas acima." />
        </div>
        {acao === "executar" && (
          <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <label className="flex items-start gap-2 text-sm text-red-900">
              <input type="checkbox" name="ack" required className="mt-1" />
              <span>Revisei o escopo e a simulação, e o cliente está ciente de que as versões antigas serão {permanent ? "apagadas permanentemente" : "enviadas para a lixeira"}.</span>
            </label>
            {permanent && (
              <label className="block max-w-xs text-sm text-red-900">
                <span className="label !text-red-900">Digite EXCLUIR para confirmar a exclusão permanente</span>
                <input name="confirmText" required pattern="[Ee][Xx][Cc][Ll][Uu][Ii][Rr]" autoComplete="off" className="input" />
              </label>
            )}
          </div>
        )}
      </section>
    </ActionForm>
  );
}
