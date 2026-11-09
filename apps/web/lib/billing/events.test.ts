import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { type BillingStore, handleEvent } from "./events";

/** Armazenamento em memória com as mesmas garantias do banco (source_ref único, ordem por data do evento). */
function memStore() {
  const events = new Map<string, { processed: boolean; error: string | null }>();
  const subs = new Map<string, { status: string; plan_code: string; provider_updated_at: Date }>();
  const periods: { user_id: string; plan_code: string; source_ref: string; payment_ref: string | null; starts_at: Date; ends_at: Date; revoked?: string }[] = [];
  const notes: string[] = [];
  let anchor: Date | null = null;
  const store: BillingStore = {
    async recordEvent(id) { if (events.get(id)?.processed) return "seen"; events.set(id, { processed: false, error: null }); return "new"; },
    async finishEvent(id, error) { events.set(id, { processed: !error, error }); },
    async userForCustomer(c) { return c === "cus_1" ? "user-1" : null; },
    async upsertSubscription(r) { const cur = subs.get(r.stripe_subscription_id); if (!cur || cur.provider_updated_at <= r.provider_updated_at) subs.set(r.stripe_subscription_id, r); },
    async insertAccessPeriod(r) { if (periods.some((p) => p.source_ref === r.source_ref)) return false; periods.push({ ...r }); return true; },
    async latestAccessEnd() { const live = periods.filter((p) => !p.revoked).map((p) => p.ends_at.getTime()); return live.length ? new Date(Math.max(...live)) : null; },
    async revokeByPayment(ref, reason) { let n = 0; for (const p of periods) if (p.payment_ref === ref && !p.revoked) { p.revoked = reason; n++; } return n; },
    async setQuotaAnchorIfEmpty(_u, a) { anchor ??= a; },
    async notify(_u, _k, title, _b, dedupe) { if (!notes.includes(dedupe)) notes.push(dedupe); void title; },
  };
  return { store, events, subs, periods, notes, anchor: () => anchor };
}

const prices = new Map([["price_pro_m", { plan: "pro" as const, interval: "month" as const }], ["price_max_y", { plan: "max" as const, interval: "year" as const }]]);
const plans = { pro: { monthly_cents: 1990, annual_cents: 19900 }, max: { monthly_cents: 4990, annual_cents: 49900 }, unlimited: { monthly_cents: 14990, annual_cents: 149900 } };
const sub = (status: string, price = "price_pro_m") => ({ id: "sub_1", object: "subscription", customer: "cus_1", status, cancel_at_period_end: false, billing_cycle_anchor: 1798761600,
  items: { data: [{ price: { id: price }, current_period_start: 1798761600, current_period_end: 1801440000 }] } }) as unknown as Stripe.Subscription;
const ev = (id: string, type: string, object: unknown, created = 1798761600) => ({ id, type, created, data: { object } }) as unknown as Stripe.Event;
const lookups = (s: Stripe.Subscription) => ({ subscription: async () => s, invoicePaymentIntent: async () => "pi_inv_1" });
const invoice = { id: "in_1", object: "invoice", customer: "cus_1", parent: { subscription_details: { subscription: "sub_1" } },
  lines: { data: [{ pricing: { price_details: { price: "price_pro_m" } }, period: { start: 1798761600, end: 1801440000 } }] } };

describe("stripe events", () => {
  it("invoice.paid grants exactly one period; duplicate event is ignored", async () => {
    const m = memStore();
    const deps = { store: m.store, stripe: lookups(sub("active")), prices, plans };
    expect(await handleEvent(ev("evt_1", "invoice.paid", invoice), deps)).toBe("processed");
    expect(await handleEvent(ev("evt_1", "invoice.paid", invoice), deps)).toBe("duplicate");
    // mesmo pagamento chegando com OUTRO id de evento: source_ref único impede segundo período
    await handleEvent(ev("evt_1b", "invoice.paid", invoice), deps);
    expect(m.periods).toHaveLength(1);
    expect(m.periods[0]).toMatchObject({ plan_code: "pro", payment_ref: "pi_inv_1" });
    expect(m.anchor()).toEqual(new Date(1798761600 * 1000));
  });

  it("out-of-order subscription events do not regress state", async () => {
    const m = memStore();
    const deps = { store: m.store, stripe: lookups(sub("active")), prices, plans };
    await handleEvent(ev("evt_new", "customer.subscription.updated", sub("canceled"), 2000), deps);
    await handleEvent(ev("evt_old", "customer.subscription.updated", sub("active"), 1000), deps);
    expect(m.subs.get("sub_1")?.status).toBe("canceled");
  });

  it("checkout return without paid status grants nothing; Pix async success grants prepaid period once", async () => {
    const m = memStore();
    const deps = { store: m.store, stripe: lookups(sub("active")), prices, plans };
    const session = { id: "cs_1", mode: "payment", payment_status: "unpaid", amount_total: 19900, currency: "brl", customer: "cus_1", client_reference_id: "user-1", payment_intent: "pi_pix_1", metadata: { plan: "pro", interval: "year" } };
    expect(await handleEvent(ev("evt_c1", "checkout.session.completed", session), deps)).toBe("ignored");
    expect(m.periods).toHaveLength(0);
    await handleEvent(ev("evt_c2", "checkout.session.async_payment_succeeded", { ...session, payment_status: "paid" }), deps);
    await handleEvent(ev("evt_c3", "checkout.session.async_payment_succeeded", { ...session, payment_status: "paid" }), deps);
    expect(m.periods).toHaveLength(1);
    const p = m.periods[0]!;
    expect(p.ends_at.getUTCFullYear() - p.starts_at.getUTCFullYear()).toBe(1);
  });

  it("prepaid amount must match server price (metadata is not authority)", async () => {
    const m = memStore();
    const deps = { store: m.store, stripe: lookups(sub("active")), prices, plans };
    const forged = { id: "cs_2", mode: "payment", payment_status: "paid", amount_total: 100, currency: "brl", customer: "cus_1", client_reference_id: "user-1", payment_intent: "pi_x", metadata: { plan: "unlimited", interval: "year" } };
    await expect(handleEvent(ev("evt_f", "checkout.session.completed", forged), deps)).rejects.toThrow("amount_mismatch");
    expect(m.periods).toHaveLength(0);
    expect(m.events.get("evt_f")).toMatchObject({ processed: false });
  });

  it("full refund and dispute revoke the linked period; partial refund keeps it", async () => {
    const m = memStore();
    const deps = { store: m.store, stripe: lookups(sub("active")), prices, plans };
    await handleEvent(ev("evt_1", "invoice.paid", invoice), deps);
    await handleEvent(ev("evt_r1", "charge.refunded", { payment_intent: "pi_inv_1", amount: 1990, amount_refunded: 500 }), deps);
    expect(m.periods[0]!.revoked).toBeUndefined();
    await handleEvent(ev("evt_d1", "charge.dispute.created", { payment_intent: "pi_inv_1" }), deps);
    expect(m.periods[0]!.revoked).toBe("dispute");
  });

  it("webhook signature: only the raw body signed with the secret verifies", () => {
    const stripe = new Stripe("sk_test_dummy");
    const secret = "whsec_test_secret";
    const payload = JSON.stringify({ id: "evt_sig", type: "invoice.paid", created: 1, data: { object: {} } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, header, secret).id).toBe("evt_sig");
    expect(() => stripe.webhooks.constructEvent(payload.replace("evt_sig", "evt_xxx"), header, secret)).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, header, "whsec_other")).toThrow();
  });
});
