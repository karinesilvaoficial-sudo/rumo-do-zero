import type { NextRequest } from "next/server";
import { errorResponse, HttpError, json } from "@/lib/guard";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

/** Download: URL assinada de 5 minutos, emitida após a política de storage autorizar o usuário. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "bad_id");
    if (!(await currentUser())) throw new HttpError(401, "not_authenticated");
    const sb = await supabaseServer();
    const { data: job } = await sb.from("report_jobs").select("status,storage_path,expires_at").eq("id", id).maybeSingle();
    if (!job) throw new HttpError(404, "not_found");
    if (job.status !== "done" || !job.storage_path) return json({ status: job.status });
    if (job.expires_at && new Date(job.expires_at) < new Date()) throw new HttpError(410, "expired", "O arquivo expirou. Gere novamente.");
    const s = await sb.storage.from("private-files").createSignedUrl(job.storage_path, 300, { download: true });
    if (!s.data?.signedUrl) throw new HttpError(403, "forbidden");
    return json({ status: "done", url: s.data.signedUrl });
  } catch (e) { return errorResponse(e); }
}
