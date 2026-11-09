import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireIntegration } from "@/lib/env";

/**
 * Cliente privilegiado (service role). Uso restrito: webhooks de pagamento, cron/filas e
 * notificações. NUNCA para consultas iniciadas por usuário (essas usam supabaseServer + RLS).
 */
export function supabaseAdmin() {
  const e = requireIntegration("admin_db");
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL!, e.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
