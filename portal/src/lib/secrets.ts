import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

/**
 * Cofre das credenciais do Microsoft 365 de cada cliente (client secret ou certificado PFX).
 * - keyvault: Azure Key Vault (KEY_VAULT_URI), acessado com a identidade gerenciada do portal.
 * - local:    tabela StoredSecret cifrada com AES-256-GCM (SECRETS_KEY). Para desenvolvimento ou
 *             instalações sem Key Vault.
 * O segredo nunca volta para o navegador: só o portal lê, para entregar ao job da execução.
 */
const KV_URI = process.env.KEY_VAULT_URI?.trim();
export const SECRET_STORE: "keyvault" | "local" = process.env.SECRET_STORE === "local" || !KV_URI ? "local" : "keyvault";

let kv: import("@azure/keyvault-secrets").SecretClient | null = null;
async function kvClient() {
  if (!kv) {
    const [{ SecretClient }, { DefaultAzureCredential }] = await Promise.all([import("@azure/keyvault-secrets"), import("@azure/identity")]);
    kv = new SecretClient(KV_URI!, new DefaultAzureCredential());
  }
  return kv;
}

function key() {
  const k = process.env.SECRETS_KEY ?? "";
  if (k.length < 16) throw new Error("SECRETS_KEY não configurada (mínimo 16 caracteres) — necessária com SECRET_STORE=local.");
  return createHash("sha256").update(k).digest();
}
const enc = (plain: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${data.toString("base64")}`;
};
const dec = (stored: string) => {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1") throw new Error("Formato de segredo desconhecido.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
};

/** Nomes válidos no Key Vault: letras, números e hífen. */
export const secretName = (clientId: string, kind: "secret" | "cert" | "certpwd") => `m365-${clientId.replace(/[^a-zA-Z0-9-]/g, "")}-${kind}`;

export async function setSecret(name: string, value: string) {
  if (SECRET_STORE === "keyvault") {
    await (await kvClient()).setSecret(name, value, { contentType: "ct-assessment" });
    return;
  }
  const v = enc(value);
  await prisma.storedSecret.upsert({ where: { name }, create: { name, value: v }, update: { value: v } });
}

export async function getSecret(name: string): Promise<string | null> {
  if (SECRET_STORE === "keyvault") {
    try {
      return (await (await kvClient()).getSecret(name)).value ?? null;
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) return null;
      throw e;
    }
  }
  const row = await prisma.storedSecret.findUnique({ where: { name } });
  return row ? dec(row.value) : null;
}

export async function deleteSecret(name: string) {
  if (SECRET_STORE === "keyvault") {
    try { await (await kvClient()).beginDeleteSecret(name); } catch { /* já não existe */ }
    return;
  }
  await prisma.storedSecret.deleteMany({ where: { name } });
}
