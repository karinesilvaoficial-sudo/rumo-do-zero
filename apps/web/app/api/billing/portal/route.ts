import type { NextRequest } from "next/server";
import { stripe } from "@/lib/billing/stripe";
import { env } from "@/lib/env";
import { assertSameOrigin, errorResponse, HttpError, json } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Portal do cliente: meios de pagamento, faturas, troca de plano e cancelamento (fim do período). */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await currentUser();
    if (!user) throw new HttpError(401, "not_authenticated");
    const { data } = await supabaseAdmin().from("billing_accounts").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    if (!data?.stripe_customer_id) throw new HttpError(404, "no_customer", "Nenhuma cobrança registrada ainda.");
    const s = await stripe().billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${env().NEXT_PUBLIC_APP_URL}/app/assinatura` });
    return json({ url: s.url });
  } catch (e) { return errorResponse(e); }
}
