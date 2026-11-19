"use client";
import { useState } from "react";

/** Guia de acesso para enviar ao cliente: texto pronto, com botões de copiar e baixar. */
export function SetupGuide({ title, text, file, open = false }: { title: string; text: string; file: string; open?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* sem permissão de área de transferência */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = file; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50" open={open}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-800">
        <span>{title}</span>
        <span className="flex gap-2" onClick={(e) => e.preventDefault()}>
          <button type="button" className="btn-secondary btn-sm" onClick={copy}>{copied ? "Copiado ✓" : "Copiar texto"}</button>
          <button type="button" className="btn-secondary btn-sm" onClick={download}>Baixar .txt</button>
        </span>
      </summary>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-slate-200 px-4 py-3 font-sans text-xs leading-relaxed text-slate-700">{text}</pre>
    </details>
  );
}
