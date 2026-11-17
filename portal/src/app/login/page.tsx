import { LogoCT } from "@/components/LogoCT";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn, DEV_LOGIN, ENTRA_ENABLED, LOCAL_LOGIN } from "@/auth";

const ERR: Record<string, string> = {
  convite: "Seu e-mail ainda não tem acesso ao portal. Peça o cadastro a um administrador da Cloud Target.",
  inativo: "Seu usuário está desativado no portal. Fale com o administrador.",
  AccessDenied: "Acesso negado.",
  CredentialsSignin: "E-mail ou senha inválidos. Depois de 5 tentativas erradas o acesso fica bloqueado por 15 minutos.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const s = await auth();
  if (s?.user && !error) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center bg-ct-bg p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-ct-purple/50 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-ct-orange/30 blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 p-8 text-white backdrop-blur-xl">
        <LogoCT width={168} className="text-white" />
        <h1 className="mt-6 text-2xl font-semibold">Assessment<span className="text-ct-orange">365</span></h1>
        <p className="text-xs uppercase tracking-widest text-white/50">Governança Microsoft 365 · Cloud Target</p>
        <p className="mt-1 text-sm text-white/70">{ENTRA_ENABLED ? "Entre com a conta Microsoft 365 da sua empresa." : "Entre com seu e-mail e senha."}</p>
        {error && <p className="mt-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-100">{ERR[error] ?? "Não foi possível entrar."}</p>}
        {ENTRA_ENABLED && (
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: "/" });
            }}
          >
            <button className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100">
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Entrar com Microsoft
            </button>
          </form>
        )}
        {LOCAL_LOGIN && (
          <form
            className={`space-y-2 ${ENTRA_ENABLED ? "mt-5 border-t border-white/15 pt-5" : "mt-6"}`}
            action={async (fd: FormData) => {
              "use server";
              try {
                await signIn("local", { email: fd.get("email"), password: fd.get("password"), redirectTo: "/" });
              } catch (e) {
                if (e instanceof AuthError) redirect(`/login?error=${e.type}`);
                throw e;
              }
            }}
          >
            {ENTRA_ENABLED && <p className="text-xs text-white/50">ou com e-mail e senha</p>}
            <input name="email" type="email" required autoComplete="username" placeholder="seu.email@empresa.com.br" className="input text-slate-900" />
            <input name="password" type="password" required autoComplete="current-password" placeholder="Senha" className="input text-slate-900" />
            <button className="btn w-full">Entrar</button>
          </form>
        )}
        {!ENTRA_ENABLED && !LOCAL_LOGIN && !DEV_LOGIN && (
          <p className="mt-6 rounded-lg bg-amber-500/20 p-3 text-sm text-amber-100">Nenhum método de login configurado. Defina AUTH_LOCAL_LOGIN=true ou as variáveis do Entra ID.</p>
        )}
        {DEV_LOGIN && (
          <form
            className="mt-6 border-t border-white/15 pt-4"
            action={async (fd: FormData) => {
              "use server";
              await signIn("dev", { email: fd.get("email"), redirectTo: "/" });
            }}
          >
            <p className="mb-2 text-xs uppercase tracking-wide text-ct-orange">Somente desenvolvimento</p>
            <input name="email" type="email" required placeholder="email@cloudtarget.com.br" className="input text-slate-900" />
            <button className="btn mt-2 w-full">Entrar sem Entra ID</button>
          </form>
        )}
      </div>
    </main>
  );
}
