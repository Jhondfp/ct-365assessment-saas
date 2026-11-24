/**
 * Gráficos leves do relatório (HTML/SVG renderizado no servidor, sem biblioteca).
 * Paleta validada (scripts do guia dataviz): série 1 roxo da marca, 2 azul, 3 laranja; "restante" em cinza neutro;
 * status reservados (bom/atenção/crítico) só para estado, sempre com rótulo. Barras finas com ponta arredondada
 * de 4px, 2px de respiro entre segmentos, tooltip nativo (title) em cada marca.
 */
import type { ReactNode } from "react";

export const SERIES = ["#7E1C9F", "#2a78d6", "#eb6834"] as const;
export const NEUTRAL = "#cbd5e1";
export const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" } as const;
/** Escala ordinal de um tom (roxo da marca), do mais claro ao mais escuro: para faixas ordenadas (ex.: idade do conteúdo). */
export const RAMP = ["#d8b4e8", "#b57ad0", "#9a47b8", "#7E1C9F", "#521266"] as const;

/** Barras horizontais de uma série (ex.: top sites por tamanho). Cor única: a identidade é a linha, não a cor. */
export function BarList({ rows, color = SERIES[0], empty = "Sem dados." }: {
  rows: { label: ReactNode; value: number; display: string; sub?: ReactNode; title?: string }[]; color?: string; empty?: string;
}) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i} className="group" title={r.title}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700 group-hover:text-ct-ink">{r.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-ct-ink">{r.display}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-r bg-slate-100">
            <div className="h-full rounded-r transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: color }} />
          </div>
          {r.sub && <p className="mt-0.5 text-xs text-slate-500">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Composição de um total (partes somam o todo). Legenda sempre presente, com valores. */
export function StackBar({ parts, height = 14 }: { parts: { label: string; value: number; color: string; display: string }[]; height?: number }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  if (total <= 0) return <p className="muted">Sem dados.</p>;
  return (
    <div>
      <div className="flex w-full gap-[2px] overflow-hidden rounded" style={{ height }}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} title={`${p.label}: ${p.display} (${Math.round((p.value / total) * 100)}%)`} className="h-full transition-opacity hover:opacity-80" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label} <b className="font-medium text-ct-ink">{p.display}</b>
            <span className="text-slate-400">{Math.round((Math.max(0, p.value) / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Colunas no tempo (ex.: GB criados por mês). Uma série, um eixo; rótulos do eixo x espaçados. */
export function Columns({ data, color = SERIES[0], height = 180, unit = "", width = 640 }: { data: { label: string; value: number; display: string }[]; color?: string; height?: number; unit?: string; width?: number }) {
  if (!data.length) return <p className="muted">Sem dados.</p>;
  const W = width, H = height, padL = 44, padB = 22, padT = 8;
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const nice = niceMax(max);
  const slot = (W - padL) / data.length;
  const bw = Math.min(24, Math.max(4, slot * 0.6));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const every = Math.ceil(data.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfico de colunas">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#64748b">{fmtTick(t)}{unit}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + slot * i + (slot - bw) / 2;
        const top = y(d.value), h = Math.max(0, H - padB - top);
        return (
          <g key={i} className="group">
            <title>{`${d.label}: ${d.display}`}</title>
            <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
            {h > 0 && <path className="transition-opacity group-hover:opacity-75" d={roundedTop(x, top, bw, h, Math.min(4, bw / 2, h))} fill={color} />}
            {i % every === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#64748b">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}
function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const fmtTick = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : v.toLocaleString("pt-BR", { maximumFractionDigits: v > 0 && v < 1 ? 2 : 1 }));

/** Indicador grande com variação opcional contra outra execução. */
export function Stat({ label, value, hint, delta, deltaGood = "down", tone }: {
  label: string; value: ReactNode; hint?: ReactNode; delta?: { value: number; display: string } | null; deltaGood?: "up" | "down" | "none"; tone?: "ok" | "warn" | "risk";
}) {
  const bar = tone === "ok" ? "bg-ct-green" : tone === "warn" ? "bg-ct-orange" : tone === "risk" ? "bg-red-500" : "bg-slate-200";
  const good = delta && delta.value !== 0 && deltaGood !== "none" ? (delta.value > 0) === (deltaGood === "up") : null;
  return (
    <div className="card relative overflow-hidden">
      <span className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-tight tabular-nums">{value}</p>
      {delta && delta.value !== 0 && (
        <p className={`mt-0.5 text-xs font-medium ${good == null ? "text-slate-500" : good ? "text-lime-700" : "text-red-700"}`}>
          {delta.value > 0 ? "▲" : "▼"} {delta.display} vs. comparação
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Evolução de um indicador entre coletas (pequeno múltiplo: cada indicador com a própria escala, nunca dois eixos).
 * Linha de 2px com pontos; rótulo do primeiro e do último ponto no eixo x; tooltip por ponto.
 */
export function Trend({ data, color = SERIES[0], height = 120 }: { data: { label: string; value: number; display: string }[]; color?: string; height?: number }) {
  if (data.length < 2) return <p className="muted">Precisa de ao menos duas coletas.</p>;
  const W = 320, H = height, padL = 6, padR = 6, padT = 10, padB = 20;
  const max = Math.max(...data.map((d) => d.value), 0), min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1;
  const x = (i: number) => padL + ((W - padL - padR) * i) / (data.length - 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / span);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolução entre coletas">
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#e2e8f0" strokeWidth={1} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={i} className="group">
          <title>{`${d.label}: ${d.display}`}</title>
          <rect x={x(i) - (W / data.length) / 2} y={0} width={W / data.length} height={H} fill="transparent" />
          <circle cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 3.5 : 2.5} fill={i === data.length - 1 ? color : "#fff"} stroke={color} strokeWidth={1.5} className="transition-[r] group-hover:[r:4.5]" />
        </g>
      ))}
      <text x={padL} y={H - 5} fontSize={10} fill="#64748b">{data[0].label}</text>
      <text x={W - padR} y={H - 5} fontSize={10} fill="#64748b" textAnchor="end">{data[data.length - 1].label}</text>
    </svg>
  );
}

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const gbFmt = (v: number) => (v >= 1024 ? `${(v / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} TB` : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} GB`);

/**
 * Uso do armazenamento no tempo + projeção (mesma série, tracejada) até a cota, que é uma linha de limite rotulada.
 * Um eixo só (GB). Tooltip nativo por ponto.
 */
export function GrowthChart({ history, projection, quotaGB, showQuota = true, height = 220 }: {
  history: { y: number; m: number; gb: number }[]; projection: { y: number; m: number; gb: number }[]; quotaGB: number; showQuota?: boolean; height?: number;
}) {
  const pts = [...history.map((p) => ({ ...p, proj: false })), ...projection.map((p) => ({ ...p, proj: true }))];
  if (pts.length < 2) return <p className="muted">Sem histórico suficiente.</p>;
  const W = 1000, H = height, padL = 54, padR = 12, padT = 14, padB = 24;
  const top = niceMax(Math.max(showQuota ? quotaGB || 0 : 0, ...pts.map((p) => p.gb)) * 1.1);
  const x = (i: number) => padL + ((W - padL - padR) * i) / (pts.length - 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const nh = history.length;
  const line = (a: typeof pts, off: number) => a.map((p, i) => `${i ? "L" : "M"}${x(i + off).toFixed(1)},${y(p.gb).toFixed(1)}`).join(" ");
  const histPath = line(pts.slice(0, nh), 0);
  const projPath = projection.length ? line(pts.slice(nh - 1), nh - 1) : "";
  const every = Math.max(1, Math.ceil(pts.length / 8));
  const ticks = [0, top / 2, top];
  const label = (p: { y: number; m: number }) => `${MES[p.m - 1]}/${String(p.y).slice(2)}`;
  return (
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" role="img" aria-label="Uso do armazenamento e projeção">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#64748b">{gbFmt(t)}</text>
        </g>
      ))}
      {showQuota && quotaGB > 0 && quotaGB <= top && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(quotaGB)} y2={y(quotaGB)} stroke={STATUS.critical} strokeWidth={1.5} strokeDasharray="2 3" />
          <text x={W - padR} y={y(quotaGB) - 5} textAnchor="end" fontSize={10} fill="#475569">Cota do tenant · {gbFmt(quotaGB)}</text>
        </g>
      )}
      <path d={histPath} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {projPath && <path d={projPath} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" opacity={0.75} />}
      <line x1={x(nh - 1)} x2={x(nh - 1)} y1={padT} y2={H - padB} stroke="#cbd5e1" strokeWidth={1} />
      <text x={x(nh - 1) + 4} y={padT + 10} fontSize={10} fill="#64748b">hoje</text>
      {pts.map((p, i) => (
        <g key={i} className="group">
          <title>{`${label(p)}: ${gbFmt(p.gb)}${p.proj ? " (projeção)" : ""}`}</title>
          <rect x={x(i) - (W / pts.length) / 2} y={padT} width={W / pts.length} height={H - padT - padB} fill="transparent" />
          <circle cx={x(i)} cy={y(p.gb)} r={3} fill={p.proj ? "#fff" : SERIES[0]} stroke={SERIES[0]} strokeWidth={1.5} className="opacity-0 group-hover:opacity-100" />
          {i % every === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="#64748b">{label(p)}</text>}
        </g>
      ))}
    </svg></div>
  );
}
