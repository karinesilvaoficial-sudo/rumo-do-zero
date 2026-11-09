import { notFound, redirect } from "next/navigation";
import { integrationStatus } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx } from "@/lib/workspace";
import { CostCapForm } from "./client";

export const metadata = { title: "Administração" };
type O = Record<string, unknown> & { cost_caps?: { monthly_usd_cap: number | null } };

/** Saúde e operação da plataforma. Sem leitura das finanças dos clientes (só agregados operacionais). */
export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.profile.is_platform_admin) notFound();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("admin_overview");
  const o = (data ?? {}) as O;
  const st = integrationStatus();
  const card = (t: string, v: unknown) => <div className="kpi" style={{ cursor: "default" }}><span className="kpi-label">{t}</span><span className="kpi-value" style={{ fontSize: "1.2rem" }}>{typeof v === "object" ? <pre className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(v ?? {}, null, 1)}</pre> : String(v ?? "—")}</span></div>;
  return (
    <>
      <div className="page-head"><div><h1>Administração</h1><p>Indicadores operacionais a partir de eventos realmente coletados. Conteúdo privado de clientes exige concessão temporária e auditada.</p></div></div>
      {error ? <div className="alert alert-error">Falha ao carregar.</div> : null}
      <section className="card"><div className="card-header"><h2>Integrações</h2></div>
        <div className="row">{Object.entries(st).map(([k, v]) => <span key={k} className={`badge ${v ? "badge-pos" : "badge-warn"}`}>{v ? "✓" : "!"} {k}</span>)}</div>
      </section>
      <section className="card stack"><div className="card-header"><h2>Teto de consumo externo</h2></div>
        {o.cost_caps?.monthly_usd_cap == null ? <div className="alert alert-warn">Sem teto mensal configurado: em produção, IA e voz permanecem desligadas até a definição.</div> : null}
        <CostCapForm current={o.cost_caps?.monthly_usd_cap ?? null} />
      </section>
      <div className="grid grid-3">
        {card("Usuários", o.users)}{card("Espaços ativos", o.workspaces)}{card("Ativos (30 dias, com lançamentos)", o.active_30d)}
        {card("Acessos pagos vigentes", o.paid_access)}{card("Assinaturas por situação", o.subscriptions_by_status)}{card("Consumo do mês", o.usage_month)}
        {card("Fila de e-mails", o.outbox)}{card("Webhooks pendentes", o.webhooks_pending)}{card("Relatórios", o.report_jobs)}
      </div>
      <section className="card"><div className="card-header"><h2>Falhas recentes</h2></div>
        <pre className="small" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({ outbox: o.outbox_failed, webhooks: o.webhook_errors }, null, 2)}</pre>
      </section>
    </>
  );
}
