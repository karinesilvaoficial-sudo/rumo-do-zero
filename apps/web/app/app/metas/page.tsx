import { formatBRL, parseCents } from "@rumo/contracts";
import { redirect } from "next/navigation";
import { ExplainScreen } from "@/components/app/explain-screen";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/states";
import { analytics } from "@/lib/analytics";
import * as data from "@/lib/data";
import { integrationStatus } from "@/lib/env";
import { fmtDate, todayIn } from "@/lib/period";
import { supabaseServer } from "@/lib/supabase/server";
import { canWrite, getCtx } from "@/lib/workspace";
import { GoalActions, NewGoal } from "./client";

export const metadata = { title: "Metas" };
type Plan = { remaining_cents: string; months_left?: number; required_monthly_cents?: string | null; note?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const ws = ctx.active;
  const sp = await searchParams;
  const today = todayIn(ws.timezone);
  const [gs, ent] = await Promise.all([data.goals(ws.id), data.entitlements().catch(() => null)]);
  const sb = await supabaseServer();
  const { data: contribs } = await sb.from("goal_contributions").select("goal_id,amount_cents,contribution_date").eq("workspace_id", ws.id).order("contribution_date", { ascending: false }).limit(200);
  const plans = new Map<string, Plan>();
  if (integrationStatus().analytics) {
    await Promise.all(gs.filter((g) => g.status === "active" && g.target_date).map(async (g) => {
      try {
        plans.set(g.id, await analytics<Plan>("/v1/goals/plan", { userId: ctx.user.id, workspaceId: ws.id }, { target_cents: g.target_cents, saved_cents: g.saved_cents, today, target_date: g.target_date }));
      } catch { /* cálculo indisponível: a tela mostra que falta */ }
    }));
  }
  const limit = (ent as { limits?: { max_active_goals?: number | null } } | null)?.limits?.max_active_goals;
  const active = gs.filter((g) => g.status === "active").length;
  return (
    <>
      <div className="page-head">
        <div><h1>Metas</h1><p>Valor, prazo e contribuições reais. {limit != null ? `${active} de ${limit} metas ativas no seu plano.` : ""}</p></div>
        <div className="row">{canWrite(ws.role) ? <NewGoal open={sp.nova === "1"} /> : null}<ExplainScreen screen="goals" workspaceId={ws.id} /></div>
      </div>
      {gs.length === 0 ? (
        <div className="card"><EmptyState title="Nenhuma meta ainda">Comece por uma reserva de emergência: defina o valor e um prazo possível. O RUMO calcula quanto guardar por mês.</EmptyState></div>
      ) : (
        <div className="grid grid-2">
          {gs.map((g) => {
            const saved = parseCents(g.saved_cents), target = parseCents(g.target_cents);
            const pct = target > 0n ? Number((saved * 1000n) / target) / 10 : 0;
            const plan = plans.get(g.id);
            const hist = (contribs ?? []).filter((c) => c.goal_id === g.id).slice(0, 5);
            return (
              <article key={g.id} className="card stack" aria-labelledby={`g-${g.id}`}>
                <div className="card-header" style={{ marginBottom: 0 }}>
                  <h2 id={`g-${g.id}`}>{g.name}</h2>
                  <span className={`badge ${g.status === "achieved" ? "badge-pos" : ""}`}>{g.status === "achieved" ? "✓ Atingida" : "Ativa"}</span>
                </div>
                <div className="progress" role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${g.name}`}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
                <p><Money cents={g.saved_cents} /> de <Money cents={g.target_cents} /> <span className="muted">· {pct.toLocaleString("pt-BR")}%</span></p>
                <p className="small muted">{g.target_date ? `Prazo: ${fmtDate(g.target_date)}` : "Sem prazo definido"}</p>
                {plan ? (
                  <div className="alert alert-info small">
                    {plan.required_monthly_cents ? <>Para chegar no prazo: <strong className="money">{formatBRL(plan.required_monthly_cents)}</strong> por mês durante {plan.months_left} meses. </> : plan.note ? "Prazo no mês atual ou vencido. " : null}
                    Efeito no orçamento: reserve esse valor como compromisso mensal em Planejamento.
                  </div>
                ) : g.target_date && g.status === "active" ? <p className="small muted">Cálculo do aporte mensal indisponível no momento.</p> : null}
                {hist.length ? (
                  <details><summary className="small">Últimas contribuições</summary>
                    <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{hist.map((h, i) => <li key={i}>{fmtDate(h.contribution_date)} · <Money cents={String(h.amount_cents)} tone="auto" signed /></li>)}</ul>
                  </details>
                ) : null}
                {canWrite(ws.role) && g.status !== "archived" ? <GoalActions goalId={g.id} name={g.name} today={today} /> : null}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
