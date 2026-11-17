export const ACTIVE = ["QUEUED", "STARTING", "RUNNING"] as const;
export const STATUS_LABEL: Record<string, string> = {
  QUEUED: "Na fila", STARTING: "Iniciando", RUNNING: "Em execução", COMPLETED: "Concluída", FAILED: "Falhou", CANCELED: "Cancelada",
};
export const STATUS_TONE: Record<string, "gray" | "blue" | "green" | "red" | "orange" | "purple"> = {
  QUEUED: "gray", STARTING: "blue", RUNNING: "purple", COMPLETED: "green", FAILED: "red", CANCELED: "orange",
};
export const DB_STATUS_LABEL: Record<string, string> = { PENDENTE: "Não provisionado", PROVISIONADO: "Provisionado", ERRO: "Erro" };

export type Step = { Status?: string; Progress?: number; Info?: string; Updated?: string };
export type Progress = { ExecutionId?: string; Status?: string; StartTime?: string; LastUpdate?: string; Steps?: Record<string, Step> };
export type LogLine = { ts: string; level: string; module: string; message: string };

export function parseJson<T>(v: string | null | undefined, fallback: T): T {
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}
