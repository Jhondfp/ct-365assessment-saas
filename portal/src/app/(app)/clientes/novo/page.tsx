import { requirePagePerm } from "@/lib/session";
import { tenantSqlConfigured } from "@/lib/tenantDb";
import { createClient } from "@/actions/clients";
import { ActionForm } from "@/components/ActionForm";
import { ConnectionFields } from "@/components/ConnectionFields";
import { DbFields } from "@/components/DbFields";
import { Field, PageHeader } from "@/components/ui";

export default async function NovoCliente() {
  await requirePagePerm("clients:manage");
  const sqlOk = tenantSqlConfigured();
  const prefix = process.env.TENANT_DB_PREFIX ?? "ctassess_";
  return (
    <>
      <PageHeader title="Novo cliente" subtitle="Dados do cliente, plataforma (Microsoft 365 ou Google Workspace), conexão e banco de dados — tudo num cadastro só." />
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
            <h2 className="card-title">2. Plataforma e conexão</h2>
            <div className="grid gap-4 sm:grid-cols-2"><ConnectionFields /></div>
          </section>
          <section className="card">
            <h2 className="card-title">3. Banco de dados do cliente</h2>
            <DbFields sqlOk={sqlOk} prefix={prefix} />
          </section>
        </div>
        <aside className="card h-fit">
          <h2 className="card-title">Antes de cadastrar</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Envie ao cliente o <b>guia de acesso</b> (no fim da seção 2): ele explica, passo a passo, o que criar no Microsoft 365, no Google Workspace ou na AWS e o que nos devolver.</li>
            <li><b>Microsoft 365:</b> dá para cadastrar agora e gerar o certificado no portal; depois baixe o .cer na aba Conexão e mande para o cliente.</li>
            <li><b>Google Workspace:</b> o cadastro precisa da chave JSON da conta de serviço que o cliente cria.</li>
            <li><b>AWS:</b> o cadastro precisa do ID da conta e da chave de acesso de um usuário IAM só de leitura.</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">Credenciais vão direto para o cofre (Key Vault) e nunca são exibidas de volta.</p>
        </aside>
      </ActionForm>
    </>
  );
}
