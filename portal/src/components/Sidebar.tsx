"use client";
import { LogoCT } from "./LogoCT";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

export type IconName = "painel" | "clientes" | "execucoes" | "higienizacao" | "usuarios" | "auditoria";
type Item = { href: string; label: string; icon: IconName; badge?: number };
type Group = { title: string; items: Item[] };

// ícones de traço único (24×24, stroke 1.8), no mesmo estilo
const ICONS: Record<IconName, ReactNode> = {
  painel: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  clientes: <><path d="M4 21V7l8-4 8 4v14" /><path d="M9 21v-5h6v5" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
  execucoes: <><circle cx="12" cy="12" r="9" /><path d="m10 8.5 5 3.5-5 3.5z" /></>,
  higienizacao: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
  usuarios: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  auditoria: <><path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
};
function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

export function Sidebar({ groups, user, logout, account, collapsed = false, onToggle }: {
  groups: Group[]; user: { name: string; roles: string }; logout: () => Promise<void>; account?: boolean; collapsed?: boolean; onToggle?: () => void;
}) {
  const path = usePathname();
  const match = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
  const all = groups.flatMap((g) => g.items);
  return (
    <nav className="flex h-full flex-col bg-ct-bg text-white" aria-label="Menu principal">
      <div className={`flex items-center py-5 ${collapsed ? "justify-center px-2" : "px-4"}`}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="Assessment365 · início">
          {collapsed ? <LogoCT mark width={30} className="text-white" /> : <>
            <LogoCT width={100} className="shrink-0 text-white" />
            <span className="whitespace-nowrap border-l border-white/20 pl-2.5 text-[13px] font-semibold text-ct-orange">Assessment365</span>
          </>}
        </Link>
      </div>
      <div className={`flex-1 space-y-6 overflow-y-auto pb-4 ${collapsed ? "px-2" : "px-3"}`}>
        {groups.map((g) => (
          <div key={g.title}>
            {collapsed ? <div className="mx-2 mb-2 border-t border-white/10" /> : <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{g.title}</p>}
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                // marca só o item mais específico
                const on = match(i.href) && !all.some((j) => j.href.length > i.href.length && j.href.startsWith(i.href) && match(j.href));
                return (
                  <li key={i.href}>
                    <Link href={i.href} title={collapsed ? `${i.label}${i.badge ? ` (${i.badge})` : ""}` : undefined} aria-current={on ? "page" : undefined}
                      className={`relative flex min-h-10 items-center gap-3 rounded-lg text-sm transition ${collapsed ? "justify-center px-0" : "px-3"} ${on ? "bg-white/15 font-medium text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                      {on && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-ct-purple" aria-hidden="true" />}
                      <Icon name={i.icon} />
                      {!collapsed && <span className="flex-1">{i.label}</span>}
                      {!!i.badge && (collapsed
                        ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ct-orange" aria-label={`${i.badge} em andamento`} />
                        : <span className="rounded-full bg-ct-orange/90 px-1.5 text-xs font-semibold text-ct-ink" aria-label={`${i.badge} em andamento`}>{i.badge}</span>)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {onToggle && (
        <button type="button" onClick={onToggle} className={`mx-3 mb-2 flex min-h-9 items-center gap-3 rounded-lg text-xs text-white/50 hover:bg-white/10 hover:text-white ${collapsed ? "justify-center" : "px-3"}`}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"} title={collapsed ? "Expandir menu" : undefined}>
          <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          {!collapsed && "Recolher menu"}
        </button>
      )}
      <details className="group relative border-t border-white/10">
        <summary className={`flex cursor-pointer list-none items-center gap-3 py-3.5 hover:bg-white/5 [&::-webkit-details-marker]:hidden ${collapsed ? "justify-center px-2" : "px-4"}`} title={collapsed ? user.name : undefined}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ct-purple text-xs font-semibold" aria-hidden="true">{initials(user.name)}</span>
          {!collapsed && <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            {user.roles && <span className="block truncate text-xs text-white/50">{user.roles}</span>}
          </span>}
          {!collapsed && <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/40 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>}
          <span className="sr-only">Abrir menu da conta</span>
        </summary>
        <div className={`absolute bottom-full z-30 mb-1 w-52 overflow-hidden rounded-lg border border-white/10 bg-[#16171d] py-1 text-sm shadow-xl ${collapsed ? "left-2" : "left-3"}`}>
          {account && <Link href="/minha-conta" className="block px-3.5 py-2 text-white/80 hover:bg-white/10 hover:text-white">Minha senha</Link>}
          <form action={logout}><button className="block w-full px-3.5 py-2 text-left text-white/60 hover:bg-white/10 hover:text-white">Sair</button></form>
        </div>
      </details>
    </nav>
  );
}

/** Menu lateral do desktop com a opção de recolher (lembrada num cookie, lido no servidor para não piscar). */
export function SidebarShell(props: Omit<Parameters<typeof Sidebar>[0], "collapsed" | "onToggle"> & { initialCollapsed: boolean }) {
  const { initialCollapsed, ...rest } = props;
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    const v = !collapsed; setCollapsed(v);
    document.cookie = `ct_sidebar=${v ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <aside className={`sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 md:block ${collapsed ? "w-[68px]" : "w-64"}`}>
      <Sidebar {...rest} collapsed={collapsed} onToggle={toggle} />
    </aside>
  );
}
