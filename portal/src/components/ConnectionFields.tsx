import { Field } from "./ui";

/** Campos do App Registration do cliente (cadastro e edição da conexão). */
export function ConnectionFields({ c, editing }: { c?: { m365TenantId: string | null; appClientId: string | null; spoTenant: string | null; authMode: string; credentialSetAt: Date | null }; editing?: boolean }) {
  const mode = c?.authMode ?? "cert";
  const keep = editing && c?.credentialSetAt;
  return (
    <>
      <Field label="Tenant ID (ID do locatário)"><input name="m365TenantId" required defaultValue={c?.m365TenantId ?? ""} className="input font-mono" placeholder="00000000-0000-0000-0000-000000000000" /></Field>
      <Field label="Client ID (ID do aplicativo)"><input name="appClientId" required defaultValue={c?.appClientId ?? ""} className="input font-mono" placeholder="00000000-0000-0000-0000-000000000000" /></Field>
      <Field label="SharePoint (prefixo do domínio)" className="sm:col-span-2">
        <div className="flex items-center gap-2"><input name="spoTenant" required defaultValue={c?.spoTenant ?? ""} className="input" placeholder="contoso" /><span className="whitespace-nowrap text-sm text-slate-500">.sharepoint.com</span></div>
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="label">Autenticação {keep && <span className="font-normal text-slate-500">— deixe em branco para manter a credencial atual</span>}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-lg border border-slate-200 p-3 text-sm">
            <span className="flex items-center gap-2 font-medium"><input type="radio" name="authMode" value="cert" defaultChecked={mode === "cert"} /> Certificado (recomendado)</span>
            <span className="mt-2 block text-xs text-slate-500">Arquivo .pfx e senha. O SharePoint (PnP) exige certificado para acesso app-only.</span>
            <input type="file" name="certFile" accept=".pfx,.p12" className="mt-2 block w-full text-xs" />
            <input type="password" name="certPassword" placeholder="Senha do .pfx" autoComplete="off" className="input mt-2" />
          </label>
          <label className="rounded-lg border border-slate-200 p-3 text-sm">
            <span className="flex items-center gap-2 font-medium"><input type="radio" name="authMode" value="secret" defaultChecked={mode === "secret"} /> Client secret</span>
            <span className="mt-2 block text-xs text-slate-500">Atende os workloads do Graph (licenças, adoção, Intune, e-mail).</span>
            <input type="password" name="clientSecret" placeholder={keep && mode === "secret" ? "•••••• (mantida)" : "Valor do secret"} autoComplete="off" className="input mt-2" />
          </label>
        </div>
      </fieldset>
    </>
  );
}
