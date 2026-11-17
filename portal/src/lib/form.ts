export const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
};
export const req = (fd: FormData, k: string, label = k) => {
  const v = s(fd, k);
  if (!v) throw new Error(`Campo obrigatório: ${label}`);
  return v;
};
export const b = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export const int = (fd: FormData, k: string, fallback: number, min = 1, max = 1_000_000) => {
  const v = Number(s(fd, k));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback;
};
