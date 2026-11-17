import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <h1 className="text-lg font-semibold">Não encontrado</h1>
      <p className="mt-2 text-sm text-slate-600">Esta página não existe ou você não tem acesso a ela.</p>
      <Link href="/" className="btn mt-4">Voltar ao painel</Link>
    </div>
  );
}
