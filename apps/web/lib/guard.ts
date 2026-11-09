import "server-only";
import { NextResponse } from "next/server";
import { domainError } from "@/lib/errors";
import { env, integrationStatus, type Integration, NotConfiguredError } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import type { Role } from "@/lib/workspace";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code); }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
  if (e instanceof NotConfiguredError) return json({ error: e.message, message: "Recurso ainda não configurado neste ambiente." }, 503);
  const d = domainError(e);
  const status = d.code === "not_authenticated" ? 401 : d.code === "forbidden" ? 403 : d.code.startsWith("quota_exceeded") ? 402 : d.code === "unknown" ? 500 : 409;
  if (status === 500) console.error("[api]", e instanceof Error ? e.message.slice(0, 200) : "erro"); // sem payload/segredos
  return json({ error: d.code, message: d.message }, status);
}

/** Origin obrigatório e igual ao do app nas rotas autenticadas por cookie (CSRF). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const app = new URL(env().NEXT_PUBLIC_APP_URL).origin;
  const self = new URL(req.url).origin;
  if (!origin || (origin !== app && origin !== self)) throw new HttpError(403, "bad_origin", "Origem não autorizada.");
}

/** Usuário verificado + papel no espaço (lido sob RLS: só retorna se ele for membro AGORA). */
export async function requireMember(workspaceId: string, min: Role = "reader") {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "not_authenticated", "Sessão expirada.");
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new HttpError(400, "bad_workspace");
  const sb = await supabaseServer();
  const { data } = await sb.from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  const { data: ws } = await sb.from("workspaces").select("id,name,kind,timezone,owner_id").eq("id", workspaceId).maybeSingle();
  const rank = { reader: 1, collaborator: 2, admin: 3, owner: 4 } as const;
  if (!data || !ws || rank[data.role as Role] < rank[min]) throw new HttpError(403, "forbidden", "Sem permissão neste espaço.");
  return { user, role: data.role as Role, ws: ws as { id: string; name: string; kind: "personal" | "business"; timezone: string; owner_id: string }, sb };
}

/**
 * Limite persistente e atômico (Postgres), por usuário/espaço e rota. Em produção, sem banco
 * administrativo configurado, falha fechado.
 */
export async function rateLimit(bucket: string, max: number, windowSeconds: number) {
  if (!integrationStatus().admin_db) {
    if (env().APP_ENV === "production") throw new HttpError(503, "rate_limit_unavailable");
    return;
  }
  const { data, error } = await supabaseAdmin().rpc("svc_hit_rate_limit", { bucket, max_hits: max, window_seconds: windowSeconds });
  if (error) throw new HttpError(503, "rate_limit_unavailable");
  if (data === false) throw new HttpError(429, "rate_limited", "Muitas solicitações. Aguarde um pouco.");
}

/**
 * Teto de gasto externo: sem teto mensal configurado em produção, rotas de custo ficam desligadas.
 * O controle financeiro manual nunca depende disso.
 */
export async function assertCostAllowed(integration: Integration) {
  if (!integrationStatus()[integration]) throw new NotConfiguredError(integration);
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cost_guard");
  if (error) throw new HttpError(503, "cost_guard_unavailable");
  const g = data as { cap_usd: number | null; spent_usd: number };
  if (g.cap_usd === null) {
    if (env().APP_ENV === "production") throw new HttpError(503, "cost_cap_missing", "Recurso desligado até o administrador configurar o teto mensal de consumo.");
    return;
  }
  if (Number(g.spent_usd) >= Number(g.cap_usd)) throw new HttpError(503, "cost_cap_reached", "O teto mensal de consumo do serviço foi atingido. Os demais recursos continuam disponíveis.");
}

export async function reserve(workspaceId: string, metric: "ai_credits" | "tts_seconds" | "stt_seconds", amount: number, key: string): Promise<string> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("reserve_usage", { ws: workspaceId, metric, amount, idem: key });
  if (error) throw error;
  return data as string;
}

export async function settle(reservationId: string, actual: number, costMicros: number | null = null, estimated: boolean | null = null) {
  const sb = await supabaseServer();
  await sb.rpc("settle_usage", { rid: reservationId, actual, cost_micros: costMicros, cost_estimated: estimated });
}
