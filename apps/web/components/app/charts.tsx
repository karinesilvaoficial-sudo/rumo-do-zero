"use client";
import { centsToChartNumber, formatBRL, parseCents } from "@rumo/contracts";
import { chartPalette, tokens } from "@rumo/ui";
import { useMemo } from "react";
import { EChart } from "@/components/charts/echart";
import { shortMonth } from "@/lib/period";

/** Gráficos: valores exatos ficam na tabela equivalente; o gráfico usa números só para a escala. */
type Month = { month: string; complete: boolean; income_cents: string; expense_cents: string };
const axis = { axisLine: { lineStyle: { color: tokens.border } }, axisLabel: { color: tokens.muted }, splitLine: { lineStyle: { color: "#EEF2F8" } } };

export function MonthlyChart({ series }: { series: Month[] }) {
  const empty = series.every((s) => s.income_cents === "0" && s.expense_cents === "0");
  const option = useMemo(() => ({
    color: [tokens.blue, "#9DB4F5", tokens.deep],
    legend: { top: 0, data: ["Entradas", "Saídas", "Resultado"] },
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: series.map((s) => shortMonth(s.month) + (s.complete ? "" : "*")), ...axis },
    yAxis: { type: "value", ...axis, axisLabel: { color: tokens.muted, formatter: (v: number) => v.toLocaleString("pt-BR") } },
    series: [
      { name: "Entradas", type: "bar", barMaxWidth: 22, data: series.map((s) => centsToChartNumber(s.income_cents)) },
      { name: "Saídas", type: "bar", barMaxWidth: 22, data: series.map((s) => centsToChartNumber(s.expense_cents)) },
      { name: "Resultado", type: "line", smooth: false, symbolSize: 6, data: series.map((s) => centsToChartNumber((parseCents(s.income_cents) - parseCents(s.expense_cents)).toString())) },
    ],
  }), [series]);
  return (
    <EChart option={option} empty={empty} label="Gráfico de barras com entradas e saídas por mês e linha de resultado. * indica mês incompleto. Valores em reais."
      table={<MonthTable series={series} />} />
  );
}

function MonthTable({ series }: { series: Month[] }) {
  return (
    <div className="table-wrap"><table className="table">
      <caption className="sr-only">Entradas, saídas e resultado por mês</caption>
      <thead><tr><th>Mês</th><th className="r">Entradas</th><th className="r">Saídas</th><th className="r">Resultado</th></tr></thead>
      <tbody>{series.map((s) => {
        const r = parseCents(s.income_cents) - parseCents(s.expense_cents);
        return <tr key={s.month}><td>{shortMonth(s.month)}{s.complete ? "" : " (incompleto)"}</td><td className="r money">{formatBRL(s.income_cents)}</td><td className="r money">{formatBRL(s.expense_cents)}</td><td className={`r money ${r < 0n ? "neg" : ""}`}>{formatBRL(r)}</td></tr>;
      })}</tbody>
    </table></div>
  );
}

type Cat = { name: string; amount_cents: string; count: number };
export function CategoryChart({ rows, title }: { rows: Cat[]; title: string }) {
  const top = rows.slice(0, 8);
  const option = useMemo(() => ({
    color: [tokens.blue],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", ...axis },
    yAxis: { type: "category", inverse: true, data: top.map((r) => r.name), ...axis },
    series: [{ type: "bar", barMaxWidth: 18, data: top.map((r) => centsToChartNumber(r.amount_cents)), label: { show: true, position: "right", color: tokens.ink, formatter: (p: { value: number }) => p.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) } }],
  }), [top]);
  const total = rows.reduce((a, r) => a + parseCents(r.amount_cents), 0n);
  return (
    <EChart option={option} empty={rows.length === 0} height={Math.max(220, top.length * 36 + 40)} label={`${title}: barras ordenadas por valor.`}
      table={<div className="table-wrap"><table className="table"><thead><tr><th>Categoria</th><th className="r">Lançamentos</th><th className="r">Valor</th><th className="r">%</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td className="r num">{r.count}</td><td className="r money">{formatBRL(r.amount_cents)}</td>
          <td className="r num">{total > 0n ? (Number((parseCents(r.amount_cents) * 1000n) / total) / 10).toLocaleString("pt-BR") : 0}%</td></tr>)}</tbody></table></div>} />
  );
}

export function DonutChart({ rows }: { rows: Cat[] }) {
  // rosca só com poucas categorias: 5 maiores + "Outras" (soma reconciliável)
  const option = useMemo(() => {
    const top = rows.slice(0, 5);
    const rest = rows.slice(5).reduce((a, r) => a + parseCents(r.amount_cents), 0n);
    const items = [...top.map((r) => ({ name: r.name, value: centsToChartNumber(r.amount_cents) })), ...(rest > 0n ? [{ name: "Outras", value: centsToChartNumber(rest) }] : [])];
    return { color: [...chartPalette], tooltip: { trigger: "item" }, legend: { bottom: 0, type: "scroll" },
      series: [{ type: "pie", radius: ["48%", "72%"], center: ["50%", "44%"], label: { show: true, formatter: "{d}%" }, data: items }] };
  }, [rows]);
  return <EChart option={option} empty={rows.length === 0} label="Gráfico de rosca com a participação das cinco maiores categorias e Outras." table={<p className="small muted">Mesmos valores da tabela de categorias.</p>} />;
}

