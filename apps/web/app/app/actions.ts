"use server";
import { parseBRLInput } from "@rumo/contracts";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { type ActionResult, fail } from "@/lib/errors";
import { percentToFraction } from "@/lib/rate";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx, WS_COOKIE } from "@/lib/workspace";

/**
 * Comandos do produto (camada Node). Server Actions já verificam Origin (CSRF).
 * Toda gravação vai para funções SQL que revalidam usuário, espaço, papel, plano, valores e versão.
 * O workspace_id enviado pelo navegador nunca é confiado: usamos o espaço ativo verificado (getCtx).
 */

const money = z.string().transform((s, c) => {
  const v = parseBRLInput(s);
  if (v === null || v <= 0n) { c.addIssue({ code: "custom", message: "Valor inválido" }); return z.NEVER; }
  return v.toString();
});
const optMoney = z.string().optional().transform((s, c) => {
  if (!s || !s.trim()) return null;
  const v = parseBRLInput(s);
  if (v === null) { c.addIssue({ code: "custom", message: "Valor inválido" }); return z.NEVER; }
  return v.toString();
});
const date = z.iso.date();
const optUuid = z.string().optional().transform((s) => (s && /^[0-9a-f-]{36}$/i.test(s) ? s : null));
const idem = z.string().min(8).max(80);
const text = (max: number) => z.string().trim().min(1).max(max);

