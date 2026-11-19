"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useReportNav } from "./ReportShell";

type Opt = { id: string; label: string };

/** Seletor de execução e de comparação: troca a URL (dá para compartilhar o link de uma execução/aba). */
export function ReportToolbar({ execs, current, compare }: { execs: Opt[]; current: string | null; compare: string | null }) {
  const { go: nav } = useReportNav();
  const path = usePathname();
  const sp = useSearchParams();
  const go = (k: string, v: string) => {
    const q = new URLSearchParams(sp.toString());
    if (v) q.set(k, v); else q.delete(k);
    if (k === "execucao" && q.get("comparar") === v) q.delete("comparar");
    nav(`${path}?${q.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <label className="block">
        <span className="label">Execução</span>
        <select className="input !w-auto" value={current ?? ""} onChange={(e) => go("execucao", e.target.value)}>
          {execs.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Comparar com</span>
        <select className="input !w-auto" value={compare ?? ""} onChange={(e) => go("comparar", e.target.value)}>
          <option value="">Sem comparação</option>
          {execs.filter((e) => e.id !== current).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>
    </div>
  );
}

export function PrintButton({ label = "Imprimir / PDF" }: { label?: string }) {
  return <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}>{label}</button>;
}
