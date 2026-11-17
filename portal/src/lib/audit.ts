import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

/** Compara dois objetos rasos e devolve só os campos que mudaram: { campo: [antes, depois] }. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(after)) {
    const a = before?.[k], b = after[k];
    const na = a instanceof Date ? a.toISOString() : a == null ? null : String(a);
    const nb = b instanceof Date ? b.toISOString() : b == null ? null : String(b);
    if (na !== nb) out[k] = [na, nb];
  }
  return out;
}

export async function audit(
  tx: Tx, entity: string, entityId: string, action: string, userId: string | null, changes?: Record<string, unknown>,
) {
  if (action === "UPDATE" && changes && Object.keys(changes).length === 0) return;
  await tx.auditLog.create({ data: { entity, entityId, action, userId, changes: changes ? JSON.stringify(changes) : undefined } });
}

/** Lê o JSON de alterações gravado no log (texto no Azure SQL). */
export function parseChanges(v: unknown): Record<string, unknown> | null {
  if (!v) return null;
  if (typeof v === "object") return v as Record<string, unknown>;
  try { const o = JSON.parse(String(v)); return o && typeof o === "object" ? o : null; } catch { return null; }
}
