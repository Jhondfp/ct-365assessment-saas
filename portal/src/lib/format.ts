export const date = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
export const dateTime = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";
export const initials = (name?: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).map((p) => p[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();
/** Duração legível entre duas datas (ou até agora). */
export function duration(from?: Date | null, to?: Date | null) {
  if (!from) return "—";
  const ms = (to ?? new Date()).getTime() - new Date(from).getTime();
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
}
