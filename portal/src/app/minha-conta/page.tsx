import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut, LOCAL_LOGIN } from "@/auth";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { dateTime } from "@/lib/format";
import { changeOwnPassword } from "@/actions/account";
import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/ui";
import { LogoCT } from "@/components/LogoCT";

export default async function MinhaConta({ searchParams }: { searchParams: Promise<{ obrigatorio?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/login");
  const { obrigatorio } = await searchParams;
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { passwordHash: true, passwordChangedAt: true, mustChangePassword: true } });
  const forced = u.mustChangePassword || !!obrigatorio;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-md">
        <LogoCT width={140} className="text-ct-ink" />
        <h1 className="mt-4 text-lg font-semibold">Minha conta</h1>
        <p className="text-sm text-slate-600">{me.name ?? me.email} · {me.email}</p>
        {forced && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Você entrou com uma senha provisória. Defina uma senha sua para continuar.</p>}
        {!LOCAL_LOGIN ? (
          <p className="mt-4 text-sm text-slate-600">O acesso é pelo Microsoft 365: a senha é gerenciada pela sua conta corporativa.</p>
        ) : (
          <ActionForm action={changeOwnPassword} className="mt-4 space-y-3" submit="Salvar nova senha" reset>
            {u.passwordHash && <Field label="Senha atual"><input name="current" type="password" required autoComplete="current-password" className="input" /></Field>}
            <Field label="Nova senha (10+ caracteres, letras e números)"><input name="password" type="password" required minLength={10} autoComplete="new-password" className="input" /></Field>
            <Field label="Confirme a nova senha"><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className="input" /></Field>
            {u.passwordChangedAt && <p className="text-xs text-slate-500">Última troca: {dateTime(u.passwordChangedAt)}</p>}
          </ActionForm>
        )}
        <div className="mt-4 flex justify-between text-sm">
          {!forced ? <Link href="/" className="link">← Voltar ao portal</Link> : <span />}
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="text-slate-500 hover:underline">Sair</button></form>
        </div>
      </div>
    </main>
  );
}