function form(fd: FormData) {
  return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

async function ws() {
  const ctx = await getCtx();
  if (!ctx) throw new Error("not_authenticated");
  if (!ctx.active) throw new Error("forbidden");
  return { ctx, wsId: ctx.active.id, sb: await supabaseServer() };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

function invalid(e: z.ZodError): ActionResult<never> {
  const first = e.issues[0];
  return { ok: false, code: "invalid_input", error: first ? `${first.path.join(".") || "campo"}: ${first.message}` : "Dados inválidos." };
}

function done<T>(data: T, ...paths: string[]): ActionResult<T> {
  for (const p of paths) revalidatePath(p);
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Espaços e onboarding
// ---------------------------------------------------------------------------
export async function switchWorkspace(id: string): Promise<ActionResult<null>> {
  const ctx = await getCtx();
  if (!ctx?.workspaces.some((w) => w.id === id)) return { ok: false, code: "forbidden", error: "Espaço indisponível." };
  (await cookies()).set(WS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return done(null, "/app", "/app/[...]");
}

const Onboarding = z.object({
  kind: z.enum(["personal", "business", "both"]),
  goal: z.string().max(200).optional(),
  account_name: z.string().trim().max(60).optional(),
  opening: optMoney,
  opening_date: date.optional(),
  business_name: z.string().trim().max(80).optional(),
});
export async function completeOnboarding(_: unknown, fd: FormData): Promise<ActionResult<{ workspaceId: string }>> {
  const p = Onboarding.safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const ctx = await getCtx();
    if (!ctx) throw new Error("not_authenticated");
    const kinds = p.data.kind === "both" ? (["personal", "business"] as const) : [p.data.kind];
    let first: string | null = null;
    for (const k of kinds) {
      const existing = ctx.workspaces.find((w) => w.kind === k && w.owner_id === ctx.user.id);
      const id = existing?.id ?? (await rpc<string>("create_workspace", { p_kind: k, p_name: k === "business" ? p.data.business_name || "Meu negócio" : "Pessoal" }));
      first ??= id;
      if (!existing && p.data.account_name && p.data.opening_date) {
        await rpc("create_account", { ws: id, p_name: p.data.account_name, p_kind: "checking", p_opening_cents: p.data.opening ?? "0", p_opening_date: p.data.opening_date });
      }
    }
    const sb = await supabaseServer();
    await sb.from("profiles").update({ onboarding_state: { done: true, goal: p.data.goal ?? null, kind: p.data.kind }, updated_at: new Date().toISOString() }).eq("id", ctx.user.id);
    (await cookies()).set(WS_COOKIE, first!, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    return done({ workspaceId: first! }, "/app");
  } catch (e) { return fail(e); }
}

export async function savePreferences(_: unknown, fd: FormData): Promise<ActionResult<null>> {
  const P = z.object({ full_name: z.string().trim().max(120).optional(), timezone: z.string().regex(/^[A-Za-z_]+(\/[A-Za-z_]+){0,2}$/).optional(), reduce_motion: z.string().optional(), hide_values: z.string().optional() });
  const p = P.safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const ctx = await getCtx();
    if (!ctx) throw new Error("not_authenticated");
    const sb = await supabaseServer();
    const { error } = await sb.from("profiles").update({
      full_name: p.data.full_name ?? null, timezone: p.data.timezone ?? "America/Sao_Paulo",
      reduce_motion: p.data.reduce_motion === "on", hide_values: p.data.hide_values === "on", updated_at: new Date().toISOString(),
    }).eq("id", ctx.user.id);
    if (error) throw error;
    return done(null, "/app/configuracoes", "/app");
  } catch (e) { return fail(e); }
}

/** Privacidade dos valores: muda apenas a apresentação (não altera dados nem exportações). */
export async function toggleHideValues(hide: boolean): Promise<ActionResult<null>> {
  try {
    const ctx = await getCtx();
    if (!ctx) throw new Error("not_authenticated");
    const sb = await supabaseServer();
    await sb.from("profiles").update({ hide_values: hide }).eq("id", ctx.user.id);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// Contas e lançamentos
// ---------------------------------------------------------------------------
export async function createAccount(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ name: text(60), kind: z.enum(["checking", "savings", "cash", "investment", "other"]), opening: optMoney, opening_date: date }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    const id = await rpc<string>("create_account", { ws: wsId, p_name: p.data.name, p_kind: p.data.kind, p_opening_cents: p.data.opening ?? "0", p_opening_date: p.data.opening_date });
    return done(id, "/app", "/app/lancamentos");
  } catch (e) { return fail(e); }
}

const TxIn = z.object({
  kind: z.enum(["income", "expense", "transfer"]),
  amount: money,
  description: z.string().trim().max(200).optional(),
  category_id: optUuid,
  account_id: z.uuid(),
  to_account_id: optUuid,
  date: date,
  competence_date: date.optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().max(2000).optional(),
  idempotency_key: idem,
});
export async function createTransaction(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = TxIn.safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  const d = p.data;
  try {
    const { wsId } = await ws();
    let id: string;
    if (d.kind === "transfer") {
      if (!d.to_account_id) return { ok: false, code: "invalid_input", error: "Escolha a conta de destino." };
      id = await rpc<string>("record_transfer", { ws: wsId, p_from: d.account_id, p_to: d.to_account_id, p_amount_cents: d.amount, p_date: d.date, p_description: d.description ?? "", p_idempotency_key: d.idempotency_key });
    } else {
      if (!d.description) return { ok: false, code: "invalid_input", error: "Descreva o lançamento." };
      id = await rpc<string>("record_transaction", { ws: wsId, p_kind: d.kind, p_amount_cents: d.amount, p_description: d.description, p_category_id: d.category_id,
        p_account_id: d.account_id, p_competence_date: d.competence_date ?? d.date, p_settled_date: d.date, p_notes: d.notes ?? null, p_idempotency_key: d.idempotency_key });
    }
    return done(id, "/app", "/app/lancamentos", "/app/relatorios");
  } catch (e) { return fail(e); }
}

export async function editTransaction(_: unknown, fd: FormData): Promise<ActionResult<number>> {
  const p = z.object({ id: z.uuid(), version: z.coerce.number().int().positive(), description: z.string().trim().max(200).optional(), category_id: optUuid,
    amount: optMoney, date: date.optional(), competence_date: date.optional(), notes: z.string().max(2000).optional() }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    const v = await rpc<number>("edit_transaction", { ws: wsId, p_transaction_id: p.data.id, p_expected_version: p.data.version, p_description: p.data.description ?? null,
      p_category_id: p.data.category_id, p_competence_date: p.data.competence_date ?? null, p_notes: p.data.notes ?? null, p_amount_cents: p.data.amount,
      p_account_id: null, p_settled_date: p.data.date ?? null });
    return done(v, "/app", "/app/lancamentos");
  } catch (e) { return fail(e); }
}

export async function reverseTransaction(id: string, version: number, reason: string): Promise<ActionResult<string>> {
  const p = z.object({ id: z.uuid(), version: z.number().int().positive(), reason: z.string().max(200) }).safeParse({ id, version, reason });
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    const r = await rpc<string>("reverse_transaction", { ws: wsId, p_transaction_id: id, p_expected_version: version, p_reason: reason });
    return done(r, "/app", "/app/lancamentos", "/app/dividas");
  } catch (e) { return fail(e); }
}

export async function createCategory(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ name: text(40), kind: z.enum(["income", "expense"]) }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("create_category", { ws: wsId, p_name: p.data.name, p_kind: p.data.kind }), "/app/lancamentos", "/app/planejamento");
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// Compromissos, recorrências, orçamentos
// ---------------------------------------------------------------------------
export async function createCommitment(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ direction: z.enum(["payable", "receivable"]), description: text(200), category_id: optUuid, amount: money, due_date: date,
    recurring: z.enum(["none", "weekly", "monthly", "yearly"]).default("none"), end_date: date.optional().or(z.literal("").transform(() => undefined)), idempotency_key: idem }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  const d = p.data;
  try {
    const { wsId } = await ws();
    const id = d.recurring === "none"
      ? await rpc<string>("create_commitment", { ws: wsId, p_direction: d.direction, p_description: d.description, p_category_id: d.category_id, p_amount_cents: d.amount, p_due_date: d.due_date, p_competence_date: d.due_date, p_idempotency_key: d.idempotency_key })
      : await rpc<string>("create_recurring_rule", { ws: wsId, p_direction: d.direction, p_description: d.description, p_category_id: d.category_id, p_amount_cents: d.amount, p_frequency: d.recurring, p_start_date: d.due_date, p_end_date: d.end_date ?? null });
    return done(id, "/app", "/app/planejamento");
  } catch (e) { return fail(e); }
}

