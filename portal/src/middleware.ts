import { NextResponse, type NextRequest } from "next/server";

/**
 * Domínio canônico: quem abre uma página pelo endereço padrão do Container Apps vai para o domínio próprio (AUTH_URL),
 * senão o login Microsoft volta para outro host e os cookies do login não existem lá. APIs (coletor, callbacks,
 * health) continuam respondendo em qualquer host.
 */
const canonical = (() => { try { return process.env.AUTH_URL ? new URL(process.env.AUTH_URL) : null; } catch { return null; } })();

export function middleware(req: NextRequest) {
  if (!canonical) return NextResponse.next();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  if (!host || host === canonical.host || !host.endsWith(".azurecontainerapps.io")) return NextResponse.next();
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, canonical);
  return NextResponse.redirect(url, 308);
}

export const config = { matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:png|svg|ico|css|js|woff2?)$).*)"] };
