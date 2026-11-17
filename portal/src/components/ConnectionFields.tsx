"use client";
import { useState } from "react";
import { Field } from "./ui";

/** Campos do App Registration do cliente (cadastro e edição). Só um método de autenticação: o escolhido. */
export function ConnectionFields({ c, editing }: { c?: { m365TenantId: string | null; appClientId: string | null; spoTenant: string | null; authMode: string; credentialSetAt: Date | null }; editing?: boolean }) {
  const [mode, setMode] = useState(c?.authMode ?? "cert");
  const keep = !!(editing && c?.credentialSetAt && c.authMode === mode);
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={keep ? "Certificado .pfx (em branco = manter o atual)" : "Certificado .pfx"}><input type="file" name="certFile" accept=".pfx,.p12" className="block w-full text-sm" /></Field>
            <Field label="Senha do .pfx (em branco se não tiver)"><input type="password" name="certPassword" autoComplete="off" className="input" /></Field>
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
