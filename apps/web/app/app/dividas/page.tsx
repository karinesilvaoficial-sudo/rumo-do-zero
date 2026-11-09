import { formatBRL } from "@rumo/contracts";
import { redirect } from "next/navigation";
import { ExplainScreen } from "@/components/app/explain-screen";
import { Money } from "@/components/money";
import { EmptyState, NotConfigured } from "@/components/states";
import { analytics } from "@/lib/analytics";
import * as data from "@/lib/data";
import { integrationStatus } from "@/lib/env";
import { fmtDate, monthLabel, todayIn } from "@/lib/period";
import { supabaseServer } from "@/lib/supabase/server";
import { canAdmin, canWrite, getCtx } from "@/lib/workspace";
import { CardForms, DebtForms, InvoiceActions, PayoffForm } from "./client";

export const metadata = { title: "Dívidas e cartões" };
type Sim = { status: string; missing: string[]; months: number | null; total_interest_cents: string | null; total_paid_cents: string | null };
type Payoff = { status: string; missing: string[]; months?: number; total_interest_cents?: string; order?: { id: string; paid_off_month: number; interest_cents: string }[]; required_min_cents?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const ws = ctx.active;
  const sp = await searchParams;
  const today = todayIn(ws.timezone);
  const sb = await supabaseServer();
  type Inv = { id: string; card_id: string; reference_month: string; closing_date: string; due_date: string; installments_cents: string; charges_cents: string; paid_cents: string; total_cents: string; pending_cents: string };
  const [{ data: cards }, invRes, { data: debts }, cats, accs] = await Promise.all([
    sb.from("credit_cards").select("id,name,closing_day,due_day,limit_cents,payment_account_id").eq("workspace_id", ws.id).is("archived_at", null).order("created_at"),
    sb.rpc("card_invoices_summary", { ws: ws.id, p_from: `${today.slice(0, 7)}-01` }),
    sb.from("debts").select("id,name,creditor,outstanding_cents,monthly_rate,installment_cents,remaining_installments,due_day,status,version").eq("workspace_id", ws.id).neq("status", "archived").order("created_at"),
    data.categories(ws.id), data.accountsList(ws.id),
  ]);
  const invoices = (invRes.data ?? []) as Inv[];
  const totals = new Map(invoices.map((i) => [i.id, i]));
  const st = integrationStatus();
  const sims = new Map<string, Sim>();
  let payoff: Payoff | null = null;
  const active = (debts ?? []).filter((d) => d.status === "active");
  if (st.analytics) {
    await Promise.all(active.map(async (d) => {
      try { sims.set(d.id, await analytics<Sim>("/v1/debts/simulate", { userId: ctx.user.id, workspaceId: ws.id }, { outstanding_cents: String(d.outstanding_cents), monthly_rate: d.monthly_rate === null ? null : String(Number(d.monthly_rate)), payment_cents: d.installment_cents === null ? null : String(d.installment_cents) })); } catch { /* indisponível */ }
    }));
    const budget = sp.orcamento && /^\d{1,13}$/.test(sp.orcamento) ? sp.orcamento : null;
    if (budget && active.length) {
      try {
        payoff = await analytics<Payoff>("/v1/debts/payoff", { userId: ctx.user.id, workspaceId: ws.id }, {
          strategy: sp.estrategia === "snowball" ? "snowball" : "avalanche", monthly_budget_cents: budget,
          debts: active.map((d) => ({ id: d.id, outstanding_cents: String(d.outstanding_cents), monthly_rate: d.monthly_rate === null ? null : String(Number(d.monthly_rate)), min_payment_cents: d.installment_cents === null ? null : String(d.installment_cents) })),
        });
      } catch { payoff = null; }
    }
  }
  const debtName = new Map((debts ?? []).map((d) => [d.id, d.name]));
  const w = canWrite(ws.role);
  return (
    <>
      <div className="page-head">
        <div><h1>Dívidas e cartões</h1><p>Sem conexão com bancos: você informa compras, faturas, encargos e taxas. A compra é a despesa; pagar a fatura só quita o compromisso.</p></div>
        <div className="row"><CardForms canAdmin={canAdmin(ws.role)} canWrite={w} cards={(cards ?? []).map((c) => ({ id: c.id, name: c.name }))} accounts={accs} categories={cats.filter((c) => c.kind === "expense")} today={today} /><ExplainScreen screen="debts" workspaceId={ws.id} /></div>
      </div>

      <section aria-labelledby="cards-t" className="stack">
        <h2 id="cards-t">Cartões</h2>
        {(cards ?? []).length === 0 ? <div className="card"><EmptyState title="Nenhum cartão">Cadastre o cartão com dias de fechamento e vencimento. Compras no dia do fechamento ou depois entram na fatura seguinte.</EmptyState></div> : null}
        {(cards ?? []).map((c) => {
          const invs = (invoices ?? []).filter((i) => i.card_id === c.id).slice(0, 4);
          return (
            <article key={c.id} className="card">
              <div className="card-header"><h3>{c.name}</h3><span className="small muted">Fecha dia {c.closing_day} · vence dia {c.due_day}{c.limit_cents ? <> · limite <Money cents={String(c.limit_cents)} /></> : null}</span></div>
              {invs.length === 0 ? <p className="muted">Sem faturas abertas.</p> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Fatura</th><th>Vencimento</th><th className="r">Parcelas</th><th className="r">Encargos</th><th className="r">Pago</th><th className="r">Pendente</th><th><span className="sr-only">Ações</span></th></tr></thead>
                  <tbody>{invs.map((i) => {
                    const t = totals.get(i.id)!;
                    return (
                      <tr key={i.id}>
                        <td>{monthLabel(i.reference_month)}</td><td className={i.due_date < today && t.pending_cents !== "0" ? "neg" : ""}>{fmtDate(i.due_date)}</td>
                        <td className="r money">{formatBRL(t.installments_cents)}</td><td className="r money">{formatBRL(t.charges_cents)}</td><td className="r money">{formatBRL(t.paid_cents)}</td>
                        <td className="r"><strong className="money">{formatBRL(t.pending_cents)}</strong></td>
                        <td className="r">{w && t.pending_cents !== "0" ? <InvoiceActions invoiceId={i.id} pending={t.pending_cents} accounts={accs} defaultAccount={c.payment_account_id} today={today} /> : null}</td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
              )}
            </article>
          );
        })}
      </section>

      <section aria-labelledby="debts-t" className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2 id="debts-t">Dívidas</h2>{w ? <DebtForms debts={active.map((d) => ({ id: d.id, name: d.name }))} accounts={accs} today={today} /> : null}</div>
        {!st.analytics && active.length ? <NotConfigured what="O serviço de cálculo (Python)" /> : null}
        {(debts ?? []).length === 0 ? <div className="card"><EmptyState title="Nenhuma dívida cadastrada">Informe saldo devedor, taxa mensal (se souber) e parcela. Sem a taxa, mostramos o que falta em vez de estimar.</EmptyState></div> : (
          <div className="grid grid-2">
            {(debts ?? []).map((d) => {
              const s = sims.get(d.id);
              return (
                <article key={d.id} className="card stack">
                  <div className="card-header" style={{ marginBottom: 0 }}><h3>{d.name}</h3><span className={`badge ${d.status === "settled" ? "badge-pos" : ""}`}>{d.status === "settled" ? "Quitada" : d.creditor ?? "Ativa"}</span></div>
                  <p>Saldo devedor: <strong><Money cents={String(d.outstanding_cents)} /></strong></p>
                  <p className="small">Taxa: {d.monthly_rate === null ? <span className="badge badge-warn">não informada</span> : `${(Number(d.monthly_rate) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% a.m.`} · Parcela: {d.installment_cents ? <Money cents={String(d.installment_cents)} /> : <span className="badge badge-warn">não informada</span>}</p>
                  {s ? (s.status === "ok" ? <div className="alert alert-info small">Quitação em <strong>{s.months} meses</strong>, com juros de <strong className="money">{formatBRL(s.total_interest_cents!)}</strong> (total pago {formatBRL(s.total_paid_cents!)}). Hipótese: taxa e parcela informadas constantes; juros arredondados ao centavo.</div>
                    : s.status === "incomplete" ? <div className="alert alert-warn small">Simulação incompleta: informe {s.missing.map((m) => (m === "monthly_rate" ? "a taxa mensal" : "a parcela")).join(" e ")}. Não assumimos taxa zero.</div>
                      : <div className="alert alert-error small">Com essa parcela, os juros do mês são maiores ou iguais ao pagamento: a dívida não diminui.</div>) : null}
                </article>
              );
            })}
          </div>
        )}
        {active.length > 1 || active.length === 1 ? (
          <div className="card">
            <h3>Plano de quitação</h3>
            <PayoffForm defaultBudget={sp.orcamento} strategy={sp.estrategia === "snowball" ? "snowball" : "avalanche"} />
            {payoff ? (payoff.status === "ok" ? (
              <div className="stack" style={{ marginTop: 12 }}>
                <p>Quitação total em <strong>{payoff.months} meses</strong> · juros totais <strong className="money">{formatBRL(payoff.total_interest_cents!)}</strong> ({sp.estrategia === "snowball" ? "bola de neve: menor saldo primeiro" : "avalanche: maior taxa primeiro"}).</p>
                <ol className="small">{payoff.order!.map((o) => <li key={o.id}>{debtName.get(o.id)} — quitada no mês {o.paid_off_month} · juros {formatBRL(o.interest_cents)}</li>)}</ol>
              </div>
            ) : payoff.status === "incomplete" ? <p className="alert alert-warn small" style={{ marginTop: 12 }}>Faltam dados: {payoff.missing.map((m) => `${m.startsWith("monthly_rate") ? "taxa" : "parcela mínima"} de ${debtName.get(m.split(":")[1] ?? "") ?? "uma dívida"}`).join("; ")}.</p>
              : payoff.status === "insufficient_budget" ? <p className="alert alert-warn small" style={{ marginTop: 12 }}>O orçamento não cobre as parcelas mínimas ({formatBRL(payoff.required_min_cents!)}).</p>
                : <p className="alert alert-error small" style={{ marginTop: 12 }}>Com esse orçamento a dívida não diminui.</p>) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
