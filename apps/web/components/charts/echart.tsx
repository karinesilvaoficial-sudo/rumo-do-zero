"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * ECharts carregado sob demanda (somente os módulos usados), com descrição acessível (aria),
 * decal opcional para não depender só de cor e TABELA EQUIVALENTE sempre disponível.
 */
type Option = Record<string, unknown>;

async function loadEcharts() {
  const [core, charts, comps, renderers, features] = await Promise.all([
    import("echarts/core"),
    import("echarts/charts"),
    import("echarts/components"),
    import("echarts/renderers"),
    import("echarts/features"),
  ]);
  core.use([
    charts.BarChart, charts.LineChart, charts.PieChart, charts.SankeyChart, charts.HeatmapChart,
    comps.GridComponent, comps.TooltipComponent, comps.LegendComponent, comps.AriaComponent, comps.DataZoomComponent,
    comps.VisualMapComponent, comps.CalendarComponent, comps.MarkLineComponent, comps.TitleComponent,
    renderers.SVGRenderer, features.LabelLayout,
  ]);
  return core;
}

const FONT = { fontFamily: "Manrope, system-ui, sans-serif", color: "#52627A" };

export function EChart({ option, label, table, height = 300, empty }: { option: Option; label: string; table: ReactNode; height?: number; empty?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (empty) return;
    let disposed = false;
    let chart: { dispose: () => void; resize: () => void; setOption: (o: Option, n?: boolean) => void } | null = null;
    let ro: ResizeObserver | null = null;
    loadEcharts().then((ec) => {
      if (disposed || !ref.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reduceMotion === "true";
      chart = ec.init(ref.current, undefined, { renderer: "svg" });
      chart.setOption({
        animation: !reduced, animationDuration: 500, textStyle: FONT,
        aria: { enabled: true, label: { description: label }, decal: { show: false } },
        tooltip: { trigger: "axis", confine: true, valueFormatter: brl },
        ...option,
      }, true);
      ro = new ResizeObserver(() => chart?.resize());
      ro.observe(ref.current);
    }).catch(() => setFailed(true));
    return () => { disposed = true; ro?.disconnect(); chart?.dispose(); };
  }, [option, label, empty]);

  return (
    <figure style={{ margin: 0 }}>
      {empty ? (
        <div className="empty" style={{ padding: 24 }}><p>Sem dados no período para este gráfico.</p></div>
      ) : failed ? (
        <p className="muted small">Não foi possível carregar o gráfico. Os dados estão na tabela abaixo.</p>
      ) : (
        <div ref={ref} className="chart" style={{ height }} role="img" aria-label={label} />
      )}
      <details className="data-table">
        <summary>Ver dados em tabela</summary>
        {table}
      </details>
    </figure>
  );
}

export function brl(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
