"use client";
import { useState } from "react";
import { Field } from "./ui";

type Current = { dbMode: string; dbName: string | null; dbServer: string | null; dbUser: string | null };

/**
 * Banco do cliente: criar um banco novo no servidor da Cloud Target ou conectar num banco existente
 * (ex.: base de um assessment feito com o ct-assessmentspo). Só os campos da opção escolhida aparecem.
 */
export function DbFields({ c, sqlOk, prefix, editing }: { c?: Current; sqlOk: boolean; prefix: string; editing?: boolean }) {
  const [mode, setMode] = useState(c?.dbMode === "EXTERNAL" || !sqlOk ? "EXTERNAL" : "MANAGED");
  const option = (value: string, title: string, hint: string, disabled = false) => (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${mode === value ? "border-ct-purple bg-ct-purple/5" : "border-slate-200"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}>
      <input type="radio" name="dbMode" value={value} checked={mode === value} disabled={disabled} onChange={() => setMode(value)} className="mt-1" />
      <span><span className="block font-medium">{title}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {option("MANAGED", "Criar banco novo", sqlOk ? "No servidor de clientes da Cloud Target, com o schema padrão do coletor." : "Servidor de clientes não configurado no portal (TENANT_SQL_*).", !sqlOk)}
        {option("EXTERNAL", "Conectar em banco existente", "Qualquer SQL Server / Azure SQL — ex.: a base de um assessment já feito com o ct-assessmentspo.")}
      </div>

      {mode === "MANAGED" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do banco (opcional)">
            <input name="dbName" defaultValue={c?.dbMode === "MANAGED" ? c.dbName ?? "" : ""} className="input font-mono" placeholder={`${prefix}<identificador>`} pattern="[a-z0-9_]+" />
          </Field>
          <label className="flex items-start gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="createDb" defaultChecked className="mt-1" />
            <span>{editing ? "Criar/atualizar o banco agora" : "Criar o banco agora e subir o schema padrão do coletor"}</span>
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">Sem marcar, o banco é criado na primeira coleta.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Servidor" className="sm:col-span-2">
            <input name="dbServer" required defaultValue={c?.dbServer ?? ""} className="input font-mono" placeholder="meuservidor.database.windows.net" />
          </Field>
          <Field label="Banco"><input name="dbExistingName" required defaultValue={c?.dbMode === "EXTERNAL" ? c.dbName ?? "" : ""} className="input font-mono" placeholder="assessment_db" /></Field>
          <Field label="Usuário SQL"><input name="dbUser" required defaultValue={c?.dbUser ?? ""} className="input" autoComplete="off" /></Field>
          <Field label={editing && c?.dbMode === "EXTERNAL" ? "Senha (em branco = manter a atual)" : "Senha"} className="sm:col-span-2">
            <input name="dbPassword" type="password" required={!(editing && c?.dbMode === "EXTERNAL")} className="input" autoComplete="new-password" />
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">
            A conexão é testada antes de salvar. Banco com o schema do coletor é aproveitado com o histórico de coletas; banco vazio recebe o schema padrão;
            banco com outras tabelas é recusado. O firewall do servidor precisa liberar os serviços do Azure (o portal e os workers rodam no Azure Container Apps).
            A senha vai para o Key Vault.
          </p>
        </div>
      )}
    </div>
  );
}
