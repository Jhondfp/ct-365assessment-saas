import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { currentUser, canSeeClient } from "@/lib/session";
import { can } from "@/lib/rbac";

/**
 * Dashboard do ct-assessmentspo (assets/dashboard.html, copiado sem alterações do src/ui do coletor).
 * Aqui só reapontamos as chamadas /api/executions e /api/dashboard do Start-Monitor.ps1 para as APIs do portal,
 * com escopo do cliente, e trocamos a navegação local pelos links do portal.
 * ?embed=1 esconde a barra lateral própria (quando aberto dentro do layout do portal).
 * ?execution=<id> abre direto numa execução.
 */
export const dynamic = "force-dynamic";
let cached: string | null = null;

function replaceOnce(html: string, from: string, to: string) {
  if (!html.includes(from)) throw new Error(`dashboard.html mudou: trecho não encontrado: ${from.slice(0, 60)}`);
  return html.replace(from, to);
}

export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const u = await currentUser();
  if (!u) return Response.redirect(new URL(`/login`, req.url));
  if (!u.active || !can(u.roles, "reports:view") || !canSeeClient(u, clientId)) return new Response("Sem acesso", { status: 403 });
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return new Response("Cliente não encontrado", { status: 404 });

  if (!cached || process.env.NODE_ENV !== "production") cached = await readFile(path.join(process.cwd(), "assets", "dashboard.html"), "utf8");
  const embed = new URL(req.url).searchParams.get("embed") === "1";
  const api = `/api/relatorio/${client.id}`;

  let html = cached;
  html = replaceOnce(html, "fetch('/api/executions')", "fetch(window.__CT_API+'/executions')");
  html = replaceOnce(html, "`/api/dashboard?execution=", "`${window.__CT_API}/dashboard?execution=");
  html = replaceOnce(html, ":'/api/dashboard';", ":window.__CT_API+'/dashboard';");
  html = replaceOnce(
    html,
    "return execs[0].execution_id;",
    "const pre=new URLSearchParams(location.search).get('execution');const pick=(pre&&execs.some(e=>e.execution_id===pre))?pre:execs[0].execution_id;sel.value=pick;return pick;",
  );
  html = replaceOnce(html, "Verifique se o servidor está rodando em http://localhost:8099", "Tente recarregar a página. Se persistir, verifique o banco do cliente no portal.");
  html = replaceOnce(html, 'href="/">', `href="/clientes/${client.id}" target="_top">`);
  html = replaceOnce(html, "Monitor de Execução", "Voltar ao portal");
  html = replaceOnce(html, 'href="/dashboard">', `href="/relatorio/${client.id}" target="_top">`);
  const inject = `<script>window.__CT_API=${JSON.stringify(api)};</script>${embed ? "<style>.sidebar{display:none!important}</style>" : ""}`;
  html = replaceOnce(html, "</head>", `${inject}</head>`);
  html = html.replace("<title>CT Assessment – Dashboard</title>", `<title>${client.name.replace(/[<>&]/g, "")} · CT Assessment</title>`);

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
