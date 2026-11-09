import { cronAuthorized } from "@/lib/cron/auth";
import { processOutbox, removeExpiredReportFiles } from "@/lib/cron/workers";
import { reconcileSubscriptions } from "@/lib/billing/reconcile";
import { integrationStatus } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Diário (cron em UTC): recorrências (próximos 90 dias), lembretes (fuso de cada espaço, no SQL),
 * manutenção, reconciliação de cobrança com o provedor e envio da fila.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("unauthorized", { status: 401 });
  const priv = supabaseAdmin().schema("private" as "public");
  const until = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const steps: Record<string, unknown> = {};
  const run = async (name: string, f: () => Promise<unknown>) => { try { steps[name] = await f(); } catch (e) { steps[name] = { error: (e as Error).message.slice(0, 120) }; } };
  await run("recurring", async () => (await priv.rpc("cron_generate_occurrences", { p_until: until })).data);
  await run("reminders", async () => (await priv.rpc("cron_due_reminders", {})).data);
  await run("housekeeping", async () => (await priv.rpc("cron_housekeeping", {})).data);
  await run("expired_files", removeExpiredReportFiles);
  if (integrationStatus().billing) await run("reconcile", reconcileSubscriptions);
  await run("outbox", processOutbox);
  return Response.json({ steps, at: new Date().toISOString() });
}
