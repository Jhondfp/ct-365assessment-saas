export const ACTIVE = ["QUEUED", "STARTING", "RUNNING"] as const;
export const STATUS_LABEL: Record<string, string> = {
  QUEUED: "Na fila", STARTING: "Iniciando", RUNNING: "Em execução", COMPLETED: "Concluída", PARTIAL: "Concluída com alertas", FAILED: "Falhou", CANCELED: "Cancelada", EXCLUINDO: "Excluindo…",
};
/** Terminou com dados aproveitáveis (dashboard faz sentido). */
export const HAS_DATA = ["COMPLETED", "PARTIAL"] as const;
export const STATUS_TONE: Record<string, "gray" | "blue" | "green" | "red" | "orange" | "purple"> = {
  QUEUED: "gray", STARTING: "blue", RUNNING: "purple", COMPLETED: "green", PARTIAL: "orange", FAILED: "red", CANCELED: "gray", EXCLUINDO: "gray",
};
export const DB_STATUS_LABEL: Record<string, string> = { PENDENTE: "Não provisionado", PROVISIONADO: "Provisionado", ERRO: "Erro" };

export type Step = { Status?: string; Progress?: number; Info?: string; Updated?: string };
export type Progress = { ExecutionId?: string; Status?: string; StartTime?: string; LastUpdate?: string; Steps?: Record<string, Step> };
export type LogLine = { ts: string; level: string; module: string; message: string };

export function parseJson<T>(v: string | null | undefined, fallback: T): T {
  if (!v) return fallback;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

export type Workload = { label: string; status: "pending" | "running" | "ok" | "failed" | "skipped"; detail?: string; seconds?: number };
export type Check = { ok: boolean; detail?: string } | null;
export type Preflight = { graph: Check; sharepoint: Check; database: Check; permissions: { checked: boolean; granted: string[]; detail?: string } | null };
export const WORKLOAD_LABEL: Record<Workload["status"], string> = { pending: "Aguardando", running: "Em execução", ok: "Concluído", failed: "Falhou", skipped: "Pulado" };
export const WORKLOAD_TONE: Record<Workload["status"], "gray" | "purple" | "green" | "red" | "orange"> = { pending: "gray", running: "purple", ok: "green", failed: "red", skipped: "orange" };

/** Sem sinal do worker há este tempo = o worker caiu (reinício/implantação); a fila retoma a coleta. Igual a QUEUE_STALE_MS. */
export const STALLED_MS = 10 * 60_000;
/** Coleta "em execução" cujo worker parou de mandar sinal: está esperando ser retomada. */
export function isStalled(a: { status: string; runner?: string | null; heartbeatAt?: Date | string | null; createdAt?: Date | string }) {
  if (!["STARTING", "RUNNING"].includes(a.status) || a.runner !== "queue") return false;
  const last = a.heartbeatAt ?? a.createdAt;
  return !!last && Date.now() - new Date(last).getTime() > STALLED_MS;
}
