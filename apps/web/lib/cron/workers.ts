import "server-only";
import { integrationStatus } from "@/lib/env";
import { renderEmail, sendEmail } from "@/lib/email";
import { buildPdf, buildSheet, MIME, REPORT_TTL_DAYS } from "@/lib/reports";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Outbox = { id: string; kind: string; dedupe_key: string; payload: Record<string, string>; attempts: number };
const priv = () => supabaseAdmin().schema("private" as "public");

/** Envia e-mails da fila. "Enviado" só após confirmação do provedor; falha volta para nova tentativa. */
export async function processOutbox(batch = 20) {
  const res = { sent: 0, failed: 0, skipped: 0 };
  if (!integrationStatus().email) return { ...res, note: "email_not_configured" };
  const { data, error } = await priv().rpc("claim_outbox", { p_kind: "email", p_batch: batch, p_lease_seconds: 120 });
  if (error) throw new Error(error.message);
  for (const m of (data ?? []) as Outbox[]) {
    try {
      const p = m.payload;
      if (p.template === "due_reminder" && p.commitment_id) {
        const { data: due } = await priv().rpc("cron_commitment_still_due", { p_commitment: p.commitment_id });
        if (!due) { await supabaseAdmin().from("outbox").update({ status: "cancelled", done_at: new Date().toISOString() }).eq("id", m.id); res.skipped++; continue; }
      }
      const cta = p.template === "invitation" ? { href: `/convite/${p.token}`, label: "Aceitar convite" } : p.template === "due_reminder" ? { href: "/app/planejamento", label: "Ver compromissos" } : { href: "/app/assinatura", label: "Abrir o RUMO" };
      const id = await sendEmail(p.to!, p.title!, renderEmail(p.title!, p.body!, cta), m.dedupe_key);
      await priv().rpc("finish_outbox", { p_id: m.id, p_ok: true, p_error: null, p_provider_ref: id });
      // segredo do convite não fica guardado após o envio
      if (p.token) await supabaseAdmin().from("outbox").update({ payload: { ...p, token: null } }).eq("id", m.id);
      res.sent++;
    } catch (e) {
      await priv().rpc("finish_outbox", { p_id: m.id, p_ok: false, p_error: (e as Error).message, p_provider_ref: null });
      res.failed++;
    }
  }
  return res;
}

/** Relatórios grandes da fila: lease + SKIP LOCKED; quem pediu ainda precisa ser membro. */
export async function processReports(max = 2) {
  const out = { done: 0, failed: 0 };
  if (!integrationStatus().analytics) return { ...out, note: "analytics_not_configured" };
  const admin = supabaseAdmin();
  for (let i = 0; i < max; i++) {
    const { data } = await priv().rpc("claim_report_job", { p_lease_seconds: 240 });
    const job = (data ?? [])[0] as { id: string; workspace_id: string; requested_by: string; kind: string; params: { from: string; to: string; label?: string } } | undefined;
    if (!job) break;
    try {
      const { data: mem } = await admin.from("memberships").select("role").eq("workspace_id", job.workspace_id).eq("user_id", job.requested_by).maybeSingle();
      if (!mem) throw new Error("requester_no_longer_member");
      const { data: ws } = await admin.from("workspaces").select("id,name,timezone").eq("id", job.workspace_id).single();
      const ctx = { userId: job.requested_by, ws: ws! };
      const ext = job.kind.endsWith("pdf") ? "pdf" : (job.kind as "csv" | "xlsx");
      const bytes = ext === "pdf" ? await buildPdf(admin, ctx, job.params, job.kind === "full_pdf") : await buildSheet(admin, ctx, job.params, ext);
      const path = `${job.workspace_id}/reports/${job.id}.${ext}`;
      const up = await admin.storage.from("private-files").upload(path, bytes, { contentType: MIME[ext], upsert: true });
      if (up.error) throw new Error("storage_failed");
      await admin.from("report_jobs").update({ status: "done", storage_path: path, byte_size: bytes.byteLength, finished_at: new Date().toISOString(), lease_until: null, expires_at: new Date(Date.now() + REPORT_TTL_DAYS * 864e5).toISOString() }).eq("id", job.id);
      await admin.from("notifications").upsert({ user_id: job.requested_by, workspace_id: job.workspace_id, kind: "report_ready", title: "Relatório pronto", body: "Seu arquivo está disponível em Relatórios por 7 dias.", link: "/app/relatorios", dedupe_key: `report:${job.id}` }, { onConflict: "dedupe_key", ignoreDuplicates: true });
      out.done++;
    } catch (e) {
      // não retém relatório truncado: volta para a fila (até 3 tentativas) sem arquivo
      await admin.from("report_jobs").update({ status: "queued", error: (e as Error).message.slice(0, 200), lease_until: null }).eq("id", job.id);
      out.failed++;
    }
  }
  return out;
}

export async function removeExpiredReportFiles() {
  const admin = supabaseAdmin();
  const { data } = await admin.from("report_jobs").select("id,storage_path").eq("status", "expired").not("storage_path", "is", null).limit(200);
  const paths = (data ?? []).map((d) => d.storage_path as string);
  if (paths.length) {
    await admin.storage.from("private-files").remove(paths);
    await admin.from("report_jobs").update({ storage_path: null }).in("id", (data ?? []).map((d) => d.id));
  }
  return paths.length;
}
