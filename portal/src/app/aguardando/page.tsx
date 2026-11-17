import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { currentUser } from "@/lib/session";

export default async function Aguardando() {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.roles.length) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md text-center">
        <h1 className="text-lg font-semibold">Acesso aguardando liberação</h1>
        <p className="mt-2 text-sm text-slate-600">
          Olá, {u.name ?? u.email}. Seu login funcionou, mas o administrador ainda não definiu o seu papel no portal.
          Assim que isso for feito, é só recarregar a página.
        </p>
        <form className="mt-4" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button className="btn-secondary">Sair</button>
        </form>
      </div>
    </main>
  );
}
