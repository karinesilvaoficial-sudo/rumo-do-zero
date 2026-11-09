import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { priceMap } from "./core";
import { handleEvent } from "./events";
import { PLAN_PRICES, stripe, stripeLookups, supabaseBillingStore } from "./stripe";
import { env } from "@/lib/env";
import type Stripe from "stripe";

/**
 * Reconciliação periódica: lê o estado atual das assinaturas no provedor e reaplica como eventos
 * sintéticos idempotentes (ids "reconcile:..."), sem depender da ordem de chegada dos webhooks.
 */
export async function reconcileSubscriptions(limit = 100) {
  const s = stripe();
  const db = supabaseAdmin();
  const { data } = await db.from("subscriptions").select("stripe_subscription_id").in("status", ["active", "trialing", "past_due", "incomplete"]).limit(limit);
  const deps = { store: supabaseBillingStore(), stripe: stripeLookups(s), prices: priceMap(env()), plans: PLAN_PRICES };
  let n = 0;
  for (const row of data ?? []) {
    const sub = await s.subscriptions.retrieve(row.stripe_subscription_id, { expand: ["latest_invoice"] });
    const now = Math.floor(Date.now() / 1000);
    await handleEvent({ id: `reconcile:sub:${sub.id}:${now}`, type: "customer.subscription.updated", created: now, data: { object: sub } } as unknown as Stripe.Event, deps);
    const inv = sub.latest_invoice as Stripe.Invoice | null;
    if (inv && inv.status === "paid") await handleEvent({ id: `reconcile:inv:${inv.id}`, type: "invoice.paid", created: now, data: { object: inv } } as unknown as Stripe.Event, deps);
    n++;
  }
  return { checked: n };
}
