"use client";
import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Troca de aba/execução do relatório sem "parecer travado": a navegação roda numa transição; enquanto o servidor
 * monta a nova aba, a aba clicada mostra um indicador, aparece uma barra de progresso e o conteúdo atual fica esmaecido.
 */
const Ctx = createContext<{ go: (href: string, key?: string) => void; pending: boolean; target: string | null }>({ go: () => {}, pending: false, target: null });
export const useReportNav = () => useContext(Ctx);

export function ReportShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const go = (href: string, key?: string) => { setTarget(key ?? null); start(() => router.push(href, { scroll: false })); };
  return (
    <Ctx.Provider value={{ go, pending, target: pending ? target : null }}>
      {pending && <div className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-ct-purple/15 print:hidden" role="progressbar" aria-label="Carregando"><div className="h-full w-1/3 animate-[ctload_1.1s_ease-in-out_infinite] bg-ct-purple" /></div>}
      {children}
    </Ctx.Provider>
  );
}

/** Conteúdo da aba: esmaece e mostra "Carregando…" enquanto a próxima aba é montada. */
export function ReportBody({ children }: { children: React.ReactNode }) {
  const { pending } = useReportNav();
  return (
    <div className="relative" aria-busy={pending}>
      <div className={pending ? "pointer-events-none opacity-40 transition-opacity" : "transition-opacity"}>{children}</div>
      {pending && (
        <div className="absolute inset-x-0 top-10 flex justify-center print:hidden">
          <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ct-purple shadow-md ring-1 ring-slate-200"><Spinner /> Carregando dados da coleta…</span>
        </div>
      )}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

type Tab = { key: string; label: string; href: string; count?: number; on: boolean; has: boolean; title?: string };

export function ReportTabs({ tabs }: { tabs: Tab[] }) {
  const { go, target } = useReportNav();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 print:hidden" aria-label="Seções do relatório">
      {tabs.map((t) => {
        const loading = target === t.key, on = t.on && !target;
        return (
          <a key={t.key} href={t.href} title={t.title} aria-current={t.on ? "page" : undefined}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); if (!t.on) go(t.href, t.key); }}
            className={`-mb-px flex items-center border-b-2 px-3 py-2 text-sm font-medium ${on || loading ? "border-ct-purple text-ct-purple" : t.has ? "border-transparent text-slate-600 hover:text-slate-900" : "border-transparent text-slate-300"}`}>
            {t.label}
            {loading ? <Spinner className="ml-1.5 h-3.5 w-3.5" /> : t.count ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count.toLocaleString("pt-BR")}</span> : null}
          </a>
        );
      })}
    </nav>
  );
}
