import type { NextRequest } from "next/server";
import { caktoOffers, handleCaktoEvent, verifyCaktoDelivery } from "@/lib/billing/cakto";
import { supabaseBillingStore } from "@/lib/billing/stripe";
import { env, integrationStatus } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Webhook da Cakto (Pix pré-pago). Origem verificada pela assinatura HMAC do corpo bruto
 * (X-Cakto-Signature/X-Cakto-Timestamp) ou, na falta dos headers, pelo secret do corpo.
 * Efeitos idempotentes (source_ref único por pedido). Erro de processamento → 500, que fica
 * marcado como falha no histórico da Cakto e pode ser reenviado pelo painel/API.
 */
export async function POST(req: NextRequest) {
  if (!integrationStatus().pix || !integrationStatus().admin_db) return new Response("not configured", { status: 503 });
  const raw = await req.text();
  if (raw.length > 512_000) return new Response("too large", { status: 413 });
  const secret = env().CAKTO_WEBHOOK_SECRET!;
  if (!verifyCaktoDelivery(secret, raw, { timestamp: req.headers.get("x-cakto-timestamp"), signature: req.headers.get("x-cakto-signature") }))
    return new Response("invalid signature", { status: 401 });
  let payload: { event?: unknown; data?: unknown };
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  try {
    const results = await handleCaktoEvent(payload, { store: supabaseBillingStore(), secret, offers: caktoOffers(env()) });
    for (const r of results) if (r.result === "rejected") console.warn("[cakto-webhook] rejected", String(payload.event).slice(0, 40), r.reason);
    return Response.json({ received: true, results });
  } catch (e) {
    console.error("[cakto-webhook]", String(payload.event).slice(0, 40), (e as Error).message.slice(0, 120));
    return new Response("processing error", { status: 500 });
  }
}
