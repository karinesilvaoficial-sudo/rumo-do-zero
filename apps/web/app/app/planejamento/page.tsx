import { formatBRL, parseCents } from "@rumo/contracts";
import { redirect } from "next/navigation";
import { ProjectionChart } from "@/components/app/charts";
import { ExplainScreen } from "@/components/app/explain-screen";
import { Money } from "@/components/money";
import { EmptyState, NotConfigured } from "@/components/states";
import { analytics } from "@/lib/analytics";
import * as data from "@/lib/data";
import { integrationStatus } from "@/lib/env";
import { addDays, fmtDate, monthLabel, todayIn } from "@/lib/period";
import { supabaseServer } from "@/lib/supabase/server";
import { canWrite, getCtx } from "@/lib/workspace";
import { BudgetForm, CommitmentRow, NewCommitment, RuleEdit, ScenarioForm } from "./client";

export const metadata = { title: "Planejamento" };
type Projection = { status: string; missing: string[]; assumptions: Record<string, string | number>; scenarios?: Record<string, { factors: Record<string, string>; rows: { month: string; balance_cents: string }[] }> };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const ws = ctx.active;
  const sp = await searchParams;
  const today = todayIn(ws.timezone);
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? `${sp.mes}-01` : `${today.slice(0, 7)}-01`;
  const monthEnd = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const sb = await supabaseServer();
  const [cats, accs, up, spent, budgetsRes, rulesRes, ser, s] = await Promise.all([
    data.categories(ws.id), data.accountsList(ws.id), data.upcoming(ws.id, addDays(today, 60)),
    data.breakdown(ws.id, month, monthEnd, "expense"),
    sb.from("budgets").select("id,category_id,amount_cents").eq("workspace_id", ws.id).eq("month", month),
    sb.from("recurring_rules").select("id,description,amount_cents,frequency,start_date,end_date,direction,version,active").eq("workspace_id", ws.id).order("created_at"),
    data.series(ws.id, 7, today), data.summary(ws.id, today, today),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const spentBy = new Map(spent.map((b) => [b.category_id, parseCents(b.amount_cents)]));
  const budgets = budgetsRes.data ?? [];

  // projeção: só meses completos entram na média; compromissos agendados entram explicitamente
  let projection: Projection | null = null;
  const factors = (k: string, i: string, e: string) => ({ income_factor: /^\d(\.\d{1,4})?$/.test(sp[`${k}_r`] ?? "") ? sp[`${k}_r`]! : i, expense_factor: /^\d(\.\d{1,4})?$/.test(sp[`${k}_d`] ?? "") ? sp[`${k}_d`]! : e });
  const scen = { conservative: factors("c", "0.90", "1.10"), central: factors("m", "1.00", "1.00"), optimistic: factors("o", "1.05", "0.95") };
  if (integrationStatus().analytics) {
    try {
      projection = await analytics<Projection>("/v1/projections/cash", { userId: ctx.user.id, workspaceId: ws.id }, {
        start_balance_cents: s.balance_cents, start_month: `${addDays(monthEnd, 1).slice(0, 7)}-01`, months: 6,
        history: ser.filter((m) => m.month < `${today.slice(0, 7)}-01`), scenarios: scen,
        scheduled: up.filter((u) => u.due_date > today).map((u) => ({ month: u.due_date, direction: u.direction, pending_cents: u.pending_cents })),
      });
    } catch { projection = null; }
  }

  const byDate = new Map<string, typeof up>();
  for (const u of up) byDate.set(u.due_date, [...(byDate.get(u.due_date) ?? []), u]);
  const w = canWrite(ws.role);

  return (
    <>
      <div className="page-head">
        <div><h1>Planejamento</h1><p>Orçamentos, compromissos futuros, recorrências e cenários. Previsto e simulado aparecem identificados — não se misturam ao realizado.</p></div>
        <div className="row">{w ? <NewCommitment categories={cats} today={today} /> : null}<ExplainScreen screen="planning" workspaceId={ws.id} /></div>
      </div>

      <section className="card" aria-labelledby="orc">
        <div className="card-header">
          <h2 id="orc">Orçamento · {monthLabel(month)}</h2>
          <form className="row"><label className="sr-only" htmlFor="mes">Mês</label><input id="mes" name="mes" type="month" className="input" defaultValue={month.slice(0, 7)} style={{ width: "auto" }} /><button className="btn btn-secondary btn-sm">Ver</button></form>
        </div>
        {budgets.length === 0 && spent.length === 0 ? <p className="muted">Sem orçamento nem despesas neste mês.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Categoria</th><th className="r">Orçado</th><th className="r">Realizado</th><th className="r">Disponível</th><th>Uso</th></tr></thead>
            <tbody>
              {[...new Set([...budgets.map((b) => b.category_id), ...spent.map((b) => b.category_id).filter(Boolean)])].map((cid) => {
                const b = budgets.find((x) => x.category_id === cid);
                const used = spentBy.get(cid) ?? 0n;
                const plan = b ? parseCents(String(b.amount_cents)) : null;
                const pct = plan && plan > 0n ? Number((used * 100n) / plan) : null;
                return (
                  <tr key={cid ?? "none"}>
                    <td>{cid ? catName.get(cid) : "Sem categoria"}</td>
                    <td className="r">{plan !== null ? <Money cents={plan} /> : <span className="muted">—</span>}</td>
                    <td className="r"><Money cents={used} /></td>
                    <td className="r">{plan !== null ? <Money cents={plan - used} tone="auto" /> : "—"}</td>
                    <td style={{ minWidth: 120 }}>{pct !== null ? <><div className="progress" aria-hidden><span style={{ width: `${Math.min(100, pct)}%`, background: pct > 100 ? "var(--rumo-negative)" : undefined }} /></div><span className={`small ${pct > 100 ? "neg" : "muted"}`}>{pct}%{pct > 100 ? " · acima" : ""}</span></> : <span className="small muted">sem orçamento</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        {w ? <BudgetForm categories={cats.filter((c) => c.kind === "expense")} month={month} /> : null}
        <p className="small muted" style={{ marginTop: 8 }}>{month.slice(0, 7) === today.slice(0, 7) ? "Mês em andamento: comparações com meses completos devem considerar os dias restantes." : ""}</p>
      </section>

      <section className="card" aria-labelledby="cal">
        <div className="card-header"><h2 id="cal">Calendário · próximos 60 dias</h2><span className="badge">Previsto</span></div>
        {up.length === 0 ? <EmptyState title="Nenhum compromisso pendente">Cadastre contas a pagar e a receber, únicas ou recorrentes.</EmptyState> : (
          <div className="stack">
            {[...byDate.entries()].map(([d, items]) => (
              <div key={d}>
                <h3 className="small" style={{ color: d < today ? "var(--rumo-negative)" : "var(--rumo-muted)", marginBottom: 6 }}>{d < today ? "Vencido · " : ""}{fmtDate(d)}</h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">
                  {items.map((u) => <CommitmentRow key={u.id} c={u} accounts={accs} today={today} canWrite={w} />)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="rec">
        <div className="card-header"><h2 id="rec">Recorrências</h2></div>
        {(rulesRes.data ?? []).length === 0 ? <p className="muted">Nenhuma recorrência. Ao criar um compromisso, escolha “mensal”, “semanal” ou “anual”.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Descrição</th><th>Frequência</th><th>Desde</th><th className="r">Valor</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{(rulesRes.data ?? []).map((r) => (
              <tr key={r.id}><td>{r.description} <span className="badge badge-muted">{r.direction === "payable" ? "a pagar" : "a receber"}</span></td>
                <td>{({ weekly: "Semanal", monthly: "Mensal", yearly: "Anual" } as Record<string, string>)[r.frequency]}</td><td>{fmtDate(r.start_date)}</td>
                <td className="r"><Money cents={String(r.amount_cents)} /></td>
                <td className="r">{w ? <RuleEdit rule={{ id: r.id, version: r.version, description: r.description }} today={today} /> : null}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>“Editar só esta” altera uma ocorrência no calendário; “Editar próximas” altera a regra e as ocorrências futuras ainda não pagas.</p>
      </section>

      <section className="card" aria-labelledby="proj">
        <div className="card-header"><h2 id="proj">Projeção de caixa · 6 meses</h2><span className="badge badge-warn">Simulado</span></div>
        {!integrationStatus().analytics ? <NotConfigured what="O serviço de cálculo (Python)" /> : !projection ? <p className="muted">Projeção indisponível no momento. Tente novamente.</p>
          : projection.status !== "ok" ? <p className="muted">Ainda não há meses completos com registros para estimar a base. A projeção aparece após o primeiro mês completo.</p> : (
            <>
              <p className="small muted">Base: média de {String(projection.assumptions.base_months)} mês(es) completo(s) — entradas {formatBRL(String(projection.assumptions.avg_income_cents))}, saídas {formatBRL(String(projection.assumptions.avg_expense_cents))} — mais compromissos já agendados. Saldo de partida: <Money cents={s.balance_cents} />. Cenários são hipóteses editáveis, não promessas.</p>
              <ProjectionChart scenarios={projection.scenarios!} />
              <ScenarioForm values={scen} />
            </>
          )}
      </section>
    </>
  );
}
