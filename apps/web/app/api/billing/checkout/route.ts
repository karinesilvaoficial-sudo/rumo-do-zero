import type { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { caktoOffers, offerFor, signCallback } from "@/lib/billing/cakto";
import { priceFor } from "@/lib/billing/core";
import { ensureCustomer, stripe } from "@/lib/billing/stripe";
import { env, integrationStatus } from "@/lib/env";
import { assertSameOrigin, errorResponse, HttpError, json, rateLimit } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
const In = z.object({ plan: z.enum(["pro", "max", "unlimited"]), interval: z.enum(["month", "year"]), method: z.enum(["card", "pix"]) });

/**
 * Checkout hospedado. Preço e plano resolvidos NO SERVIDOR. Cartão = assinatura com renovação automática.
 * Pix = pagamento pontual pela Cakto que antecipa o período (renovação manual). O link leva um token
 * assinado pelo servidor; o acesso só é liberado pelo webhook verificado da Cakto.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const b = In.parse(await req.json());
    const user = await currentUser();
    if (!user) throw new HttpError(401, "not_authenticated");
    await rateLimit(`checkout:${user.id}`, 5, 300);
    const e = env();
    const db = supabaseAdmin();
    const { data: subs } = await db.from("subscriptions").select("plan_code,billing_interval,status").eq("user_id", user.id).in("status", ["active", "trialing", "past_due"]);
    const app = e.NEXT_PUBLIC_APP_URL;

    if (b.method === "pix") {
      if (!integrationStatus().pix) throw new HttpError(503, "pix_unavailable", "Pix ainda não está disponível. Use cartão ou tente mais tarde.");
      if (subs?.length) throw new HttpError(409, "has_auto_renewal", "Você já tem renovação automática no cartão. Para evitar cobrança dupla, cancele-a no portal antes de pagar por Pix.");
      const offer = offerFor(caktoOffers(e), b.plan, b.interval);
      if (!offer) throw new HttpError(503, "pix_offer_not_configured", `Pix ainda não disponível para este plano no período ${b.interval === "year" ? "anual" : "mensal"}.`);
      const token = signCallback(e.CAKTO_WEBHOOK_SECRET!, user.id, b.plan, b.interval, randomBytes(9).toString("base64url"));
      return json({ url: `https://pay.cakto.com.br/${encodeURIComponent(offer)}?callback=${token}`, via: "pix" });
    }

    const s = stripe();
    const customer = await ensureCustomer(s, user);
    if (subs?.length) {
      // já possui assinatura automática: mudança de plano pelo portal (mostra diferença e momento da cobrança)
      const portal = await s.billingPortal.sessions.create({ customer, return_url: `${app}/app/assinatura` });
      return json({ url: portal.url, via: "portal", message: "Você já tem uma assinatura. A mudança de plano é feita no portal, com a diferença e a data de cobrança exibidas antes de confirmar." });
    }
    const price = priceFor(e, b.plan, b.interval);
    if (!price) throw new HttpError(503, "price_not_configured", "Preço ainda não configurado para este plano.");
    const session = await s.checkout.sessions.create({
      mode: "subscription", customer, client_reference_id: user.id, line_items: [{ price, quantity: 1 }],
      success_url: `${app}/app/assinatura?retorno=1`, cancel_url: `${app}/app/assinatura?cancelado=1`,
      subscription_data: { metadata: { rumo_user_id: user.id } }, allow_promotion_codes: false, locale: "pt-BR",
    }, { idempotencyKey: `checkout:${user.id}:${b.plan}:${b.interval}:${Math.floor(Date.now() / 60000)}` });
    return json({ url: session.url, via: "checkout" });
  } catch (e) {
    return errorResponse(e);
  }
}