export function SankeyChart({ income, expense }: { income: Cat[]; expense: Cat[] }) {
  const ti = income.reduce((a, r) => a + parseCents(r.amount_cents), 0n);
  const te = expense.reduce((a, r) => a + parseCents(r.amount_cents), 0n);
  const saldo = ti - te;
  const option = useMemo(() => {
    const nodes = new Map<string, true>();
    const links: { source: string; target: string; value: number }[] = [];
    for (const r of income) { nodes.set(`↘ ${r.name}`, true); links.push({ source: `↘ ${r.name}`, target: "Entradas", value: centsToChartNumber(r.amount_cents) }); }
    nodes.set("Entradas", true);
    for (const r of expense.slice(0, 8)) { nodes.set(r.name, true); links.push({ source: "Entradas", target: r.name, value: centsToChartNumber(r.amount_cents) }); }
    const restE = expense.slice(8).reduce((a, r) => a + parseCents(r.amount_cents), 0n);
    if (restE > 0n) { nodes.set("Outras despesas ", true); links.push({ source: "Entradas", target: "Outras despesas ", value: centsToChartNumber(restE) }); }
    if (saldo > 0n) { nodes.set("Sobra do período", true); links.push({ source: "Entradas", target: "Sobra do período", value: centsToChartNumber(saldo) }); }
    return { color: [...chartPalette], tooltip: { trigger: "item" },
      series: [{ type: "sankey", left: 8, right: 120, nodeGap: 10, emphasis: { focus: "adjacency" }, lineStyle: { color: "gradient", opacity: 0.35 },
        label: { color: tokens.ink }, data: [...nodes.keys()].map((name) => ({ name })), links }] };
  }, [income, expense, saldo]);
  return (
    <>
      {saldo < 0n ? <p className="small muted">As saídas superaram as entradas em {formatBRL(-saldo)}; o fluxo mostra apenas como as entradas se distribuíram.</p> : null}
      <EChart option={option} empty={ti === 0n} height={340} label="Diagrama de fluxo das entradas por origem para as categorias de despesa e a sobra do período."
        table={<p className="small">Entradas {formatBRL(ti)} = despesas {formatBRL(te < ti ? te : ti)}{saldo > 0n ? ` + sobra ${formatBRL(saldo)}` : ""}.</p>} />
    </>
  );
}

export function HeatmapChart({ days, from, to }: { days: { date: string; amount_cents: string }[]; from: string; to: string }) {
  const max = days.reduce((m, d) => Math.max(m, centsToChartNumber(d.amount_cents)), 0);
  const option = useMemo(() => ({
    tooltip: { formatter: (p: { value: [string, number] }) => `${p.value[0].split("-").reverse().join("/")}: ${p.value[1].toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` },
    visualMap: { min: 0, max: max || 1, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#EEF3FF", "#9DB4F5", tokens.blue, tokens.deep] }, text: ["mais", "menos"] },
    calendar: { range: [from, to], cellSize: ["auto", 18], top: 24, left: 30, right: 10, yearLabel: { show: false }, dayLabel: { nameMap: ["D", "S", "T", "Q", "Q", "S", "S"], color: tokens.muted }, monthLabel: { nameMap: "PT", color: tokens.muted }, itemStyle: { borderColor: "#fff", borderWidth: 2 }, splitLine: { show: false } },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data: days.map((d) => [d.date, centsToChartNumber(d.amount_cents)]) }],
  }), [days, from, to, max]);
  return <EChart option={option} empty={days.length === 0} height={220} label="Mapa de calor de despesas por dia; cores mais escuras indicam valores maiores."
    table={<div className="table-wrap"><table className="table"><thead><tr><th>Dia</th><th className="r">Despesas</th></tr></thead><tbody>{days.map((d) => <tr key={d.date}><td>{d.date.split("-").reverse().join("/")}</td><td className="r money">{formatBRL(d.amount_cents)}</td></tr>)}</tbody></table></div>} />;
}

type ProjRow = { month: string; balance_cents: string };
const SCEN_NAMES: Record<string, string> = { conservative: "Conservador", central: "Central", optimistic: "Otimista", custom: "Personalizado" };
export function ProjectionChart({ scenarios }: { scenarios: Record<string, { rows: ProjRow[] }> }) {
  const names = SCEN_NAMES;
  const keys = useMemo(() => Object.keys(scenarios), [scenarios]);
  const months = useMemo(() => scenarios[keys[0] ?? ""]?.rows.map((r) => r.month) ?? [], [scenarios, keys]);
  const option = useMemo(() => ({
    color: ["#8A5A00", tokens.blue, "#146C43", "#7B61D9"],
    legend: { top: 0 }, grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: months.map(shortMonth), ...axis },
    yAxis: { type: "value", ...axis },
    series: keys.map((k) => ({ name: `${names[k] ?? k} (hipótese)`, type: "line", symbolSize: 5, lineStyle: { type: k === "central" ? "solid" : "dashed" }, data: scenarios[k]!.rows.map((r) => centsToChartNumber(r.balance_cents)) })),
  }), [scenarios, keys, months, names]);
  return <EChart option={option} label="Projeção de saldo por cenário (hipóteses editáveis, não promessas)."
    table={<div className="table-wrap"><table className="table"><thead><tr><th>Mês</th>{keys.map((k) => <th key={k} className="r">{names[k] ?? k}</th>)}</tr></thead>
      <tbody>{months.map((m, i) => <tr key={m}><td>{shortMonth(m)}</td>{keys.map((k) => <td key={k} className="r money">{formatBRL(scenarios[k]!.rows[i]!.balance_cents)}</td>)}</tr>)}</tbody></table></div>} />;
}
