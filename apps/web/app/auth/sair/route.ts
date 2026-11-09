import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Encerrar sessão (POST + verificação de Origin contra CSRF). */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return new NextResponse("forbidden", { status: 403 });
  const sb = await supabaseServer();
  await sb.auth.signOut({ scope: "local" });
  const res = NextResponse.redirect(new URL("/entrar", req.nextUrl.origin), 303);
  res.cookies.delete("rumo_ws");
  return res;
}
