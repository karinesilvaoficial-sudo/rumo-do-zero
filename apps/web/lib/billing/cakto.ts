import { createHmac, timingSafeEqual } from "node:crypto";
import { type Interval, type PaidPlan, prepaidPeriod } from "./core";
import type { BillingStore } from "./events";

/**
 * Pix pré-pago pela Cakto (checkout hospedado da Cakto).
 *  • O botão do app manda o usuário para pay.cakto.com.br/<oferta>?callback=<token>.
 *  • O token é ASSINADO pelo servidor (usuário + plano + período + nonce): o webhook não confia em
 *    e-mail digitado no checkout nem em nada vindo do navegador.
 *  • O acesso só é liberado pelo webhook verificado (assinatura HMAC no header ou secret no corpo).
 *  • Idempotência: source_ref = "cakto:<id do pedido>" é único em access_periods.
 *  • A oferta paga precisa ser exatamente a oferta configurada para aquele plano/período.
 */
export type CaktoOffers = Map<string, { plan: PaidPlan; interval: Interval }>;

const PLAN_CODES: Record<string, PaidPlan> = { p: "pro", m: "max", u: "unlimited" };
const PLAN_LETTER: Record<PaidPlan, string> = { pro: "p", max: "m", unlimited: "u" };

export function caktoOffers(env: Record<string, unknown>): CaktoOffers {
  const m: CaktoOffers = new Map();
  for (const plan of ["pro", "max", "unlimited"] as const)
    for (const interval of ["month", "year"] as const) {
      const v = env[`CAKTO_OFFER_${plan.toUpperCase()}_${interval === "year" ? "YEAR" : "MONTH"}`];
      if (typeof v === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(v)) m.set(v, { plan, interval });
    }
  return m;
}

export function offerFor(offers: CaktoOffers, plan: PaidPlan, interval: Interval): string | null {
  for (const [id, o] of offers) if (o.plan === plan && o.interval === interval) return id;
  return null;
}

const key = (secret: string) => createHmac("sha256", secret).update("rumo:cakto-callback:v1").digest();
const b64 = (b: Buffer) => b.toString("base64url");

/** Token opaco (charset aceito pela Cakto: letras, números, . _ ~ -), sem dado pessoal. */
export function signCallback(secret: string, userId: string, plan: PaidPlan, interval: Interval, nonce: string): string {
  const body = `${userId.replace(/-/g, "")}.${PLAN_LETTER[plan]}${interval === "year" ? "y" : "m"}.${nonce}`;
  return `${body}.${b64(createHmac("sha256", key(secret)).update(body).digest()).slice(0, 32)}`;
}

export function verifyCallback(secret: string, token: unknown): { userId: string; plan: PaidPlan; interval: Interval } | null {
  if (typeof token !== "string" || token.length > 255) return null;
  const m = /^([0-9a-f]{32})\.([pmu])([my])\.([A-Za-z0-9_-]{6,40})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  const body = `${m[1]}.${m[2]}${m[3]}.${m[4]}`;
  const exp = Buffer.from(b64(createHmac("sha256", key(secret)).update(body).digest()).slice(0, 32));
  const got = Buffer.from(m[5]!);
  if (exp.length !== got.length || !timingSafeEqual(exp, got)) return null;
  const h = m[1]!;
  return { userId: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`, plan: PLAN_CODES[m[2]!]!, interval: m[3] === "y" ? "year" : "month" };
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Origem da entrega: assinatura v1 no header (preferida) ou secret no corpo (legado). */
export function verifyCaktoDelivery(secret: string, raw: string, headers: { timestamp: string | null; signature: string | null }, nowSec = Date.now() / 1000): boolean {
  if (headers.signature && headers.timestamp) {
    const t = Number(headers.timestamp);
    if (!Number.isFinite(t) || Math.abs(nowSec - t) > 300) return false;
    const exp = `v1=${createHmac("sha256", secret).update(`${headers.timestamp}.`).update(raw).digest("hex")}`;
    return headers.signature.split(",").map((s) => s.trim()).some((s) => safeEq(s, exp));
  }
  try {
    const body = JSON.parse(raw) as { secret?: unknown };
    return typeof body.secret === "string" && safeEq(body.secret, secret);
  } catch { return false; }
}

type Order = { id?: unknown; status?: unknown; callback?: unknown; offer?: { id?: unknown } | null; amount?: unknown; currency?: unknown; paymentMethod?: unknown };
export type CaktoResult = "processed" | "duplicate" | "ignored" | "rejected";

export async function handleCaktoEvent(payload: { event?: unknown; data?: unknown }, deps: { store: BillingStore; secret: string; offers: CaktoOffers; now?: Date }): Promise<{ result: CaktoResult; reason?: string }[]> {
  const orders = (Array.isArray(payload.data) ? payload.data : [payload.data]).filter((o): o is Order => Boolean(o) && typeof o === "object");
  const out: { result: CaktoResult; reason?: string }[] = [];
  for (const o of orders) out.push(await one(String(payload.event ?? ""), o, deps));
  return out;
}

async function one(event: string, o: Order, { store, secret, offers, now = new Date() }: Parameters<typeof handleCaktoEvent>[1]): Promise<{ result: CaktoResult; reason?: string }> {
  const orderId = typeof o.id === "string" && o.id ? o.id : null;
  if (!orderId) return { result: "ignored", reason: "no_order_id" };
  const ref = `cakto:${orderId}`;
  switch (event) {
    case "purchase_approved": {
      if (o.status !== "paid") return { result: "ignored", reason: "not_paid" };
      const cb = verifyCallback(secret, o.callback);
      if (!cb) return { result: "rejected", reason: "bad_callback" };
      const offerId = typeof o.offer?.id === "string" ? o.offer.id : "";
      const offer = offers.get(offerId);
      if (!offer || offer.plan !== cb.plan || offer.interval !== cb.interval) return { result: "rejected", reason: "offer_mismatch" };
      if (o.currency !== undefined && o.currency !== "BRL") return { result: "rejected", reason: "currency" };
      if (!(typeof o.amount === "number" && o.amount > 0)) return { result: "rejected", reason: "amount" };
      const p = prepaidPeriod(now, await store.latestAccessEnd(cb.userId), cb.interval);
      const inserted = await store.insertAccessPeriod({ user_id: cb.userId, plan_code: cb.plan, source: "pix_prepaid", source_ref: ref, payment_ref: ref, ...p });
      if (!inserted) return { result: "duplicate" };
      await store.notify(cb.userId, "billing", "Pagamento confirmado", `Seu plano está ativo até ${p.ends_at.toLocaleDateString("pt-BR")}. A renovação por Pix é manual.`, `caktook:${orderId}`);
      return { result: "processed" };
    }
    case "refund":
      // Cakto só emite "refund" para estorno efetivado (Pix avulso não tem estorno parcial)
      await store.revokeByPayment(ref, "refund");
      return { result: "processed" };
    case "chargeback":
    case "dispute_defense_requested":
      await store.revokeByPayment(ref, "dispute");
      return { result: "processed" };
    case "pix_expirado": {
      const cb = verifyCallback(secret, o.callback);
      if (cb && o.status === "canceled") await store.notify(cb.userId, "billing", "Pix não confirmado", "O Pix expirou sem pagamento. Nada foi cobrado; você pode gerar um novo em Assinatura.", `caktoexp:${orderId}`);
      return { result: "processed" };
    }
    default:
      return { result: "ignored" };
  }
}
