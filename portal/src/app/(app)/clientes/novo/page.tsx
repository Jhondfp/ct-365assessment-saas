import { requirePagePerm } from "@/lib/session";
import { PERMISSIONS_HELP } from "@/lib/collector";
import { tenantSqlConfigured } from "@/lib/tenantDb";
import { createClient } from "@/actions/clients";
import { ActionForm } from "@/components/ActionForm";
import { ConnectionFields } from "@/components/ConnectionFields";
import { Field, PageHeader } from "@/components/ui";

export default async function NovoCliente() {
  await requirePagePerm("clients:manage");
  const sqlOk = tenantSqlConfigured();
  const prefix = process.env.TENANT_DB_PREFIX ?? "ctassess_";
  return (
    <>
      <PageHeader title="Novo cliente" subtitle="Dados do cliente, conexão com o Microsoft 365 e banco de dados — tudo num cadastro só." />
      <ActionForm action={createClient} className="grid gap-6 lg:grid-cols-3" submit="Cadastrar cliente">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="card-title">1. Cliente</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do cliente" className="sm:col-span-2"><input name="name" required className="input" placeholder="Contoso Ltda" /></Field>
              <Field label="Identificador (opcional, não muda depois)"><input name="slug" className="input" placeholder="contoso" pattern="[A-Za-z0-9_ -]+" /></Field>
              <Field label="CNPJ"><input name="document" className="input" /></Field>
              <Field label="Observações" className="sm:col-span-2"><textarea name="notes" rows={2} className="input" /></Field>
            </div>
          </section>
          <section className="card">
            <h2 className="card-title">2. Conexão Microsoft 365 (App Registration do cliente)</h2>
            <div className="grid gap-4 sm:grid-cols-2"><ConnectionFields /></div>
          </section>
          <section className="card">
            <h2 className="card-title">3. Banco de dados do cliente</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do banco (opcional)"><input name="dbName" className="input font-mono" placeholder={`${prefix}<identificador>`} pattern="[a-z0-9_]+" /></Field>
              <label className="flex items-start gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="createDb" defaultChecked={sqlOk} disabled={!sqlOk} className="mt-1" />
                <span>Criar o banco agora e subir o schema padrão do coletor</span>
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {sqlOk
                ? "O banco é criado no servidor de clientes (no elastic pool, se configurado) com as tabelas e procedures do ct-assessmentspo. Se já existir um banco com esse nome e o schema do coletor, ele é aproveitado sem apagar dados. Sem marcar, o banco é criado na primeira coleta."
                : "O servidor dos bancos de clientes não está configurado no portal (TENANT_SQL_*): o banco poderá ser criado depois."}
            </p>
          </section>
        </div>
        <aside className="card h-fit">
          <h2 className="card-title">Permissões do App Registration</h2>
          <p className="muted mb-2">No Entra ID do cliente, conceda (tipo Application, com consentimento do administrador):</p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">{PERMISSIONS_HELP.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="mt-3 text-xs text-slate-500">A credencial vai direto para o cofre (Key Vault) e nunca é exibida de volta.</p>
        </aside>
      </ActionForm>
    </>
  );
}
