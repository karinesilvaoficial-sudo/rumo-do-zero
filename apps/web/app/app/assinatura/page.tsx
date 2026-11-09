import { formatBRL, formatBytes, formatLimit, PLANS } from "@rumo/contracts";
import { redirect } from "next/navigation";
import { NotConfigured } from "@/components/states";
import { env, integrationStatus } from "@/lib/env";
import { fmtDate } from "@/lib/period";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx } from "@/lib/workspace";
import { PlanPicker, PortalButton } from "./client";

export const metadata = { title: "Assinatura" };
type Bal = { limit_amount: number; consumed: number; available: number };
type Ent = { plan: string; window_start: string; window_end: string; access_until: string | null; limits: { max_entries_month: number | null; max_workspaces: number | null; max_active_goals: number | null; max_guests: number; storage_bytes: number };
  usage: { ai_credits: Bal; tts_seconds: Bal; stt_seconds: Bal; entries: number; workspaces: number; active_goals: number; guests: number } };

function Meter({ label, used, limit, unit = "" }: { label: string; used: number; limit: number | null; unit?: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row small" style={{ justifyContent: "space-between" }}><span>{label}</span><span className="num">{used.toLocaleString("pt-BR")}{unit} / {limit === null ? "sem limite comercial fixo" : `${limit.toLocaleString("pt-BR")}${unit}`}</span></div>
      {limit !== null ? <div className="progress" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%`, background: pct >= 100 ? "var(--rumo-negative)" : undefined }} /></div> : null}
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  const sp = await searchParams;
  const sb = await supabaseServer();
  const [{ data: ent }, { data: subs }, { data: periods }] = await Promise.all([
    sb.rpc("my_entitlements"),
    sb.from("subscriptions").select("plan_code,billing_interval,status,current_period_end,cancel_at_period_end").order("created_at", { ascending: false }).limit(3),
    sb.from("access_periods").select("plan_code,source,starts_at,ends_at,revoked_at,revoke_reason").order("starts_at", { ascending: false }).limit(12),
  ]);
  const e = ent as Ent;
  const plan = PLANS.find((p) => p.code === e.plan)!;
  const st = integrationStatus();
  const sub = subs?.[0];
  return (
    <>
      <div className="page-head"><div><h1>Assinatura</h1><p>Seu plano vale para todos os espaços que você possui e para os membros convidados neles.</p></div></div>
      {sp.retorno ? <div className="alert alert-info" role="status">Recebemos seu retorno do pagamento. O plano é liberado assim que o provedor confirmar (normalmente em segundos; Pix pode levar alguns minutos). Esta página atualiza ao recarregar.</div> : null}
      {sp.cancelado ? <div className="alert alert-warn" role="status">Pagamento não concluído. Nada foi cobrado.</div> : null}

      <section className="card stack" aria-labelledby="atual">
        <div className="card-header" style={{ marginBottom: 0 }}><h2 id="atual">Plano atual: {plan.name}</h2>{e.access_until && e.plan !== "free" ? <span className="small muted">Acesso pago até {fmtDate(e.access_until.slice(0, 10))}</span> : null}</div>
        {sub ? <p className="small">Assinatura {sub.billing_interval === "year" ? "anual" : "mensal"} no cartão · situação: <strong>{({ active: "ativa", past_due: "pagamento pendente", canceled: "cancelada", incomplete: "incompleta", trialing: "ativa", unpaid: "não paga" } as Record<string, string>)[sub.status] ?? sub.status}</strong>{sub.cancel_at_period_end ? ` · termina em ${fmtDate(String(sub.current_period_end).slice(0, 10))} (sem renovação)` : sub.current_period_end ? ` · renova em ${fmtDate(String(sub.current_period_end).slice(0, 10))}` : ""}</p> : e.plan !== "free" ? <p className="small">Pré-pago (Pix) · renovação manual.</p> : <p className="small muted">Plano Free contínuo, sem cartão e sem expiração.</p>}
        <p className="small muted">Franquias de IA e voz: janela de {fmtDate(e.window_start.slice(0, 10))} a {fmtDate(e.window_end.slice(0, 10))} (renovação mensal, inclusive no anual).</p>
        <div className="grid grid-2">
          <Meter label="Créditos de IA" used={e.usage.ai_credits.consumed} limit={e.usage.ai_credits.limit_amount} />
          <Meter label="Voz (TTS)" used={Math.ceil(e.usage.tts_seconds.consumed / 60)} limit={Math.round(e.usage.tts_seconds.limit_amount / 60)} unit=" min" />
          <Meter label="Microfone (transcrição)" used={Math.ceil(e.usage.stt_seconds.consumed / 60)} limit={Math.round(e.usage.stt_seconds.limit_amount / 60)} unit=" min" />
          <Meter label="Lançamentos novos no mês" used={e.usage.entries} limit={e.limits.max_entries_month} />
          <Meter label="Espaços ativos" used={e.usage.workspaces} limit={e.limits.max_workspaces} />
          <Meter label="Metas ativas" used={e.usage.active_goals} limit={e.limits.max_active_goals} />
          <Meter label="Convidados distintos" used={e.usage.guests} limit={e.limits.max_guests} />
          <p className="small muted">Armazenamento privado: até {formatBytes(e.limits.storage_bytes)}.</p>
        </div>
        <p className="small muted">Ao atingir um limite, apenas o recurso afetado é pausado. Não cobramos excedentes.</p>
        {sub && st.billing ? <PortalButton /> : null}
      </section>

      <section className="card" aria-labelledby="planos">
        <div className="card-header"><h2 id="planos">Mudar de plano</h2></div>
        {!st.billing ? <NotConfigured what="A cobrança (Stripe)" /> : null}
        <PlanPicker current={e.plan} hasSubscription={Boolean(sub && ["active", "past_due", "trialing"].includes(sub.status))} pixEnabled={env().STRIPE_PIX_ENABLED === "true"} disabled={!st.billing} preselect={sp.plano}
          plans={PLANS.filter((p) => p.code !== "free").map((p) => ({ code: p.code, name: p.name, monthly: formatBRL(BigInt(p.monthly_cents)), annual: formatBRL(BigInt(p.annual_cents)),
            annualMonthly: formatBRL(BigInt(Math.round(p.annual_cents / 12))), lines: [`${formatLimit(p.max_workspaces)} espaço(s)`, `${formatLimit(p.max_entries_month)} lançamentos/mês`, `${p.ai_credits_month} créditos de IA/mês`, `${p.max_guests} convidados`] }))} />
        <ul className="small muted" style={{ paddingLeft: 18, marginTop: 12 }}>
          <li>Upgrade: o portal mostra a diferença e o momento da cobrança antes de você confirmar.</li>
          <li>Downgrade e cancelamento: valem no fim do período já pago. Seus dados são preservados; o que exceder o novo plano fica somente leitura e exportável.</li>
          <li>Pix: pagamento antecipado do período escolhido, com renovação manual. Não há débito automático por Pix.</li>
        </ul>
      </section>

      {(periods ?? []).length ? (
        <section className="card" aria-labelledby="hist"><div className="card-header"><h2 id="hist">Histórico de acesso</h2></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>Plano</th><th>Origem</th><th>Início</th><th>Fim</th><th>Situação</th></tr></thead>
            <tbody>{(periods ?? []).map((p, i) => <tr key={i}><td>{PLANS.find((x) => x.code === p.plan_code)?.name}</td><td>{p.source === "pix_prepaid" ? "Pix pré-pago" : p.source === "stripe_subscription" ? "Cartão" : "Concessão"}</td><td>{fmtDate(p.starts_at.slice(0, 10))}</td><td>{fmtDate(p.ends_at.slice(0, 10))}</td><td>{p.revoked_at ? `Revogado (${p.revoke_reason === "dispute" ? "contestação" : "estorno"})` : "Válido"}</td></tr>)}</tbody>
          </table></div>
        </section>
      ) : null}
    </>
  );
}
