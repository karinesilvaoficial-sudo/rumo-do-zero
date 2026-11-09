import { parseCents } from "@rumo/contracts";
import { redirect } from "next/navigation";
import { CategoryChart, DonutChart, HeatmapChart, MonthlyChart, SankeyChart } from "@/components/app/charts";
import { ExplainScreen } from "@/components/app/explain-screen";
import { Money } from "@/components/money";
import { NotConfigured } from "@/components/states";
import * as data from "@/lib/data";
import { integrationStatus } from "@/lib/env";
import { addDays, fmtDate } from "@/lib/period";
import { getPeriod } from "@/lib/period-server";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx } from "@/lib/workspace";
import { ExportPanel } from "./client";

export const metadata = { title: "Relatórios" };

function prevPeriod(from: string, to: string) {
  const days = (Date.parse(to) - Date.parse(from)) / 864e5;
  const pTo = addDays(from, -1);
  return { from: addDays(pTo, -days), to: pTo };
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const ws = ctx.active;
  const period = await getPeriod(await searchParams, ws.timezone);
  const prev = prevPeriod(period.from, period.to);
  const sb = await supabaseServer();
  const [s, sp, ser, exp, inc, days, { data: jobs }, { data: plan }] = await Promise.all([
    data.summary(ws.id, period.from, period.to), data.summary(ws.id, prev.from, prev.to), data.series(ws.id, 12, period.to),
    data.breakdown(ws.id, period.from, period.to, "expense"), data.breakdown(ws.id, period.from, period.to, "income"),
    data.dailyExpenses(ws.id, period.from, period.to),
    sb.from("report_jobs").select("id,kind,status,params,created_at,finished_at,expires_at,error").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(15),
    sb.rpc("workspace_plan", { ws: ws.id }),
  ]);
  const delta = (a: string, b: string) => { const x = parseCents(a), y = parseCents(b); return { diff: x - y, pct: y !== 0n ? Number(((x - y) * 1000n) / (y < 0n ? -y : y)) / 10 : null }; };
  const rows = [["Receitas", s.income_cents, sp.income_cents], ["Despesas", s.expense_cents, sp.expense_cents], ["Resultado", s.result_cents, sp.result_cents]] as const;
  const st = integrationStatus();
  return (
    <>
      <div className="page-head">
        <div><h1>Relatórios</h1><p>{ws.name} · {period.label} ({fmtDate(period.from)} a {fmtDate(period.to)}). Mesmos valores do painel, da IA e do PDF.</p></div>
        <ExplainScreen screen="reports" workspaceId={ws.id} period={{ from: period.from, to: period.to, label: period.label }} />
      </div>

      <section className="card" aria-labelledby="cmp">
        <div className="card-header"><h2 id="cmp">Comparação com o período anterior equivalente</h2><span className="small muted">{fmtDate(prev.from)} a {fmtDate(prev.to)}</span></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Indicador</th><th className="r">Atual</th><th className="r">Anterior</th><th className="r">Variação</th></tr></thead>
          <tbody>{rows.map(([l, a, b]) => { const d = delta(a, b); return (
            <tr key={l}><td>{l}</td><td className="r"><Money cents={a} /></td><td className="r"><Money cents={b} /></td>
              <td className="r"><Money cents={d.diff} tone="auto" signed /> {d.pct !== null ? <span className="small muted">({d.pct > 0 ? "+" : ""}{d.pct.toLocaleString("pt-BR")}%)</span> : <span className="small muted">(sem base)</span>}</td></tr>); })}</tbody>
        </table></div>
        {period.to >= new Date().toISOString().slice(0, 10) ? <p className="small muted" style={{ marginTop: 8 }}>O período atual ainda não terminou; a comparação considera dias ainda não ocorridos.</p> : null}
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="g1"><div className="card-header"><h2 id="g1">Entradas, saídas e resultado · 12 meses</h2></div><MonthlyChart series={ser} /></section>
        <section className="card" aria-labelledby="g2"><div className="card-header"><h2 id="g2">Onde os gastos se concentram</h2></div><CategoryChart rows={exp} title="Despesas por categoria" /></section>
        <section className="card" aria-labelledby="g3"><div className="card-header"><h2 id="g3">Participação das categorias</h2></div><DonutChart rows={exp} /></section>
        <section className="card" aria-labelledby="g4"><div className="card-header"><h2 id="g4">Para onde o dinheiro vai</h2></div><SankeyChart income={inc} expense={exp} /></section>
      </div>
      <section className="card" aria-labelledby="g5"><div className="card-header"><h2 id="g5">Dias com mais despesas</h2></div><HeatmapChart days={days} from={period.from} to={period.to} /></section>

      <section className="card" aria-labelledby="exp">
        <div className="card-header"><h2 id="exp">Exportar</h2></div>
        {!st.analytics ? <NotConfigured what="O serviço de relatórios (Python)" /> : null}
        <ExportPanel workspaceId={ws.id} period={{ from: period.from, to: period.to, label: period.label }} plan={(plan as string) ?? "free"} disabled={!st.analytics}
          jobs={(jobs ?? []).map((j) => ({ id: j.id, kind: j.kind, status: j.status, created_at: j.created_at, expires_at: j.expires_at, label: (j.params as { label?: string; from: string; to: string }).label ?? `${fmtDate((j.params as { from: string }).from)} a ${fmtDate((j.params as { to: string }).to)}` }))} />
      </section>
    </>
  );
}
