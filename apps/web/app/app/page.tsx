import { formatBRL, parseCents } from "@rumo/contracts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MonthlyChart } from "@/components/app/charts";
import { ExplainScreen } from "@/components/app/explain-screen";
import { Kpi } from "@/components/app/kpi";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/states";
import * as data from "@/lib/data";
import { addDays, fmtDate, todayIn } from "@/lib/period";
import { getPeriod } from "@/lib/period-server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx } from "@/lib/workspace";

export const metadata = { title: "Visão geral" };

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const ws = ctx.active;
  const period = await getPeriod(await searchParams, ws.timezone);
  const today = todayIn(ws.timezone);
  const sb = await supabaseServer();

  const [s, up, gs, accs, ser, task] = await Promise.all([
    data.summary(ws.id, period.from, period.to),
    data.upcoming(ws.id, addDays(today, 15)),
    data.goals(ws.id),
    data.balances(ws.id, period.to),
    data.series(ws.id, 6, period.to),
    sb.from("tasks").select("id,title,due_date").eq("workspace_id", ws.id).neq("status", "done").order("position").limit(1).maybeSingle(),
  ]);

  const isBusiness = ws.kind === "business";
  const noAccounts = s.accounts_count === 0;
  const noTx = Number(s.transactions_count) === 0 && accs.every((a) => a.opening_cents === "0");
  const goal = gs.find((g) => g.status === "active") ?? gs[0];
  const overdue = up.filter((u) => u.overdue);

  // próxima ação financeira: regra determinística e explicável (não é gerada pela IA)
  const next = noAccounts
    ? { t: "Cadastre sua primeira conta", d: "Informe a conta e o saldo inicial que você controla. O saldo inicial não é contado como receita.", href: "/app/lancamentos?conta=1", cta: "Cadastrar conta" }
    : noTx
      ? { t: "Registre o primeiro lançamento", d: "Uma entrada ou despesa já realizada. Os indicadores passam a ser calculados a partir dos seus registros.", href: "/app/lancamentos?novo=1", cta: "Novo lançamento" }
      : overdue.length
        ? { t: `Regularize ${overdue.length === 1 ? "1 compromisso vencido" : `${overdue.length} compromissos vencidos`}`, d: `${overdue[0]!.description} venceu em ${fmtDate(overdue[0]!.due_date)}.`, href: "/app/planejamento", cta: "Ver compromissos" }
        : parseCents(s.result_cents) < 0n
          ? { t: "As saídas superaram as entradas no período", d: "Veja quais categorias concentram os gastos e ajuste o orçamento.", href: "/app/relatorios", cta: "Ver categorias" }
          : !goal
            ? { t: "Defina uma meta prioritária", d: "Uma reserva de emergência ou um objetivo com valor e prazo.", href: "/app/metas?nova=1", cta: "Criar meta" }
            : { t: "Mantenha as contribuições da meta", d: `Contribua para “${goal.name}” e acompanhe o efeito no orçamento.`, href: "/app/metas", cta: "Abrir metas" };

  const formula = (label: string, f: string, extra?: React.ReactNode) => (
    <div className="stack">
      <p><strong>{label}</strong></p>
      <p className="muted">Período: {period.label} ({fmtDate(period.from)} a {fmtDate(period.to)}) · Espaço: {ws.name}</p>
      <p><span className="badge">Fórmula</span> {f}</p>
      {extra}
      <p className="small muted">Controle informado pelo usuário — sem conexão bancária.</p>
      <Link className="btn btn-secondary btn-sm" href={`/app/lancamentos?de=${period.from}&ate=${period.to}`}>Ver registros de origem</Link>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isBusiness ? "Painel do negócio" : `Olá${ctx.profile.full_name ? `, ${ctx.profile.full_name.split(" ")[0]}` : ""}`}</h1>
          <p>{ws.name} · {period.label}. Toque em um indicador para ver composição, fórmula e origem.</p>
        </div>
        <div className="row">
          <Link className="btn btn-primary" href="/app/lancamentos?novo=1">Novo lançamento</Link>
          <Link className="btn btn-secondary" href="/app/ia">Perguntar ao RUMO</Link>
          <ExplainScreen screen="overview" workspaceId={ws.id} period={{ from: period.from, to: period.to, label: period.label }} />
        </div>
      </div>

      {noAccounts ? (
        <div className="card">
          <EmptyState title="Comece pelo primeiro registro" action={{ href: "/app/lancamentos?conta=1", label: "Cadastrar conta" }}>
            Seu painel ainda está vazio — de propósito. Cadastre uma conta com o saldo que você controla e registre entradas e saídas. Nada é preenchido com valores fictícios.
          </EmptyState>
        </div>
      ) : (
        <section className="grid grid-kpi" aria-label="Indicadores do período">
          <Kpi label={isBusiness ? "Caixa" : "Saldo calculado"} value={<Money cents={s.balance_cents} />} hint="Controle informado por você" detailTitle="Composição do saldo">
            {formula("Saldo no fim do período", "saldos iniciais das contas + entradas − saídas registradas até a data final (transferências entre contas próprias se anulam)",
              <div className="table-wrap"><table className="table"><thead><tr><th>Conta</th><th className="r">Saldo inicial</th><th className="r">Saldo</th></tr></thead>
                <tbody>{accs.map((a) => <tr key={a.account_id}><td>{a.name}</td><td className="r"><Money cents={a.opening_cents} /></td><td className="r"><Money cents={a.balance_cents} /></td></tr>)}</tbody></table></div>)}
          </Kpi>
          <Kpi label={isBusiness ? "Receitas" : "Entradas"} value={<Money cents={s.income_cents} />} hint="Realizadas no período (competência)" detailTitle="Entradas do período">
            {formula("Receitas realizadas", "soma das receitas com competência no período, exceto estornos. Saldo inicial não é receita.")}
          </Kpi>
          <Kpi label={isBusiness ? "Despesas" : "Saídas"} value={<Money cents={s.expense_cents} />} hint="Inclui compras no cartão na data da compra" detailTitle="Saídas do período">
            {formula("Despesas realizadas", "despesas + compras no cartão + encargos informados, por competência. Pagamento de fatura e amortização de dívida não contam de novo.",
              <p className="small">Saídas de caixa no período (inclui pagamento de faturas e dívidas): <Money cents={s.cash_out_cents} /></p>)}
          </Kpi>
          <Kpi label="Resultado" value={<Money cents={s.result_cents} tone="auto" signed />} badge={parseCents(s.result_cents) < 0n ? <span className="badge badge-neg">▼ negativo</span> : <span className="badge badge-pos">▲ positivo</span>}
            hint="Entradas − saídas" detailTitle="Resultado do período">
            {formula("Resultado", "receitas − despesas (base de competência)")}
          </Kpi>
          {isBusiness ? (
            <>
              <Kpi label="A receber" value={<Money cents={s.pending_receivable_cents} />} hint="Pendente até 30 dias após o período" detailTitle="Contas a receber">{formula("Contas a receber pendentes", "valor dos compromissos a receber − recebimentos registrados")}</Kpi>
              <Kpi label="A pagar" value={<Money cents={s.pending_payable_cents} />} hint="Pendente até 30 dias após o período" detailTitle="Contas a pagar">{formula("Contas a pagar pendentes", "valor dos compromissos a pagar − pagamentos registrados")}</Kpi>
            </>
          ) : null}
        </section>
      )}

      {isBusiness && !noAccounts ? (
        <div className="alert alert-info" role="note">
          Margem de contribuição e ponto de equilíbrio aparecem quando houver custos variáveis e fixos classificados. <Link href="/app/rendas#negocio">Informar dados do negócio</Link>
        </div>
      ) : null}

      <div className="grid grid-2">
        <section className="card" aria-labelledby="next-title">
          <div className="card-header"><h2 id="next-title">Próxima ação</h2><span className="badge">Financeiro</span></div>
          <h3>{next.t}</h3>
          <p className="muted" style={{ margin: "6px 0 14px" }}>{next.d}</p>
          <Link className="btn btn-primary btn-sm" href={next.href}>{next.cta}</Link>
          <hr className="divider" />
          <div className="card-header" style={{ marginBottom: 8 }}><h3>Plano de renda</h3><span className="badge badge-pos">Renda</span></div>
          {task.data ? (
            <p>{task.data.title} {task.data.due_date ? <span className="muted small">· até {fmtDate(task.data.due_date)}</span> : null} <Link className="small" href="/app/rendas">Abrir plano</Link></p>
          ) : (
            <p className="muted">Sem plano de renda ativo. <Link href="/app/rendas">Fazer diagnóstico</Link></p>
          )}
        </section>

        <section className="card" aria-labelledby="up-title">
          <div className="card-header"><h2 id="up-title">Próximos 15 dias</h2><Link className="small" href="/app/planejamento">Calendário</Link></div>
          {up.length === 0 ? <p className="muted">Nenhum compromisso pendente nos próximos 15 dias.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }} className="stack">
              {up.slice(0, 6).map((u) => (
                <li key={u.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    <strong>{u.description}</strong><br />
                    <span className={`small ${u.overdue ? "neg" : "muted"}`}>{u.overdue ? "Vencido em " : "Vence em "}{fmtDate(u.due_date)} · {u.direction === "payable" ? "a pagar" : "a receber"}</span>
                  </span>
                  <Money cents={u.pending_cents} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="goal-title">
          <div className="card-header"><h2 id="goal-title">Meta prioritária</h2><Link className="small" href="/app/metas">Metas</Link></div>
          {goal ? (() => {
            const saved = parseCents(goal.saved_cents), target = parseCents(goal.target_cents);
            const pct = target > 0n ? Number((saved * 1000n) / target) / 10 : 0;
            return (
              <div className="stack">
                <h3>{goal.name}</h3>
                <div className="progress" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${goal.name}`}><span style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                <p className="small"><Money cents={goal.saved_cents} /> de <Money cents={goal.target_cents} /> · {pct.toLocaleString("pt-BR")}%{goal.target_date ? ` · prazo ${fmtDate(goal.target_date)}` : ""}</p>
                <p className="small muted">Faltam {formatBRL(target - saved > 0n ? target - saved : 0n)}.</p>
              </div>
            );
          })() : <p className="muted">Nenhuma meta ainda. <Link href="/app/metas?nova=1">Criar meta</Link></p>}
        </section>

        <section className="card" aria-labelledby="ev-title">
          <div className="card-header"><h2 id="ev-title">Entradas e saídas · 6 meses</h2></div>
          <MonthlyChart series={ser} />
        </section>
      </div>
    </>
  );
}