export async function settleCommitment(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ commitment_id: z.uuid(), amount: money, date: date, account_id: z.uuid(), idempotency_key: idem }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    const id = await rpc<string>("settle_commitment", { ws: wsId, p_commitment_id: p.data.commitment_id, p_amount_cents: p.data.amount, p_settled_date: p.data.date, p_account_id: p.data.account_id, p_idempotency_key: p.data.idempotency_key });
    return done(id, "/app", "/app/planejamento", "/app/lancamentos");
  } catch (e) { return fail(e); }
}

export async function cancelCommitment(id: string, version: number): Promise<ActionResult<null>> {
  try {
    const { wsId } = await ws();
    await rpc("cancel_commitment", { ws: wsId, p_commitment_id: z.uuid().parse(id), p_expected_version: version });
    return done(null, "/app", "/app/planejamento");
  } catch (e) { return fail(e); }
}

export async function editRuleFrom(_: unknown, fd: FormData): Promise<ActionResult<number>> {
  const p = z.object({ rule_id: z.uuid(), version: z.coerce.number().int(), from: date, amount: optMoney, description: z.string().max(200).optional() }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<number>("edit_rule_from", { ws: wsId, p_rule_id: p.data.rule_id, p_expected_version: p.data.version, p_from: p.data.from, p_amount_cents: p.data.amount, p_description: p.data.description ?? null }), "/app/planejamento");
  } catch (e) { return fail(e); }
}

export async function upsertBudget(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ category_id: z.uuid(), month: date, amount: money }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("upsert_budget", { ws: wsId, p_category_id: p.data.category_id, p_month: p.data.month, p_amount_cents: p.data.amount }), "/app/planejamento");
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------
export async function createGoal(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ name: text(80), target: money, target_date: date.optional().or(z.literal("").transform(() => undefined)) }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("create_goal", { ws: wsId, p_name: p.data.name, p_target_cents: p.data.target, p_target_date: p.data.target_date ?? null }), "/app", "/app/metas");
  } catch (e) { return fail(e); }
}

