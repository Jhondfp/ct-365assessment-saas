import { prisma } from "./prisma";
import { verifyJobToken } from "./jobToken";
import { ACTIVE, parseJson, type LogLine } from "./status";

/** Autentica o container pelo token da execução e só aceita execução ativa (cancelada/terminada → 409: o job encerra). */
export async function loadActive(req: Request, id: string) {
  if (!verifyJobToken(id, req.headers.get("authorization"))) return { err: Response.json({ error: "token inválido" }, { status: 401 }) };
  const a = await prisma.assessment.findUnique({ where: { id }, include: { client: true } });
  if (!a) return { err: Response.json({ error: "execução não encontrada" }, { status: 404 }) };
  if (!(ACTIVE as readonly string[]).includes(a.status)) return { err: Response.json({ error: `execução ${a.status.toLowerCase()}`, status: a.status }, { status: 409 }) };
  return { a };
}

export const MAX_LOG = 500;
export function mergeLog(current: string | null, lines: LogLine[]) {
  return JSON.stringify([...parseJson<LogLine[]>(current, []), ...lines.slice(-MAX_LOG)].slice(-MAX_LOG));
}
