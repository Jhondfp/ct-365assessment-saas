import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token do job: HMAC do id da execução. O container recebe só ASSESSMENT_ID, CALLBACK_URL e CALLBACK_TOKEN;
 * com eles busca a configuração (inclusive a credencial do M365) e reporta progresso. O portal só aceita
 * o token enquanto a execução está ativa (ver /api/jobs/[id]).
 */
function secret() {
  const s = process.env.JOB_SIGNING_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("JOB_SIGNING_SECRET (ou AUTH_SECRET) não configurado.");
  return s;
}
export const jobToken = (assessmentId: string) => createHmac("sha256", secret()).update(`assessment:${assessmentId}`).digest("base64url");

export function verifyJobToken(assessmentId: string, header: string | null) {
  const got = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  const want = jobToken(assessmentId);
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** URL que o job usa para falar com o portal (dentro do Azure pode ser diferente da URL pública). */
export const callbackBase = () => (process.env.PORTAL_CALLBACK_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
