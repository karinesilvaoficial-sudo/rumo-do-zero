import "server-only";
import { env } from "@/lib/env";

export function publicAuthConfig() {
  const e = env();
  return {
    url: e.NEXT_PUBLIC_SUPABASE_URL ?? "",
    key: e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    appUrl: e.NEXT_PUBLIC_APP_URL,
    configured: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  };
}
export type PublicAuthConfig = ReturnType<typeof publicAuthConfig>;