export async function contributeGoal(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ goal_id: z.uuid(), amount: money, date: date, direction: z.enum(["in", "out"]).default("in"), note: z.string().max(200).optional(), idempotency_key: idem }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    const amount = p.data.direction === "out" ? "-" + p.data.amount : p.data.amount;
    return done(await rpc<string>("contribute_goal", { ws: wsId, p_goal_id: p.data.goal_id, p_amount_cents: amount, p_date: p.data.date, p_note: p.data.note ?? null, p_idempotency_key: p.data.idempotency_key }), "/app", "/app/metas");
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// Cartões e dívidas
// ---------------------------------------------------------------------------
export async function createCard(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ name: text(60), closing_day: z.coerce.number().int().min(1).max(28), due_day: z.coerce.number().int().min(1).max(28), limit: optMoney, payment_account_id: optUuid }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("create_card", { ws: wsId, p_name: p.data.name, p_closing_day: p.data.closing_day, p_due_day: p.data.due_day, p_limit_cents: p.data.limit, p_payment_account_id: p.data.payment_account_id }), "/app/dividas");
  } catch (e) { return fail(e); }
}

export async function cardPurchase(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ card_id: z.uuid(), description: text(200), category_id: optUuid, date: date, total: money, installments: z.coerce.number().int().min(1).max(48), idempotency_key: idem }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("record_card_purchase", { ws: wsId, p_card_id: p.data.card_id, p_description: p.data.description, p_category_id: p.data.category_id, p_purchase_date: p.data.date, p_total_cents: p.data.total, p_installments: p.data.installments, p_idempotency_key: p.data.idempotency_key }), "/app", "/app/dividas", "/app/lancamentos");
  } catch (e) { return fail(e); }
}

export async function payInvoice(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ invoice_id: z.uuid(), amount: money, date: date, account_id: z.uuid(), idempotency_key: idem }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("pay_invoice", { ws: wsId, p_invoice_id: p.data.invoice_id, p_amount_cents: p.data.amount, p_date: p.data.date, p_account_id: p.data.account_id, p_idempotency_key: p.data.idempotency_key }), "/app", "/app/dividas", "/app/lancamentos");
  } catch (e) { return fail(e); }
}

export async function invoiceCharge(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ invoice_id: z.uuid(), amount: money, description: z.string().max(200).optional(), idempotency_key: idem }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("record_invoice_charge", { ws: wsId, p_invoice_id: p.data.invoice_id, p_amount_cents: p.data.amount, p_description: p.data.description ?? "", p_idempotency_key: p.data.idempotency_key }), "/app/dividas");
  } catch (e) { return fail(e); }
}

const rate = z.string().optional().transform((s, c) => {
  const r = percentToFraction(s);
  if (r === undefined) { c.addIssue({ code: "custom", message: "Taxa inválida (use % ao mês, ex.: 2,99)" }); return z.NEVER; }
  return r;
});

export async function createDebt(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ name: text(80), creditor: z.string().max(80).optional(), outstanding: money, monthly_rate: rate, installment: optMoney,
    remaining: z.string().optional().transform((s) => (s ? Number.parseInt(s, 10) : null)), due_day: z.string().optional().transform((s) => (s ? Number.parseInt(s, 10) : null)) }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("create_debt", { ws: wsId, p_name: p.data.name, p_creditor: p.data.creditor ?? null, p_outstanding_cents: p.data.outstanding, p_monthly_rate: p.data.monthly_rate,
      p_installment_cents: p.data.installment, p_remaining_installments: p.data.remaining, p_due_day: p.data.due_day }), "/app/dividas");
  } catch (e) { return fail(e); }
}

export async function payDebt(_: unknown, fd: FormData): Promise<ActionResult<string>> {
  const p = z.object({ debt_id: z.uuid(), principal: money, interest: optMoney, date: date, account_id: z.uuid(), idempotency_key: idem }).safeParse(form(fd));
  if (!p.success) return invalid(p.error);
  try {
    const { wsId } = await ws();
    return done(await rpc<string>("pay_debt", { ws: wsId, p_debt_id: p.data.debt_id, p_principal_cents: p.data.principal, p_interest_cents: p.data.interest ?? "0", p_date: p.data.date, p_account_id: p.data.account_id, p_idempotency_key: p.data.idempotency_key }), "/app", "/app/dividas");
  } catch (e) { return fail(e); }
}

export async function setPeriod(key: string, from?: string, to?: string): Promise<ActionResult<null>> {
  const k = z.enum(["mes", "mes-anterior", "3m", "12m", "ano", "custom"]).safeParse(key);
  if (!k.success) return { ok: false, code: "invalid_input", error: "Período inválido." };
  const ok = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
  (await cookies()).set("rumo_period", [k.data, ok(from), ok(to)].join("|"), { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  return { ok: true, data: null };
}
