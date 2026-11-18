"use client";
import { useState } from "react";
import { ActionForm } from "./ActionForm";
import { deleteCollection } from "@/actions/assessments";

/** Excluir a coleta (Administrador): apaga os dados dela no banco do cliente. Pede para digitar EXCLUIR. */
export function DeleteCollection({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <div className="mb-6 flex justify-end"><button type="button" className="text-sm text-red-700 hover:underline" onClick={() => setOpen(true)}>Excluir esta coleta…</button></div>;
  return (
    <section className="card mb-6 border-red-200">
      <h2 className="card-title text-red-800">Excluir coleta</h2>
      <p className="mb-3 text-sm text-slate-700">
        Apaga <b>todos os dados desta coleta no banco do cliente</b> (sites, arquivos, lixeira, licenças, adoção, e-mail, Intune, agregações e log) e tira a coleta do portal e do relatório.
        As outras coletas não são afetadas. <b>Não dá para desfazer.</b>
      </p>
      <ActionForm action={deleteCollection.bind(null, id)} className="flex flex-wrap items-end gap-3" submit="Excluir definitivamente" submitClass="btn-danger"
        confirm="Excluir esta coleta e apagar os dados dela no banco do cliente?">
        <label className="block">
          <span className="label">Digite EXCLUIR para confirmar</span>
          <input name="confirmText" required pattern="[Ee][Xx][Cc][Ll][Uu][Ii][Rr]" autoComplete="off" className="input !w-48" />
        </label>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
      </ActionForm>
    </section>
  );
}
