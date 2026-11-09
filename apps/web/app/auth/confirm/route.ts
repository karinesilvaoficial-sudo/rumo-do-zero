import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-redirect";
import { supabaseServer } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "recovery", "invite", "email", "email_change", "magiclink"];

/** Confirmação de e-mail e recuperação de senha (token_hash). */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (tokenHash && type && TYPES.includes(type)) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, req.nextUrl.origin));
  }
  return NextResponse.redirect(new URL("/entrar?erro=link", req.nextUrl.origin));
}
