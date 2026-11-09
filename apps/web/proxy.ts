import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (Next 16): CSP com nonce, renovação de sessão Supabase e proteção de rotas /app.
 * A autorização efetiva acontece no servidor/banco; aqui só redirecionamos sem sessão.
 */
export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supa ? " " + supa : ""}`,
    `media-src 'self' blob:${supa ? " " + supa : ""}`,
    `connect-src 'self'${supa ? ` ${supa} ${supa.replace("https://", "wss://")}` : ""}`,
    "font-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("content-security-policy", csp);
  let response = NextResponse.next({ request: { headers: reqHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let hasUser = false;
  if (url && key) {
    const sb = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: reqHeaders } });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    const { data } = await sb.auth.getClaims();
    hasUser = Boolean(data?.claims?.sub);
  }

  const path = request.nextUrl.pathname;
  if (path.startsWith("/app") && !hasUser) {
    const login = request.nextUrl.clone();
    login.pathname = "/entrar";
    login.search = "";
    login.searchParams.set("next", path + request.nextUrl.search);
    const r = NextResponse.redirect(login);
    r.headers.set("content-security-policy", csp);
    return r;
  }
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|woff2|glb|ktx2|hdr)$|api/webhooks|api/cron).*)"],
};
