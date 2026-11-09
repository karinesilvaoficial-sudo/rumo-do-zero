import type { NextRequest } from "next/server";
import { z } from "zod";
import { integrationStatus } from "@/lib/env";
import { assertSameOrigin, errorResponse, HttpError, json, rateLimit, requireMember } from "@/lib/guard";
import { buildPdf, buildSheet, countRows, INLINE_MAX_ROWS, MIME, REPORT_TTL_DAYS } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const In = z.object({ workspaceId: z.uuid(), kind: z.enum(["summary_pdf", "full_pdf", "csv", "xlsx"]), from: z.iso.date(), to: z.iso.date(), label: z.string().max(60).optional(), requestId: z.uuid() });

/**
 * Solicitação de relatório. Pequeno: gera na hora. Grande: fica na fila (cron) com status visível.
 * Arquivo privado em {ws}/reports/{job}.{ext}, baixado por URL assinada temporária após autorização.
 * CSV dos próprios registros: disponível em todos os planos (inclusive após downgrade).
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const b = In.parse(await req.json());
    if (b.from > b.to) throw new HttpError(422, "bad_period");
    const { user, ws, sb } = await requireMember(b.workspaceId, "reader");
    await rateLimit(`report:${user.id}`, 10, 300);
    if (!integrationStatus().analytics) throw new HttpError(503, "not_configured:analytics", "Serviço de relatórios ainda não configurado.");
    const { data: plan } = await sb.rpc("workspace_plan", { ws: ws.id });
    if (b.kind === "full_pdf" && plan === "free") throw new HttpError(402, "plan_required", "O PDF completo está disponível a partir do plano Pro. O resumo em PDF e o CSV continuam disponíveis.");
    if (b.kind === "xlsx" && plan === "free") throw new HttpError(402, "plan_required", "A planilha XLSX está disponível a partir do plano Pro. O CSV continua disponível.");
    const { data: jobId, error } = await sb.rpc("request_report", { ws: ws.id, p_kind: b.kind, p_params: { from: b.from, to: b.to, label: b.label ?? null }, p_idempotency_key: b.requestId });
    if (error) throw error;
    const rows = await countRows(sb, ws.id, b);
    if (rows > INLINE_MAX_ROWS) return json({ jobId, status: "queued", message: "Relatório grande: ele ficará pronto em alguns minutos aqui no histórico." });

    // geração imediata com a sessão do usuário (RLS) e gravação privada via serviço
    const admin = supabaseAdmin();
    const ext = b.kind.endsWith("pdf") ? "pdf" : (b.kind as "csv" | "xlsx");
    const ctx = { userId: user.id, ws: { id: ws.id, name: ws.name, timezone: ws.timezone } };
    const bytes = ext === "pdf" ? await buildPdf(sb, ctx, b, b.kind === "full_pdf") : await buildSheet(sb, ctx, b, ext);
    const path = `${ws.id}/reports/${jobId}.${ext}`;
    const up = await admin.storage.from("private-files").upload(path, bytes, { contentType: MIME[ext], upsert: true });
    if (up.error) throw new HttpError(502, "storage_failed", "Falha ao salvar o arquivo. Nada foi marcado como concluído.");
    await admin.from("report_jobs").update({ status: "done", storage_path: path, byte_size: bytes.byteLength, finished_at: new Date().toISOString(), expires_at: new Date(Date.now() + REPORT_TTL_DAYS * 864e5).toISOString() }).eq("id", jobId as string).eq("workspace_id", ws.id);
    const signed = await sb.storage.from("private-files").createSignedUrl(path, 300, { download: true });
    return json({ jobId, status: "done", url: signed.data?.signedUrl ?? null, expiresInDays: REPORT_TTL_DAYS });
  } catch (e) {
    return errorResponse(e);
  }
}
