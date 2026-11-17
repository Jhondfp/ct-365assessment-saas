"use client";
import { LogoCT } from "./LogoCT";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; badge?: number };
export function Sidebar({ groups, user, logout, account }: { groups: { title: string; items: Item[] }[]; user: { name: string; roles: string }; logout: () => Promise<void>; account?: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex h-full flex-col bg-ct-bg text-white">
      <div className="px-5 py-5">
        <LogoCT width={140} className="text-white" />
        <p className="text-sm font-semibold tracking-wide text-ct-orange">Assessment365</p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">{g.title}</p>
            {g.items.map((i) => {
              // marca só o item mais específico (ex.: /cotacoes/aprovacao não acende /cotacoes)
              const match = (h: string) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"));
              const on = match(i.href) && !groups.some((g2) => g2.items.some((j) => j.href.length > i.href.length && j.href.startsWith(i.href) && match(j.href)));
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-sm ${on ? "bg-white/15 font-medium" : "text-white/75 hover:bg-white/10"}`}
                >
                  {i.label}
                  {!!i.badge && <span className="rounded-full bg-ct-orange px-1.5 text-xs font-semibold text-ct-ink">{i.badge}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-5 py-4 text-xs">
        <p className="font-medium">{user.name}</p>
        <p className="text-white/50">{user.roles}</p>
        <div className="mt-2 flex gap-3">{account && <Link href="/minha-conta" className="text-white/60 hover:text-white">Minha senha</Link>}<form action={logout}><button className="text-white/60 hover:text-white">Sair</button></form></div>
      </div>
    </nav>
  );
}
