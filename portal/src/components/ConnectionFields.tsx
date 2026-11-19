"use client";
import { useState } from "react";
import { Field } from "./ui";
import { SetupGuide } from "./SetupGuide";
import { googleGuide, m365Guide } from "@/lib/setupGuides";

/** Campos do App Registration do cliente (cadastro e edição). Só um método de autenticação: o escolhido. */
type ConnClient = {
  name?: string; platform?: string; googleAdminEmail?: string | null; googleDomain?: string | null; googleCustomerId?: string | null;
  m365TenantId: string | null; appClientId: string | null; spoTenant: string | null; authMode: string; credentialSetAt: Date | null;
};

/** Plataforma do cliente: Microsoft 365 (governança) ou Google Workspace (levantamento para migração). */
export function ConnectionFields({ c, editing }: { c?: ConnClient; editing?: boolean }) {
  const [platform, setPlatform] = useState(c?.platform ?? "M365");
  const opt = (value: string, title: string, hint: string) => (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${platform === value ? "border-ct-purple bg-ct-purple/5" : "border-slate-200"}`}>
      <input type="radio" name="platform" value={value} checked={platform === value} onChange={() => setPlatform(value)} className="mt-1" />
      <span><span className="block font-medium">{title}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );
  return (
    <>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="label">Plataforma do cliente</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {opt("M365", "Microsoft 365", "Assessment de governança: SharePoint, OneDrive, licenças, adoção, e-mail e Intune.")}
          {opt("GOOGLE", "Google Workspace", "Levantamento para migração ao Microsoft 365: usuários, e-mail, Drive, grupos e licenças.")}
        </div>
        {editing && c?.platform && c.platform !== platform && <p className="text-xs text-amber-800">Trocar a plataforma descarta a credencial atual: envie a do novo ambiente.</p>}
      </fieldset>
      {platform === "GOOGLE" ? <GoogleFields c={c} editing={editing && c?.platform === "GOOGLE"} /> : <M365Fields c={c} editing={editing && (c?.platform ?? "M365") === "M365"} />}
      <div className="sm:col-span-2">
        <SetupGuide title={platform === "GOOGLE" ? "Guia para enviar ao cliente — acesso ao Google Workspace" : "Guia para enviar ao cliente — acesso ao Microsoft 365"}
          text={platform === "GOOGLE" ? googleGuide(c?.name) : m365Guide(c?.name)} file={platform === "GOOGLE" ? "acesso-google-workspace.txt" : "acesso-microsoft-365.txt"} />
      </div>
    </>
  );
}

function GoogleFields({ c, editing }: { c?: ConnClient; editing?: boolean }) {
  const keep = !!(editing && c?.credentialSetAt);
  return (
    <>
      <Field label="E-mail do administrador (a conta de serviço age em nome dele)"><input name="googleAdminEmail" required type="email" defaultValue={c?.googleAdminEmail ?? ""} className="input" placeholder="assessment@contoso.com.br" /></Field>
      <Field label="Domínio principal do Google Workspace"><input name="googleDomain" required defaultValue={c?.googleDomain ?? ""} className="input" placeholder="contoso.com.br" /></Field>
      <Field label="Customer ID (opcional)"><input name="googleCustomerId" defaultValue={c?.googleCustomerId ?? ""} className="input font-mono" placeholder="C0xxxxxxx" /></Field>
      <Field label={keep ? "Chave JSON da conta de serviço (em branco = manter a atual)" : "Chave JSON da conta de serviço"}>
        <input type="file" name="gsaFile" accept=".json,application/json" required={!keep} className="block w-full text-sm" />
      </Field>
      <p className="text-xs text-slate-500 sm:col-span-2">A chave vai direto para o cofre (Key Vault) e nunca é exibida de volta. A conta de serviço precisa da delegação em todo o domínio com os escopos de leitura do guia abaixo.</p>
    </>
  );
}

function M365Fields({ c, editing }: { c?: ConnClient; editing?: boolean }) {
  const [mode, setMode] = useState(c?.authMode === "secret" || c?.authMode === "cert" ? c.authMode : "cert");
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
