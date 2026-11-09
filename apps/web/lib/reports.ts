import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analytics } from "@/lib/analytics";
import { fmtDate } from "@/lib/period";

/** Monta o conteúdo do relatório a partir das MESMAS funções canônicas usadas pelo painel. */
export type ReportParams = { from: string; to: string; label?: string };
export const INLINE_MAX_ROWS = 1500;
const KIND_OK = ["income", "expense", "transfer", "card_purchase", "card_charge", "card_payment", "debt_payment"];

async function rpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export async function countRows(sb: SupabaseClient, ws: string, p: ReportParams) {
  const { count } = await sb.from("transactions").select("id", { count: "exact", head: true }).eq("workspace_id", ws).is("reversed_at", null).is("reversal_of", null).gte("competence_date", p.from).lte("competence_date", p.to);
  return count ?? 0;
}

export async function txRows(sb: SupabaseClient, ws: string, p: ReportParams) {
  const rows: { date: string; kind: string; description: string; category: string | null; account: string | null; amount_cents: string; status: string }[] = [];
  const [{ data: cats }, { data: accs }] = await Promise.all([
    sb.from("categories").select("id,name").eq("workspace_id", ws),
    sb.from("accounts").select("id,name").eq("workspace_id", ws),
  ]);
  const cn = new Map((cats ?? []).map((c) => [c.id, c.name as string]));
  const an = new Map((accs ?? []).map((c) => [c.id, c.name as string]));
  for (let page = 0; page < 50; page++) {
    const { data, error } = await sb.from("transactions").select("kind,amount_cents,description,competence_date,category_id,account_id,reversed_at,reversal_of")
      .eq("workspace_id", ws).gte("competence_date", p.from).lte("competence_date", p.to).order("competence_date").order("created_at").range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      if (!KIND_OK.includes(r.kind)) continue;
      rows.push({ date: r.competence_date, kind: r.kind, description: r.description, category: r.category_id ? cn.get(r.category_id) ?? null : null,
        account: r.account_id ? an.get(r.account_id) ?? null : "Cartão", amount_cents: String(r.amount_cents), status: r.reversed_at ? "estornado" : r.reversal_of ? "estorno" : "realizado" });
    }
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

export async function buildPdf(sb: SupabaseClient, ctx: { userId: string; ws: { id: string; name: string; timezone: string } }, p: ReportParams, full: boolean) {
  const [summary, series, breakdown] = await Promise.all([
    rpc<Record<string, string>>(sb, "financial_summary", { ws: ctx.ws.id, p_from: p.from, p_to: p.to }),
    rpc<{ month: string; complete: boolean; income_cents: string; expense_cents: string }[]>(sb, "monthly_series", { ws: ctx.ws.id, p_months: 12, p_until: p.to }),
    rpc<{ name: string; amount_cents: string; count: number }[]>(sb, "category_breakdown", { ws: ctx.ws.id, p_from: p.from, p_to: p.to, p_kind: "expense" }),
  ]);
  const transactions = full ? (await txRows(sb, ctx.ws.id, p)).filter((r) => r.status === "realizado").slice(0, 5000) : [];
  return analytics<Uint8Array>("/v1/reports/pdf", { userId: ctx.userId, workspaceId: ctx.ws.id }, {
    workspace_name: ctx.ws.name, timezone: ctx.ws.timezone, period: { from: p.from, to: p.to },
    filters: { Período: p.label ?? `${fmtDate(p.from)} a ${fmtDate(p.to)}`, Conteúdo: full ? "Completo" : "Resumo" },
    summary, series: series.filter((s) => s.month >= p.from.slice(0, 7) + "-01" || series.length <= 12),
    breakdown: breakdown.map((b) => ({ name: b.name, amount_cents: b.amount_cents, count: b.count })), transactions,
  }, { binary: true, timeoutMs: 55_000 });
}

export async function buildSheet(sb: SupabaseClient, ctx: { userId: string; ws: { id: string; name: string } }, p: ReportParams, format: "csv" | "xlsx") {
  const rows = await txRows(sb, ctx.ws.id, p);
  return analytics<Uint8Array>("/v1/exports", { userId: ctx.userId, workspaceId: ctx.ws.id }, {
    format, workspace_name: ctx.ws.name, period_label: `${fmtDate(p.from)} a ${fmtDate(p.to)}`, generated_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), rows,
  }, { binary: true, timeoutMs: 55_000 });
}

export const MIME = { pdf: "application/pdf", csv: "text/csv; charset=utf-8", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;
export const REPORT_TTL_DAYS = 7;
