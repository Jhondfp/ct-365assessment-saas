"use client";
import { useRef, type ReactNode } from "react";

/** Botão que abre uma janela modal (dialog nativo: ESC e clique fora fecham). */
export function ModalButton({ label, title, children, className = "btn-secondary" }: { label: ReactNode; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog
        ref={ref}
        aria-label={title}
        className="w-[min(640px,calc(100vw-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-slate-900/40"
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar" onClick={() => ref.current?.close()}>✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </dialog>
    </>
  );
}
