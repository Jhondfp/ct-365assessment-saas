"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LogLine, Preflight, Progress, Workload } from "@/lib/status";
import { GOOGLE_SCOPES } from "@/lib/setupGuides";

type Data = {
  status: string; attempts: number; error: string | null; heartbeatAt: string | null;
  progress: Progress | null; log: LogLine[]; workloads: Record<string, Workload> | null; preflight: Preflight | null;
  batches?: Batches | null;
};
export type Batches = { total: number; queued: number; running: number; done: number; failed: number; sites: number; sitesDone: number; containers: number };
const ACTIVE = ["QUEUED", "STARTING", "RUNNING"];
const LEVEL: Record<string, string> = { ERROR: "text-red-400", CRITICAL: "text-fuchsia-400", WARNING: "text-amber-300", SUCCESS: "text-lime-300", DEBUG: "text-slate-500" };
/** Etapa do global_status.json do coletor que mostra o progresso de cada workload. */
const STEP: Record<string, string> = {
  licensing: "Coleta de Licenciamento", adoption: "Coleta de Adocao", mailbox: "Coleta de Caixas de Email", intune: "Intune - Coleta",
  sites: "Coleta de Sites", owner_status: "Verificacao de Donos Ativos", files: "Coleta de Arquivos", trash: "Coleta de Lixeiras",
  g_identity: "Google · Identidades", g_usage: "Google · E-mail e Drive",
  aws_account: "AWS · Conta e segurança", aws_compute: "AWS · Computação", aws_usage: "AWS · Uso de CPU", aws_storage: "AWS · Armazenamento",
  aws_database: "AWS · Bancos de dados", aws_network: "AWS · Rede", aws_cost: "AWS · Custos",
};
const W_STYLE: Record<Workload["status"], { dot: string; text: string; label: string }> = {
  pending: { dot: "bg-slate-300", text: "text-slate-500", label: "Aguardando" },
  running: { dot: "bg-ct-purple animate-pulse", text: "text-ct-purple", label: "Em execução" },
  ok: { dot: "bg-ct-green", text: "text-lime-700", label: "Concluído" },
  failed: { dot: "bg-red-500", text: "text-red-700", label: "Falhou" },
  skipped: { dot: "bg-amber-400", text: "text-amber-700", label: "Pulado" },
};
const fmtSec = (s?: number) => (!s ? "" : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

/** Acompanha a execução: workloads, checagem prévia e log (polling a cada 5 s enquanto ativa). */
export function LiveAssessment({ id, initial, diagnostic }: { id: string; initial: Data; diagnostic?: boolean }) {
  const [d, setD] = useState<Data>(initial);
  const [filter, setFilter] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (!ACTIVE.includes(d.status)) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/execucoes/${id}`, { cache: "no-store" });
        if (!r.ok) return;
        const n: Data = await r.json();
        setD(n);
        if (!ACTIVE.includes(n.status)) router.refresh();
      } catch { /* rede instável: tenta no próximo ciclo */ }
    }, 5000);
    return () => clearInterval(t);
  }, [id, d.status, router]);

  const steps = d.progress?.Steps ?? {};
  const workloads = Object.entries(d.workloads ?? {});
  const log = filter ? d.log.filter((l) => l.level === filter) : d.log;
  const waiting = ACTIVE.includes(d.status) && !d.preflight && !workloads.length;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-2">
        {!diagnostic && (
          <section className="card">
            <h2 className="card-title">Workloads</h2>
            {waiting ? <p className="muted">{d.status === "QUEUED" ? "Na fila: aguardando um worker livre…" : "Preparando a coleta…"}</p>
              : workloads.length === 0 ? <LegacySteps steps={steps} />
              : (
                <ul className="divide-y divide-slate-100">
                  {workloads.map(([wid, w]) => {
                    const st = W_STYLE[w.status] ?? W_STYLE.pending;
                    const step = steps[STEP[wid]];
                    const pct = w.status === "ok" ? 100 : Math.max(0, Math.min(100, Number(step?.Progress ?? 0)));
                    return (
                      <li key={wid} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-sm font-medium"><span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />{w.label}</span>
                          <span className={`text-xs font-medium ${st.text}`}>{st.label}{w.seconds ? ` · ${fmtSec(w.seconds)}` : ""}</span>
                        </div>
                        {w.status === "running" && (
                          <>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-ct-purple transition-all" style={{ width: `${pct}%` }} /></div>
                            {step?.Info && <p className="mt-1 text-xs text-slate-500">{step.Info}</p>}
                          </>
                        )}
                        {w.status === "ok" && w.detail && <p className="mt-1 text-xs text-slate-500">{w.detail}</p>}
                        {(w.status === "failed" || w.status === "skipped") && w.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{w.detail}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            {d.batches && <BatchesCard b={d.batches} active={ACTIVE.includes(d.status)} />}
            {d.attempts > 1 && <p className="mt-4 rounded-lg bg-sky-50 p-2 text-xs text-sky-900">Retomada nº {d.attempts - 1}: o worker reiniciou e a coleta continuou do ponto em que parou.</p>}
          </section>
        )}
        <PreflightCard p={d.preflight} active={ACTIVE.includes(d.status)} />
      </div>
      <section className="card lg:col-span-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title !mb-0">Log</h2>
          <div className="flex items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input !w-auto !py-1 text-xs" aria-label="Filtrar nível">
              <option value="">Todos os níveis</option>
              {["ERROR", "WARNING", "SUCCESS", "INFO", "CRITICAL"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="h-[30rem] overflow-y-auto rounded-lg bg-ct-ink p-3 font-mono text-[11px] leading-relaxed text-slate-200">
          {log.length === 0 ? <p className="text-slate-500">Sem linhas de log ainda.</p> : log.slice().reverse().map((l, i) => (
            <p key={i} className="whitespace-pre-wrap break-words">
              <span className="text-slate-500">{l.ts.slice(11, 19)}</span> <span className={LEVEL[l.level] ?? "text-slate-300"}>{l.level.padEnd(7)}</span> <span className="text-ct-orange">[{l.module}]</span> {l.message}
            </p>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Últimas 500 linhas, mais recentes primeiro. O log completo fica disponível para download quando a execução termina.</p>
      </section>
    </div>
  );
}

function LegacySteps({ steps }: { steps: Record<string, { Status?: string; Progress?: number; Info?: string }> }) {
  const list = Object.entries(steps);
  if (!list.length) return <p className="muted">Sem etapas registradas.</p>;
  return (
    <ul className="space-y-3">
      {list.map(([name, s]) => (
        <li key={name}>
          <div className="flex justify-between text-sm"><span className="font-medium">{name}</span><span className="text-xs text-slate-500">{Number(s.Progress ?? 0)}%</span></div>
          {s.Info && <p className="text-xs text-slate-500">{s.Info}</p>}
        </li>
      ))}
    </ul>
  );
}

const PERM_GROUPS: { label: string; any: string[] }[] = [
  { label: "SharePoint · Sites.FullControl.All", any: ["SharePoint:Sites.FullControl.All"] },
  { label: "Graph · Directory.Read.All ou Organization.Read.All", any: ["Graph:Directory.Read.All", "Graph:Organization.Read.All"] },
  { label: "Graph · User.Read.All ou Directory.Read.All", any: ["Graph:User.Read.All", "Graph:Directory.Read.All"] },
  { label: "Graph · Reports.Read.All", any: ["Graph:Reports.Read.All"] },
  { label: "Graph · DeviceManagementManagedDevices.Read.All", any: ["Graph:DeviceManagementManagedDevices.Read.All", "Graph:DeviceManagementManagedDevices.ReadWrite.All"] },
];

export function PreflightCard({ p }: { p: Preflight | null; active?: boolean }) {
  if (!p || (!p.graph && !p.sharepoint && !p.database && !p.permissions)) return null;
  const row = (label: string, c: { ok: boolean; detail?: string } | null) => c && (
    <li className="flex gap-2 py-1.5 text-sm">
      <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${c.ok ? "bg-lime-100 text-lime-800" : "bg-red-100 text-red-700"}`}>{c.ok ? "✓" : "✕"}</span>
      <span><span className="font-medium">{label}</span>{c.detail && <span className="block break-words text-xs text-slate-500">{c.detail}</span>}</span>
    </li>
  );
  const granted = p.permissions?.granted ?? [];
  const google = granted.some((g) => g.startsWith("Google:")) || p.graph?.detail?.startsWith("Google Workspace");
  const aws = granted.some((g) => g.startsWith("AWS:")) || p.graph?.detail?.startsWith("AWS");
  if (aws) {
    return (
      <section className="card">
        <h2 className="card-title">Checagem prévia</h2>
        <ul>{row("Conta AWS e chave", p.graph)}{row("Banco do cliente", p.database)}</ul>
        {p.permissions && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="label">Permissões testadas</p>
            <ul className="space-y-1">{granted.map((g) => <li key={g} className="flex items-center gap-2 font-mono text-[11px] text-slate-700"><span>✓</span>{g.replace("AWS:", "")}</li>)}</ul>
            {p.permissions.detail && <p className="mt-2 text-xs text-amber-800">{p.permissions.detail}</p>}
            <p className="mt-2 text-xs text-slate-500">O Cost Explorer (ce:GetCostAndUsage) só é testado no módulo de custos: cada consulta é cobrada pela AWS.</p>
          </div>
        )}
      </section>
    );
  }
  if (google) {
    return (
      <section className="card">
        <h2 className="card-title">Checagem prévia</h2>
        <ul>{row("Google Workspace", p.graph)}{row("Banco do cliente", p.database)}</ul>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="label">Escopos da delegação</p>
          <ul className="space-y-1">
            {GOOGLE_SCOPES.map((s) => {
              const short = s.replace("https://www.googleapis.com/auth/", "");
              const ok = granted.includes(`Google:${short}`);
              return <li key={s} className={`flex items-center gap-2 font-mono text-[11px] ${ok ? "text-slate-700" : "text-amber-800"}`}><span>{ok ? "✓" : "—"}</span>{short}{!ok && <span className="font-sans"> (sem delegação)</span>}</li>;
            })}
          </ul>
        </div>
      </section>
    );
  }
  return (
    <section className="card">
      <h2 className="card-title">Checagem prévia</h2>
      <ul>
        {row("Microsoft Graph", p.graph)}
        {row("SharePoint Admin (PnP)", p.sharepoint)}
        {row("Banco do cliente", p.database)}
      </ul>
      {p.permissions && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="label">Permissões de aplicativo concedidas</p>
          {!p.permissions.checked ? (
            <p className="text-xs text-slate-500">Não foi possível ler as permissões do app{p.permissions.detail ? `: ${p.permissions.detail}` : ""}. A coleta segue mesmo assim.</p>
          ) : (
            <ul className="space-y-1">
              {PERM_GROUPS.map((g) => {
                const ok = g.any.some((x) => granted.includes(x));
                return <li key={g.label} className={`flex items-center gap-2 text-xs ${ok ? "text-slate-700" : "text-amber-800"}`}><span>{ok ? "✓" : "—"}</span>{g.label}{!ok && " (faltando)"}</li>;
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Coleta dividida em lotes: quantos lotes/sites concluídos e quantos containers trabalhando agora. */
function BatchesCard({ b, active }: { b: Batches; active: boolean }) {
  const pct = b.sites ? Math.round((b.sitesDone / b.sites) * 100) : 0;
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Arquivos em lotes paralelos</span>
        {active && b.containers > 0 && <span className="text-xs font-medium text-ct-purple">{b.containers} container(s) trabalhando</span>}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-ct-purple transition-all" style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-xs text-slate-500">
        {b.sitesDone.toLocaleString("pt-BR")} de {b.sites.toLocaleString("pt-BR")} sites · {b.done} de {b.total} lotes concluídos
        {b.running ? ` · ${b.running} em andamento` : ""}{b.queued ? ` · ${b.queued} na fila` : ""}{b.failed ? ` · ${b.failed} com falha` : ""}
      </p>
    </div>
  );
}
