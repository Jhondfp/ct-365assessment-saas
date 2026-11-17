import { unstable_rethrow } from "next/navigation";

export type ActResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

/** Envolve uma server action: erros de regra viram { ok:false, error } (o Next esconde mensagens de exceção em produção). */
export function act<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  return async (...a: A): Promise<ActResult<R>> => {
    try {
      return { ok: true, data: await fn(...a) };
    } catch (e) {
      unstable_rethrow(e); // redirect / notFound seguem o fluxo do Next
      console.error(e);
      const msg = e instanceof Error ? e.message : "Erro inesperado";
      return { ok: false, error: /prisma|invocation/i.test(msg) ? traduz(msg) : msg };
    }
  };
}

function traduz(msg: string) {
  if (msg.includes("Unique constraint")) return "Já existe um registro com esse valor (campo único).";
  if (msg.includes("No record") || msg.includes("not found")) return "Registro não encontrado.";
  return "Erro ao gravar no banco de dados.";
}
