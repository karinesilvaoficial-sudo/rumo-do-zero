import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/** Leituras canônicas (funções SQL agregadas; mesmos números para tela, IA, relatórios e PDF). */
export type Summary = {
  workspace_id: string; from: string; to: string; income_cents: string; expense_cents: string; result_cents: string;
  cash_in_cents: string; cash_out_cents: string; balance_cents: string; pending_payable_cents: string; pending_receivable_cents: string;
  overdue_count: number; accounts_count: number; transactions_count: number;
};
export type Upcoming = { id: string; direction: "payable" | "receivable"; description: string; due_date: string; amount_cents: string; pending_cents: string; overdue: boolean; version: number; source: "commitment" | "card_invoice" };
export type Goal = { id: string; name: string; status: string; target_cents: string; saved_cents: string; target_date: string | null; version: number };
export type Account = { account_id: string; name: string; kind: string; opening_cents: string; balance_cents: string };
export type SeriesMonth = { month: string; complete: boolean; income_cents: string; expense_cents: string };
export type Breakdown = { category_id: string | null; name: string; amount_cents: string; count: number };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const summary = (ws: string, from: string, to: string) => call<Summary>("financial_summary", { ws, p_from: from, p_to: to });
export const upcoming = (ws: string, until: string) => call<Upcoming[]>("upcoming_commitments", { ws, p_until: until });
export const goals = (ws: string) => call<Goal[]>("goal_progress", { ws });
export const balances = (ws: string, asOf: string) => call<Account[]>("account_balances", { ws, p_as_of: asOf });
export const series = (ws: string, months: number, until: string) => call<SeriesMonth[]>("monthly_series", { ws, p_months: months, p_until: until });
export const breakdown = (ws: string, from: string, to: string, kind: "income" | "expense") => call<Breakdown[]>("category_breakdown", { ws, p_from: from, p_to: to, p_kind: kind });
export const entitlements = () => call<Record<string, unknown>>("my_entitlements", {});

export async function categories(ws: string) {
  const sb = await supabaseServer();
  const { data } = await sb.from("categories").select("id,name,kind").eq("workspace_id", ws).is("archived_at", null).order("name");
  return (data ?? []) as { id: string; name: string; kind: "income" | "expense" }[];
}
export async function accountsList(ws: string) {
  const sb = await supabaseServer();
  const { data } = await sb.from("accounts").select("id,name,kind").eq("workspace_id", ws).is("archived_at", null).order("created_at");
  return (data ?? []) as { id: string; name: string; kind: string }[];
}
export const dailyExpenses = (ws: string, from: string, to: string) => call<{ date: string; amount_cents: string }[]>("daily_expenses", { ws, p_from: from, p_to: to });
