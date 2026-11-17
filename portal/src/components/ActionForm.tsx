"use client";
import { useRef, useState, useTransition, type ReactNode } from "react";
import type { ActResult } from "@/lib/act";

type Props = {
  action: (fd: FormData) => Promise<ActResult<unknown>>;
  children: ReactNode;
  className?: string;
  /** limpa o formulário depois de salvar (formulários de criação) */
  reset?: boolean;
  confirm?: string;
  success?: string;
  submit?: ReactNode;
  submitClass?: string;
  onDone?: () => void;
  /** segundo botão com outra ação (ex.: "Salvar rascunho"): ignora campos obrigatórios e não dispara o fluxo principal */
  alt?: { label: ReactNode; action: (fd: FormData) => Promise<ActResult<unknown>>; className?: string };
};

export function ActionForm({ action, children, className, reset, confirm, success = "Salvo.", submit, submitClass = "btn", onDone, alt }: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const isAlt = !!alt && (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-alt") === "1";
        if (!isAlt && confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        setMsg(null);
        start(async () => {
          const r = await (isAlt ? alt!.action : action)(fd);
          if (r && !r.ok) setMsg({ ok: false, text: r.error });
          else {
            setMsg({ ok: true, text: r && r.ok && typeof r.data === "string" ? r.data : success });
            if (reset && !isAlt) ref.current?.reset();
            if (!isAlt) onDone?.();
          }
        });
      }}
    >
      {children}
      {(submit !== undefined || msg) && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {submit !== undefined && (
            <button className={submitClass} disabled={pending}>
              {pending ? "Salvando…" : submit}
            </button>
          )}
          {alt && (
            <button type="submit" data-alt="1" formNoValidate className={alt.className ?? "btn-secondary"} disabled={pending}>
              {alt.label}
            </button>
          )}
          {msg && <span className={`text-sm ${msg.ok ? "text-lime-700" : "text-red-700"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
        </div>
      )}
    </form>
  );
}

/** Botão isolado que dispara uma action sem campos (ex.: testar, provisionar, ativar/desativar). Mostra o retorno da action. */
export function ActionButton({ action, children, className = "btn-secondary btn-sm", confirm }: { action: () => Promise<ActResult<unknown>>; children: ReactNode; className?: string; confirm?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setMsg(null);
          start(async () => {
            const r = await action();
            if (r && !r.ok) setMsg({ ok: false, text: r.error });
            else if (r && r.ok && typeof r.data === "string") setMsg({ ok: true, text: r.data });
          });
        }}
      >
        {pending ? "…" : children}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-lime-700" : "text-red-700"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</span>}
    </span>
  );
}
