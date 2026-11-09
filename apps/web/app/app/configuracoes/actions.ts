"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, fail } from "@/lib/errors";
import { integrationStatus } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx } from "@/lib/workspace";

const KINDS = ["due_reminder", "invitation", "report_ready", "billing", "goal"] as const;

export async function saveNotificationPrefs(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  try {
    const ctx = await getCtx();
    if (!ctx) throw new Error("not_authenticated");
    const sb = await supabaseServer();
    const hour = Math.min(23, Math.max(0, Number.parseInt(String(fd.get("send_hour") ?? "8"), 10) || 8));
    const rows = KINDS.map((k) => ({ user_id: ctx.user.id, kind: k, in_app: fd.get(`${k}_app`) === "on", email: fd.get(`${k}_email`) === "on", include_amounts: fd.get("include_amounts") === "on", send_hour: hour }));
    const { error } = await sb.from("notification_preferences").upsert(rows, { onConflict: "user_id,kind" });
    if (error) throw error;
    revalidatePath("/app/configuracoes");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

/**
 * Solicitação de exclusão de conta: registrada e confirmada por e-mail; a execução é feita pelo operador
 * (dados compartilhados e registros de cobrança com retenção legal são tratados conforme a política).
 */
export async function requestAccountDeletion(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  try {
    const ctx = await getCtx();
    if (!ctx) throw new Error("not_authenticated");
    if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "EXCLUIR") return { ok: false, code: "invalid_input", error: "Digite EXCLUIR para confirmar." };
    if (!integrationStatus().admin_db) throw new Error("not_configured:admin_db");
    const db = supabaseAdmin();
    await db.from("audit_log").insert({ action: "deletion_requested", entity: "account", entity_id: ctx.user.id, actor_id: ctx.user.id, detail: {} });
    if (ctx.user.email) await db.from("outbox").upsert({ kind: "email", dedupe_key: `email:deletion:${ctx.user.id}`, payload: { to: ctx.user.email, template: "account", title: "Recebemos sua solicitação de exclusão", body: "Sua solicitação foi registrada. Antes da exclusão, exporte seus registros em CSV. Espaços em que outras pessoas participam serão tratados conforme a política de privacidade." } }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function markNotificationsRead(): Promise<ActionResult<null>> {
  try {
    const ctx = await getCtx();
    if (!ctx) throw new Error("not_authenticated");
    const sb = await supabaseServer();
    await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user.id).is("read_at", null);
    revalidatePath("/app/notificacoes");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function setCostCap(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  try {
    const raw = String(fd.get("cap") ?? "").replace(",", ".").trim();
    const cap = raw === "" ? null : Number(raw);
    if (cap !== null && (!Number.isFinite(cap) || cap < 0)) return { ok: false, code: "invalid_input", error: "Valor inválido." };
    const sb = await supabaseServer();
    const { error } = await sb.rpc("admin_set_cost_cap", { p_monthly_usd_cap: cap });
    if (error) throw error;
    revalidatePath("/app/admin");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}
