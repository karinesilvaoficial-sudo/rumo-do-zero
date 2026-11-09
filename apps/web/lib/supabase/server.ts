import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env, NotConfiguredError } from "@/lib/env";

/** Cliente com a sessão do usuário: todas as consultas passam por RLS. */
export async function supabaseServer() {
  const e = env();
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new NotConfiguredError("supabase");
  const store = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // chamado em Server Component: o proxy renova a sessão
        }
      },
    },
  });
}

export type AuthedUser = { id: string; email: string | null };

/**
 * Identidade verificada no servidor (assinatura do JWT validada pelo Auth via getClaims;
 * nunca apenas a leitura do cookie).
 */
export async function currentUser(): Promise<AuthedUser | null> {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
}
