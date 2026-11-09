"use server";
import { DocumentKind, parseBRLInput } from "@rumo/contracts";
import { IncomePath } from "@rumo/contracts";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionResult, fail } from "@/lib/errors";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx } from "@/lib/workspace";

async function wsId() {
  const ctx = await getCtx();
  if (!ctx?.active) throw new Error("not_authenticated");
  return ctx.active.id;
}
async function rpc<T>(fn: string, args: Record<string, unknown>) {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
const optCents = (s: FormDataEntryValue | null) => {
  if (typeof s !== "string" || !s.trim()) return null;
  const v = parseBRLInput(s);
  return v === null || v < 0n ? undefined : v.toString();
};
const list = (s: FormDataEntryValue | null) => (typeof s === "string" ? s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 20).map((x) => x.slice(0, 60)) : []);

export async function saveIncomeProfile(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  const capital = optCents(fd.get("capital")), goal = optCents(fd.get("goal_monthly")), ticket = optCents(fd.get("ticket"));
  if (capital === undefined || goal === undefined || ticket === undefined) return { ok: false, code: "invalid_input", error: "Valor inválido." };
  const hours = String(fd.get("weekly_hours") ?? "");
  const p = {
    skills: list(fd.get("skills")), interests: list(fd.get("interests")),
    experience: String(fd.get("experience") ?? "").slice(0, 2000) || null, region: String(fd.get("region") ?? "").slice(0, 120) || null,
    weekly_hours: hours ? Math.min(80, Math.max(0, Number.parseInt(hours, 10) || 0)) : null,
    resources: String(fd.get("resources") ?? "").slice(0, 2000) || null, restrictions: String(fd.get("restrictions") ?? "").slice(0, 2000) || null,
    capital_cents: capital, goal_monthly_cents: goal,
    business: { offer: String(fd.get("offer") ?? "").slice(0, 500) || null, idle_capacity: String(fd.get("idle_capacity") ?? "").slice(0, 500) || null,
      channels: String(fd.get("channels") ?? "").slice(0, 500) || null, ticket_cents: ticket,
      variable_costs_note: String(fd.get("costs") ?? "").slice(0, 500) || null },
  };
  try {
    await rpc("upsert_income_profile", { ws: await wsId(), p });
    revalidatePath("/app/rendas");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function saveIncomePath(path: unknown): Promise<ActionResult<string>> {
  const p = IncomePath.safeParse(path);
  if (!p.success) return { ok: false, code: "invalid_input", error: "Caminho inválido." };
  try {
    const id = await rpc<string>("save_income_path", { ws: await wsId(), p: { ...p.data, origin: "ai" } });
    revalidatePath("/app/rendas");
    revalidatePath("/app");
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

export async function setPathStatus(id: string, status: string): Promise<ActionResult<null>> {
  const p = z.object({ id: z.uuid(), status: z.enum(["active", "paused", "abandoned", "continued"]) }).safeParse({ id, status });
  if (!p.success) return { ok: false, code: "invalid_input", error: "Status inválido." };
  try { await rpc("set_path_status", { ws: await wsId(), p_path_id: id, p_status: status }); revalidatePath("/app/rendas"); return { ok: true, data: null }; } catch (e) { return fail(e); }
}

export async function setTaskStatus(id: string, status: "todo" | "doing" | "done"): Promise<ActionResult<null>> {
  if (!z.uuid().safeParse(id).success) return { ok: false, code: "invalid_input", error: "Tarefa inválida." };
  try { await rpc("set_task_status", { ws: await wsId(), p_task_id: id, p_status: status }); revalidatePath("/app/rendas"); revalidatePath("/app"); return { ok: true, data: null }; } catch (e) { return fail(e); }
}

export async function saveContact(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), email: z.string().max(200).optional(), phone: z.string().max(40).optional(),
    stage: z.enum(["lead", "contacted", "proposal", "won", "lost"]).optional(), notes: z.string().max(2000).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, code: "invalid_input", error: "Verifique os campos do contato." };
  try {
    const id = await rpc<string>("save_contact", { ws: await wsId(), p_id: p.data.id || null, p_name: p.data.name, p_email: p.data.email || null, p_phone: p.data.phone || null, p_stage: p.data.stage ?? "lead", p_notes: p.data.notes || null });
    revalidatePath("/app/rendas");
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

export async function saveProposal(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const amount = optCents(fd.get("amount"));
  if (amount === undefined) return { ok: false, code: "invalid_input", error: "Valor inválido." };
  const title = String(fd.get("title") ?? "").trim();
  if (!title) return { ok: false, code: "invalid_input", error: "Dê um título à proposta." };
  const opt = (k: string) => { const v = String(fd.get(k) ?? ""); return /^[0-9a-f-]{36}$/i.test(v) ? v : null; };
  try {
    const id = await rpc<string>("save_proposal", { ws: await wsId(), p_title: title.slice(0, 160), p_contact_id: opt("contact_id"), p_path_id: opt("path_id"), p_amount_cents: amount, p_document_id: opt("document_id") });
    revalidatePath("/app/rendas");
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

/** Venda → financeiro: vínculo explícito e idempotente (cria a receita OU vincula uma existente). */
export async function linkProposalRevenue(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ proposal_id: z.uuid(), mode: z.enum(["new", "existing"]), transaction_id: z.string().optional(), amount: z.string().optional(), date: z.iso.date().optional(), account_id: z.string().optional(), category_id: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, code: "invalid_input", error: "Dados incompletos." };
  const d = p.data;
  const amount = d.mode === "new" ? optCents(d.amount ?? null) : null;
  if (d.mode === "new" && (!amount || !d.date || !d.account_id)) return { ok: false, code: "invalid_input", error: "Informe valor, data e conta do recebimento." };
  try {
    const id = await rpc<string>("link_proposal_revenue", { ws: await wsId(), p_proposal_id: d.proposal_id, p_existing_transaction_id: d.mode === "existing" ? d.transaction_id : null,
      p_amount_cents: amount, p_date: d.date ?? null, p_account_id: d.account_id || null, p_category_id: d.category_id || null });
    for (const x of ["/app/rendas", "/app", "/app/lancamentos"]) revalidatePath(x);
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}

export async function saveDocument(kind: string, title: string, body: string, pathId: string | null): Promise<ActionResult<string>> {
  const k = DocumentKind.safeParse(kind);
  if (!k.success || !title.trim() || body.length > 60000) return { ok: false, code: "invalid_input", error: "Documento inválido." };
  try {
    const id = await rpc<string>("save_document", { ws: await wsId(), p_kind: k.data, p_title: title.slice(0, 160), p_body: body, p_path_id: pathId });
    revalidatePath("/app/rendas");
    return { ok: true, data: id };
  } catch (e) { return fail(e); }
}
