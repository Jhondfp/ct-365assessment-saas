"use client";
import { useMemo, useState } from "react";

/** Formatos de célula (funções não atravessam do servidor para o cliente, então o formato vai como nome). */
export type ColKind = "text" | "num" | "bytes" | "pct" | "date" | "bool" | "link" | "badge";
export type Col = { key: string; label: string; kind?: ColKind; hrefKey?: string; width?: string };
type Row = Record<string, unknown>;

const GB = 1073741824;
function fmt(v: unknown, kind: ColKind = "text") {
  if (v == null || v === "") return "—";
  switch (kind) {
    case "num": return Number(v).toLocaleString("pt-BR");
    case "pct": return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    case "bytes": {
      const b = Number(v);
      if (b >= 1024 * GB) return `${(b / (1024 * GB)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} TB`;
      if (b >= GB) return `${(b / GB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`;
      return `${(b / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} MB`;
    }
    case "date": { const d = new Date(String(v)); return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR"); }
    case "bool": return v ? "Sim" : "Não";
    default: return String(v);
  }
}
const isNumeric = (k?: ColKind) => k === "num" || k === "bytes" || k === "pct";

/** Tabela do relatório: busca, ordenação por coluna, exportação CSV e "mostrar mais". */
export function DataTable({ cols, rows, file, initialSort, pageSize = 15, searchPlaceholder = "Buscar…", empty = "Sem dados." }: {
  cols: Col[]; rows: Row[]; file: string; initialSort?: { key: string; dir: "asc" | "desc" }; pageSize?: number; searchPlaceholder?: string; empty?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [limit, setLimit] = useState(pageSize);
  const data = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = needle ? rows.filter((row) => cols.some((c) => String(row[c.key] ?? "").toLowerCase().includes(needle))) : rows;
    if (sort) {
      const col = cols.find((c) => c.key === sort.key);
      r = [...r].sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key];
        const cmp = isNumeric(col?.kind) ? Number(av ?? 0) - Number(bv ?? 0) : String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, cols, q, sort]);

  function csv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.map((c) => esc(c.label)).join(";"), ...data.map((r) => cols.map((c) => esc(r[c.key])).join(";"))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${file}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(pageSize); }} placeholder={searchPlaceholder} className="input !w-64 !py-1.5" aria-label="Buscar na tabela" />
        <span className="flex items-center gap-3 text-xs text-slate-500">
          {data.length.toLocaleString("pt-BR")} de {rows.length.toLocaleString("pt-BR")}
          <button type="button" onClick={csv} className="btn-secondary btn-sm">Exportar CSV</button>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} style={{ width: c.width }} className={isNumeric(c.kind) ? "text-right" : ""}>
                  <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-ct-ink" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}>
                    {c.label}{sort?.key === c.key && <span aria-hidden>{sort.dir === "desc" ? "↓" : "↑"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, limit).map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className={isNumeric(c.kind) ? "text-right tabular-nums" : "max-w-[28rem] break-words"}>
                    {c.kind === "link" && r[c.hrefKey ?? c.key]
                      ? <a className="link" href={String(r[c.hrefKey ?? c.key])} target="_blank" rel="noopener noreferrer">{fmt(r[c.key])}</a>
                      : fmt(r[c.key], c.kind)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > limit && (
        <div className="mt-3 text-center print:hidden"><button type="button" className="btn-secondary btn-sm" onClick={() => setLimit((l) => l + pageSize * 3)}>Mostrar mais ({(data.length - limit).toLocaleString("pt-BR")} restantes)</button></div>
      )}
    </div>
  );
}
