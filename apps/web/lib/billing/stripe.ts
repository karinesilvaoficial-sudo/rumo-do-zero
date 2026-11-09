import "server-only";
import { PLANS } from "@rumo/contracts";
import Stripe from "stripe";
import { requireIntegration } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PaidPlan } from "./core";
import type { BillingStore, StripeLookups } from "./events";

export function stripe() {
  const e = requireIntegration("billing");
  return new Stripe(e.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "RUMO" } });
}

export const PLAN_PRICES = Object.fromEntries(PLANS.filter((p) => p.code !== "free").map((p) => [p.code, { monthly_cents: p.monthly_cents, annual_cents: p.annual_cents }])) as Record<PaidPlan, { monthly_cents: number; annual_cents: number }>;

export function supabaseBillingStore(): BillingStore {
  const db = supabaseAdmin();
  const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  return {
    async recordEvent(id, type, createdAt) {
      const ins = await db.from("provider_events").insert({ id, provider: "stripe", type, provider_created_at: createdAt.toISOString(), attempts: 1 }).select("id");
      if (!ins.error) return "new";
      const cur = ok(await db.from("provider_events").select("processed_at,attempts").eq("id", id).maybeSingle());
      if (!cur) throw new Error("event_record_failed");
      if (cur.processed_at) return "seen";
      await db.from("provider_events").update({ attempts: (cur.attempts ?? 0) + 1 }).eq("id", id);
      return "new"; // tentativa anterior falhou: reprocessa (efeitos são idempotentes)
    },
    async finishEvent(id, error) {
      ok(await db.from("provider_events").update(error ? { last_error: error } : { processed_at: new Date().toISOString(), last_error: null }).eq("id", id));
    },
    async userForCustomer(c) {
      return ok(await db.from("billing_accounts").select("user_id").eq("stripe_customer_id", c).maybeSingle())?.user_id ?? null;
    },
    async upsertSubscription(r) {
      const cur = ok(await db.from("subscriptions").select("provider_updated_at").eq("stripe_subscription_id", r.stripe_subscription_id).maybeSingle());
      if (cur && new Date(cur.provider_updated_at) > r.provider_updated_at) return; // evento mais antigo: ignora
      ok(await db.from("subscriptions").upsert({ ...r, current_period_start: r.current_period_start?.toISOString() ?? null, current_period_end: r.current_period_end?.toISOString() ?? null, provider_updated_at: r.provider_updated_at.toISOString() }, { onConflict: "stripe_subscription_id" }));
    },
    async insertAccessPeriod(r) {
      const res = await db.from("access_periods").upsert({ ...r, starts_at: r.starts_at.toISOString(), ends_at: r.ends_at.toISOString() }, { onConflict: "source_ref", ignoreDuplicates: true }).select("id");
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []).length > 0;
    },
    async latestAccessEnd(userId) {
      const r = ok(await db.from("access_periods").select("ends_at").eq("user_id", userId).is("revoked_at", null).order("ends_at", { ascending: false }).limit(1).maybeSingle());
      return r ? new Date(r.ends_at) : null;
    },
    async revokeByPayment(ref, reason) {
      const r = ok(await db.from("access_periods").update({ revoked_at: new Date().toISOString(), revoke_reason: reason }).eq("payment_ref", ref).is("revoked_at", null).select("id,user_id"));
      for (const p of r ?? []) await db.from("audit_log").insert({ action: "revoke_access", entity: "access_period", entity_id: p.id, actor_id: null, detail: { reason } });
      return (r ?? []).length;
    },
    async setQuotaAnchorIfEmpty(userId, anchor) {
      ok(await db.from("billing_accounts").update({ quota_anchor: anchor.toISOString() }).eq("user_id", userId).is("quota_anchor", null));
    },
    async notify(userId, kind, title, body, dedupe) {
      await db.from("notifications").upsert({ user_id: userId, kind, title, body, link: "/app/assinatura", dedupe_key: dedupe }, { onConflict: "dedupe_key", ignoreDuplicates: true });
      const { data: u } = await db.auth.admin.getUserById(userId);
      if (u.user?.email) await db.from("outbox").upsert({ kind: "email", dedupe_key: `email:${dedupe}`, payload: { to: u.user.email, template: "billing", title, body } }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    },
  };
}

export function stripeLookups(s: Stripe): StripeLookups {
  return {
    subscription: (id) => s.subscriptions.retrieve(id),
    async invoicePaymentIntent(invoiceId) {
      const list = await s.invoicePayments.list({ invoice: invoiceId, limit: 1 });
      const pi = list.data[0]?.payment?.payment_intent;
      return typeof pi === "string" ? pi : pi?.id ?? null;
    },
  };
}

/** Cliente do provedor do usuário (criado sob demanda; id guardado só no servidor). */
export async function ensureCustomer(s: Stripe, user: { id: string; email: string | null }) {
  const db = supabaseAdmin();
  const { data } = await db.from("billing_accounts").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id as string;
  const c = await s.customers.create({ email: user.email ?? undefined, metadata: { rumo_user_id: user.id } }, { idempotencyKey: `customer:${user.id}` });
  await db.from("billing_accounts").upsert({ user_id: user.id, stripe_customer_id: c.id }, { onConflict: "user_id" });
  return c.id;
}
