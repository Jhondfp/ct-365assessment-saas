import { generateKeyPairSync, randomBytes } from "node:crypto";
import forge from "node-forge";

/**
 * Certificado autoassinado para o App Registration do cliente (o que o cert_gen.bat do coletor on-premises fazia
 * com OpenSSL): RSA 2048, SHA-256, 2 anos. A chave privada só existe dentro do .pfx, que vai direto para o cofre
 * (com senha aleatória, também no cofre); para o cliente sai apenas o certificado público (.cer).
 */
export function generateClientCertificate(clientName: string, years = 2) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const key = forge.pki.privateKeyFromPem(privateKey);
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey);
  cert.serialNumber = "01" + randomBytes(15).toString("hex"); // positivo
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 5 * 60_000);
  cert.validity.notAfter = new Date(now.getTime() + years * 365 * 86_400_000);
  const cn = `CT Assessment 365 - ${clientName}`.replace(/[^\p{L}\p{N} .\-]/gu, "").slice(0, 64);
  const attrs = [{ name: "commonName", value: cn }, { name: "organizationName", value: "Cloud Target" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", clientAuth: true },
  ]);
  cert.sign(key, forge.md.sha256.create());

  const password = randomBytes(24).toString("base64url");
  const p12 = forge.pkcs12.toPkcs12Asn1(key, [cert], password, { algorithm: "3des", friendlyName: cn });
  const pfx = Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary").toString("base64");
  const info = certInfo(cert);
  return { pfx, password, ...info };
}

function certInfo(cert: forge.pki.Certificate) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const thumbprint = forge.md.sha1.create().update(der).digest().toHex().toUpperCase();
  return {
    cerPem: forge.pki.certificateToPem(cert), thumbprint, expiresAt: cert.validity.notAfter,
    subject: String(cert.subject.getField("CN")?.value ?? ""),
  };
}

/** Certificado público (.cer) e dados de um .pfx guardado no cofre (gerado no portal ou enviado). */
export function publicFromPfx(pfxBase64: string, password: string) {
  const asn1 = forge.asn1.fromDer(Buffer.from(pfxBase64, "base64").toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password || "");
  const bag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!bag?.cert) throw new Error("O .pfx não tem certificado.");
  return certInfo(bag.cert);
}
