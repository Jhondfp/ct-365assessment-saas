"use client";
import { useState } from "react";
import { Field } from "./ui";

/** Campos do App Registration do cliente (cadastro e edição). Só um método de autenticação: o escolhido. */
export function ConnectionFields({ c, editing }: { c?: { m365TenantId: string | null; appClientId: string | null; spoTenant: string | null; authMode: string; credentialSetAt: Date | null }; editing?: boolean }) {
  const [mode, setMode] = useState(c?.authMode ?? "cert");
  const keep = !!(editing && c?.credentialSetAt && c.authMode === mode);
  const [source, setSource] = useState<"keep" | "generate" | "upload">(editing && c?.credentialSetAt && c.authMode === "cert" ? "keep" : "generate");
  const src = !keep && source === "keep" ? "generate" : source;
  const option = (value: string, title: string, hint: string) => (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${mode === value ? "border-ct-purple bg-ct-purple/5" : "border-slate-200"}`}>
      <input type="radio" name="authMode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1" />
      <span><span className="block font-medium">{title}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );
  return (
    <>
      <Field label="Tenant ID (ID do locatário)"><input name="m365TenantId" required defaultValue={c?.m365TenantId ?? ""} className="input font-mono" placeholder="00000000-0000-0000-0000-000000000000" /></Field>
      <Field label="Client ID (ID do aplicativo)"><input name="appClientId" required defaultValue={c?.appClientId ?? ""} className="input font-mono" placeholder="00000000-0000-0000-0000-000000000000" /></Field>
      <Field label="SharePoint (prefixo do domínio)" className="sm:col-span-2">
        <div className="flex items-center gap-2"><input name="spoTenant" required defaultValue={c?.spoTenant ?? ""} className="input" placeholder="contoso" /><span className="whitespace-nowrap text-sm text-slate-500">.sharepoint.com</span></div>
      </Field>
      <fieldset className="space-y-3 sm:col-span-2">
        <legend className="label">Autenticação — escolha um método</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {option("cert", "Certificado (recomendado)", "Serve para tudo: Graph e SharePoint/OneDrive (PnP).")}
          {option("secret", "Client secret", "Só Graph (licenças, adoção, Intune, e-mail). Sites, arquivos e lixeira exigem certificado.")}
        </div>
        {mode === "cert" ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {keep && <label className="flex items-center gap-2"><input type="radio" name="certSource" value="keep" checked={source === "keep"} onChange={() => setSource("keep")} />Manter o certificado atual</label>}
              <label className="flex items-center gap-2"><input type="radio" name="certSource" value="generate" checked={src === "generate"} onChange={() => setSource("generate")} />{keep ? "Gerar um novo no portal" : "Gerar no portal (recomendado)"}</label>
              <label className="flex items-center gap-2"><input type="radio" name="certSource" value="upload" checked={src === "upload"} onChange={() => setSource("upload")} />Enviar um .pfx</label>
            </div>
            {src === "generate" && (
              <p className="text-xs text-slate-600">
                O portal cria um certificado (RSA 2048, válido por 2 anos) e guarda a chave privada no cofre; ela nunca sai do portal. Depois de salvar,
                baixe o <b>certificado público (.cer)</b> na aba Conexão e envie em <i>App Registration → Certificados e segredos → Certificados</i> no Entra ID do cliente.
                {keep && <b className="block text-amber-800">O certificado atual deixa de ser usado: o novo precisa estar no App Registration antes da próxima coleta.</b>}
              </p>
            )}
            {src === "upload" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Certificado .pfx"><input type="file" name="certFile" accept=".pfx,.p12" required className="block w-full text-sm" /></Field>
                <Field label="Senha do .pfx (em branco se não tiver)"><input type="password" name="certPassword" autoComplete="off" className="input" /></Field>
              </div>
            )}
          </div>
        ) : (
          <Field label={keep ? "Client secret (em branco = manter o atual)" : "Client secret"}>
            <input type="password" name="clientSecret" autoComplete="off" className="input" />
          </Field>
        )}
      </fieldset>
    </>
  );
}
