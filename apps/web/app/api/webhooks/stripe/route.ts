import type { NextRequest } from "next/server";
import { priceMap } from "@/lib/billing/core";
import { handleEvent } from "@/lib/billing/events";
import { PLAN_PRICES, stripe, stripeLookups, supabaseBillingStore } from "@/lib/billing/stripe";
import { env, integrationStatus } from "@/lib/env";

export const runtime = "nodejs";

/** Webhook: assinatura verificada sobre o CORPO BRUTO; id do evento gravado; efeitos idempotentes. */
export async function POST(req: NextRequest) {
  if (!integrationStatus().billing || !integrationStatus().admin_db) return new Response("not configured", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });
  const raw = await req.text();
  const s = stripe();
  let event;
  try {
    event = s.webhooks.constructEvent(raw, sig, env().STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  try {
    const r = await handleEvent(event, { store: supabaseBillingStore(), stripe: stripeLookups(s), prices: priceMap(env()), plans: PLAN_PRICES });
    return Response.json({ received: true, result: r });
  } catch (e) {
    console.error("[stripe-webhook]", event.type, (e as Error).message.slice(0, 120));
    return new Response("processing error", { status: 500 }); // o provedor reenvia
  }
}
