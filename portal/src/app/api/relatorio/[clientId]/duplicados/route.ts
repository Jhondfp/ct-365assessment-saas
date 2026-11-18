import { readQuery } from "@/lib/tenantDb";
import { clientDbFor } from "../guard";

/** CSV com todas as cópias de um arquivo duplicado (mesmo hash) numa coleta: onde está, tamanho, dono e datas. */
export const dynamic = "force-dynamic";
const csvCell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 19).replace("T", " ") : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // evita fórmula ao abrir no Excel
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const g = await clientDbFor(clientId);
  if (g.err) return g.err;
  const u = new URL(req.url);
  const execution = u.searchParams.get("execution") ?? "", hash = u.searchParams.get("hash") ?? "";
  if (!/^[\w-]{8,64}$/.test(execution) || !hash || hash.length > 128) return new Response("Parâmetros inválidos", { status: 400 });
  const rows = await readQuery(g.db, `
    SELECT TOP 20000 file_name, site_name, site_url, file_url, file_size, total_file_size, versions_count, owner_name, owner_mail,
           created_date, last_modified_date, last_modified_mail
    FROM dbo.files_info WHERE execution_id = @e AND file_hash = @h ORDER BY site_url, file_url`, { e: execution, h: hash }, 120_000);
  const head = ["Arquivo", "Site", "URL do site", "URL do arquivo", "Tamanho (bytes)", "Tamanho com versões (bytes)", "Versões", "Criado por", "E-mail do criador", "Criado em", "Alterado em", "Alterado por"];
  const keys = ["file_name", "site_name", "site_url", "file_url", "file_size", "total_file_size", "versions_count", "owner_name", "owner_mail", "created_date", "last_modified_date", "last_modified_mail"];
  const body = [head.join(";"), ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(";"))].join("\r\n");
  const name = String(rows[0]?.file_name ?? "duplicado").replace(/[^\w.-]+/g, "_").slice(0, 60);
  return new Response("﻿" + body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="duplicado-${name}.csv"`, "Cache-Control": "no-store" },
  });
}
