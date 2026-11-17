"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LogLine, Progress } from "@/lib/status";

type Data = { status: string; attempts: number; error: string | null; heartbeatAt: string | null; progress: Progress | null; log: LogLine[] };
const ACTIVE = ["QUEUED", "STARTING", "RUNNING"];
const LEVEL: Record<string, string> = { ERROR: "text-red-400", CRITICAL: "text-fuchsia-400", WARNING: "text-amber-300", SUCCESS: "text-lime-300", DEBUG: "text-slate-500" };

/** Acompanha a execução: etapas do global_status.json do coletor e as últimas linhas do log (polling a cada 5 s). */
export function LiveAssessment({ id, initial }: { id: string; initial: Data }) {
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

  const steps = Object.entries(d.progress?.Steps ?? {});
  const log = filter ? d.log.filter((l) => l.level === filter) : d.log;
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="card lg:col-span-2">
        <h2 className="card-title">Etapas</h2>
        {steps.length === 0 ? (
          <p className="muted">{ACTIVE.includes(d.status) ? "Aguardando o coletor iniciar…" : "Sem etapas registradas."}</p>
        ) : (
          <ul className="space-y-4">
            {steps.map(([name, s]) => {
              const pct = Math.max(0, Math.min(100, Number(s.Progress ?? 0)));
              const done = /complet|conclu|success/i.test(s.Status ?? "") || pct >= 100;
              const fail = /fail|erro/i.test(s.Status ?? "");
              return (
                <li key={name}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{name}</span>
                    <span className={`text-xs ${fail ? "text-red-700" : done ? "text-lime-700" : "text-slate-500"}`}>{pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${fail ? "bg-red-500" : done ? "bg-ct-green" : "bg-ct-purple"}`} style={{ width: `${pct}%` }} />
                  </div>
                  {s.Info && <p className="mt-1 text-xs text-slate-500">{s.Info}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {d.attempts > 1 && <p className="mt-4 rounded-lg bg-sky-50 p-2 text-xs text-sky-900">Retomada nº {d.attempts - 1}: o container reiniciou e o coletor continuou do ponto em que parou.</p>}
      </section>
      <section className="card lg:col-span-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="card-title !mb-0">Log</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input !w-auto !py-1 text-xs">
            <option value="">Todos os níveis</option>
            {["ERROR", "WARNING", "SUCCESS", "INFO", "CRITICAL"].map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="h-[28rem] overflow-y-auto rounded-lg bg-ct-ink p-3 font-mono text-[11px] leading-relaxed text-slate-200">
          {log.length === 0 ? <p className="text-slate-500">Sem linhas de log ainda.</p> : log.slice().reverse().map((l, i) => (
            <p key={i} className="whitespace-pre-wrap break-words">
              <span className="text-slate-500">{l.ts.slice(11, 19)}</span> <span className={LEVEL[l.level] ?? "text-slate-300"}>{l.level.padEnd(7)}</span> <span className="text-ct-orange">[{l.module}]</span> {l.message}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
