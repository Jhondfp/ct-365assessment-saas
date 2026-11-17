import Link from "next/link";

export default function SemAcesso() {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <h1 className="text-lg font-semibold">Sem acesso a esta área</h1>
      <p className="mt-2 text-sm text-slate-600">O seu papel no portal não permite abrir esta página. Se precisar, peça ao administrador para ajustar seus papéis.</p>
      <Link href="/" className="btn mt-4">Voltar ao painel</Link>
    </div>
  );
}
