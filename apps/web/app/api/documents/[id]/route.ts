import type { NextRequest } from "next/server";
import { errorResponse, HttpError } from "@/lib/guard";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

/** Exportação de documento (Markdown) — leitura sob RLS do usuário. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "bad_id");
    if (!(await currentUser())) throw new HttpError(401, "not_authenticated");
    const sb = await supabaseServer();
    const { data } = await sb.from("documents").select("title,body_md").eq("id", id).maybeSingle();
    if (!data) throw new HttpError(404, "not_found");
    const name = data.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "documento";
    return new Response(`# ${data.title}\n\n${data.body_md}\n`, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.md`, "Cache-Control": "private, no-store" } });
  } catch (e) { return errorResponse(e); }
}
