export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Carregando relatório">
      <div className="h-8 w-72 rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-slate-200" />)}</div>
      <div className="grid gap-6 lg:grid-cols-5"><div className="h-80 rounded-xl bg-slate-200 lg:col-span-3" /><div className="h-80 rounded-xl bg-slate-200 lg:col-span-2" /></div>
      <p className="text-sm text-slate-500">Lendo o banco do cliente… em tenants grandes isso pode levar alguns segundos.</p>
    </div>
  );
}
