import type Stripe from "stripe";
import { type Interval, type PaidPlan, prepaidPeriod, refundAction } from "./core";

/**
 * Processamento dos eventos de cobrança. Princípios:
 *  • acesso NUNCA é liberado pela página de sucesso nem por metadado do cliente — só por evento verificado;
 *  • cada período pago é uma linha com source_ref único (idempotente a reenvios);
 *  • assinatura local só é atualizada por evento mais novo (ordem fora de sequência não regride estado);
 *  • estorno total/contestação revoga o período ligado ao pagamento, sem apagar dados financeiros.
 */
export interface BillingStore {
  recordEvent(id: string, type: string, createdAt: Date): Promise<"new" | "seen">;
  finishEvent(id: string, error: string | null): Promise<void>;
  userForCustomer(customerId: string): Promise<string | null>;
  upsertSubscription(row: { user_id: string; stripe_subscription_id: string; plan_code: PaidPlan; billing_interval: Interval; status: string; current_period_start: Date | null; current_period_end: Date | null; cancel_at_period_end: boolean; provider_updated_at: Date }): Promise<void>;
  insertAccessPeriod(row: { user_id: string; plan_code: PaidPlan; source: "stripe_subscription" | "pix_prepaid"; source_ref: string; payment_ref: string | null; starts_at: Date; ends_at: Date }): Promise<boolean>;
  latestAccessEnd(userId: string): Promise<Date | null>;
  revokeByPayment(paymentRef: string, reason: string): Promise<number>;
  setQuotaAnchorIfEmpty(userId: string, anchor: Date): Promise<void>;
  notify(userId: string, kind: string, title: string, body: string, dedupe: string): Promise<void>;
}

export interface StripeLookups {
  subscription(id: string): Promise<Stripe.Subscription>;
  invoicePaymentIntent(invoiceId: string): Promise<string | null>;
}

type PriceInfo = { plan: PaidPlan; interval: Interval };
const ts = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

export async function handleEvent(event: Stripe.Event, deps: { store: BillingStore; stripe: StripeLookups; prices: Map<string, PriceInfo>; plans: Record<PaidPlan, { monthly_cents: number; annual_cents: number }> }): Promise<"processed" | "duplicate" | "ignored"> {
  const { store } = deps;
  if ((await store.recordEvent(event.id, event.type, new Date(event.created * 1000))) === "seen") return "duplicate";
  try {
    const r = await apply(event, deps);
    await store.finishEvent(event.id, null);
    return r;
  } catch (e) {
    await store.finishEvent(event.id, (e as Error).message.slice(0, 300));
    throw e; // 5xx → o provedor reenviará; o registro do evento permite reprocessar
  }
}

async function apply(event: Stripe.Event, { store, stripe, prices, plans }: Parameters<typeof handleEvent>[1]): Promise<"processed" | "ignored"> {
  const created = new Date(event.created * 1000);
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return syncSubscription(sub, created, store, prices);
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const subId = inv.parent?.subscription_details?.subscription;
      if (!subId || !inv.customer) return "ignored";
      const user = await store.userForCustomer(typeof inv.customer === "string" ? inv.customer : inv.customer.id);
      if (!user) throw new Error("unknown_customer");
      const line = inv.lines.data.find((l) => l.pricing?.price_details?.price && prices.has(String(l.pricing.price_details.price)));
      const info = line ? prices.get(String(line.pricing!.price_details!.price)) : undefined;
      if (!line || !info) throw new Error("unknown_price");
      const sub = await stripe.subscription(typeof subId === "string" ? subId : subId.id);
      await syncSubscription(sub, created, store, prices);
      await store.insertAccessPeriod({ user_id: user, plan_code: info.plan, source: "stripe_subscription", source_ref: inv.id!, payment_ref: await stripe.invoicePaymentIntent(inv.id!),
        starts_at: ts(line.period.start)!, ends_at: ts(line.period.end)! });
      // âncora das cotas: início do ciclo da assinatura (não muda com troca de plano)
      await store.setQuotaAnchorIfEmpty(user, ts(sub.billing_cycle_anchor) ?? ts(line.period.start)!);
      return "processed";
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const user = inv.customer ? await store.userForCustomer(typeof inv.customer === "string" ? inv.customer : inv.customer.id) : null;
      if (user) await store.notify(user, "billing", "Pagamento não aprovado", "Não conseguimos cobrar sua assinatura. Atualize o meio de pagamento em Assinatura para manter o plano após o período já pago.", `payfail:${inv.id}`);
      return "processed";
    }
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode !== "payment" || s.payment_status !== "paid") return "ignored"; // Pix ainda pendente: aguarda async_payment_succeeded
      return grantPrepaid(s, store, plans);
    }
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const user = s.customer ? await store.userForCustomer(typeof s.customer === "string" ? s.customer : s.customer.id) : null;
      if (user) await store.notify(user, "billing", "Pix não confirmado", "O pagamento por Pix expirou ou não foi confirmado. Nenhum valor foi cobrado; você pode gerar um novo.", `pixfail:${s.id}`);
      return "processed";
    }
    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      const pi = typeof c.payment_intent === "string" ? c.payment_intent : c.payment_intent?.id;
      if (pi && refundAction(c.amount_refunded, c.amount, false) === "revoke") await store.revokeByPayment(pi, "refund");
      return "processed";
    }
    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const pi = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
      if (pi) await store.revokeByPayment(pi, "dispute");
      return "processed";
    }
    default:
      return "ignored";
  }
}

async function syncSubscription(sub: Stripe.Subscription, at: Date, store: BillingStore, prices: Map<string, PriceInfo>) {
  const user = await store.userForCustomer(typeof sub.customer === "string" ? sub.customer : sub.customer.id);
  if (!user) throw new Error("unknown_customer");
  const item = sub.items.data[0];
  const info = item ? prices.get(item.price.id) : undefined;
  if (!item || !info) throw new Error("unknown_price");
  await store.upsertSubscription({ user_id: user, stripe_subscription_id: sub.id, plan_code: info.plan, billing_interval: info.interval, status: sub.status,
    current_period_start: ts(item.current_period_start), current_period_end: ts(item.current_period_end), cancel_at_period_end: sub.cancel_at_period_end, provider_updated_at: at });
  return "processed" as const;
}

async function grantPrepaid(s: Stripe.Checkout.Session, store: BillingStore, plans: Record<PaidPlan, { monthly_cents: number; annual_cents: number }>) {
  const plan = s.metadata?.plan as PaidPlan | undefined;
  const interval = s.metadata?.interval as Interval | undefined;
  if (!plan || !interval || !(plan in plans)) throw new Error("bad_session_metadata");
  // valor efetivamente pago deve bater com o preço do servidor (metadado sozinho não é autoridade)
  const expected = interval === "year" ? plans[plan].annual_cents : plans[plan].monthly_cents;
  if (s.amount_total !== expected || s.currency !== "brl") throw new Error("amount_mismatch");
  const user = s.customer ? await store.userForCustomer(typeof s.customer === "string" ? s.customer : s.customer.id) : null;
  if (!user || user !== s.client_reference_id) throw new Error("unknown_customer");
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const p = prepaidPeriod(new Date(), await store.latestAccessEnd(user), interval);
  await store.insertAccessPeriod({ user_id: user, plan_code: plan, source: "pix_prepaid", source_ref: pi ?? s.id, payment_ref: pi, ...p });
  await store.notify(user, "billing", "Pagamento confirmado", `Seu plano está ativo até ${p.ends_at.toLocaleDateString("pt-BR")}. A renovação por Pix é manual.`, `pixok:${s.id}`);
  return "processed" as const;
}
