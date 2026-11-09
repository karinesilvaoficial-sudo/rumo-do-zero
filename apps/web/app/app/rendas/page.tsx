import { formatBRL } from "@rumo/contracts";
import { redirect } from "next/navigation";
import { ExplainScreen } from "@/components/app/explain-screen";
import { Money } from "@/components/money";
import { EmptyState, NotConfigured } from "@/components/states";
import { analytics } from "@/lib/analytics";
import * as data from "@/lib/data";
import { integrationStatus } from "@/lib/env";
import { fmtDate, todayIn } from "@/lib/period";
import { supabaseServer } from "@/lib/supabase/server";
import { canWrite, getCtx } from "@/lib/workspace";
import { ContactForm, GeneratePaths, LinkRevenue, PathStatus, ProfileForm, ProposalForm, TaskToggle } from "./client";

export const metadata = { title: "Novas rendas" };
const TYPE: Record<string, string> = { services: "Prestação de serviços", freelance: "Trabalho autônomo", products: "Venda de produtos", digital_services: "Serviços digitais", assets: "Aproveitamento de ativos", business_sales: "Vendas do negócio" };
const STAGE: Record<string, string> = { lead: "Contato", contacted: "Abordado", proposal: "Proposta", won: "Fechado", lost: "Perdido" };
type Biz = { contribution_margin_cents: string | null; contribution_margin_ratio: string | null; operating_result_cents: string | null; breakeven_revenue_cents: string | null; missing: Record<string, string[]>; disclaimer: string };

export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const ws = ctx.active;
  const today = todayIn(ws.timezone);
  const sb = await supabaseServer();
  const [{ data: profile }, { data: paths }, { data: tasks }, { data: contacts }, { data: proposals }, { data: docs }, accs, cats] = await Promise.all([
    sb.from("income_profiles").select("*").eq("workspace_id", ws.id).maybeSingle(),
    sb.from("income_paths").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    sb.from("tasks").select("id,title,status,due_date,path_id,position").eq("workspace_id", ws.id).order("position"),
    sb.from("contacts").select("id,name,email,phone,stage,notes").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100),
    sb.from("proposals").select("id,title,amount_cents,status,contact_id,revenue_transaction_id,path_id,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(100),
    sb.from("documents").select("id,kind,title,body_md,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(50),
    data.accountsList(ws.id), data.categories(ws.id),
  ]);
  const st = integrationStatus();
  const w = canWrite(ws.role);

  // receita recebida e custos associados (vínculos explícitos com o financeiro)
  const linked = (proposals ?? []).filter((p) => p.revenue_transaction_id).map((p) => p.revenue_transaction_id as string);
  const { data: revenue } = linked.length ? await sb.from("transactions").select("id,amount_cents,reversed_at").in("id", linked) : { data: [] };
  const received = (revenue ?? []).filter((r) => !r.reversed_at).reduce((a, r) => a + BigInt(r.amount_cents), 0n);
  const contactName = new Map((contacts ?? []).map((c) => [c.id, c.name]));

  // métricas do negócio: só calculáveis com os dados necessários (nada inventado)
  let biz: Biz | null = null;
  const b = (profile?.business ?? {}) as { ticket_cents?: string | null; unit_cost_cents?: string | null };
  if (ws.kind === "business" && st.analytics) {
    const month = `${today.slice(0, 7)}-01`;
    const s = await data.summary(ws.id, month, today);
    try { biz = await analytics<Biz>("/v1/business/metrics", { userId: ctx.user.id, workspaceId: ws.id }, { revenue_cents: s.income_cents, variable_costs_cents: null, fixed_costs_cents: null, unit_price_cents: b.ticket_cents ?? null, unit_cost_cents: b.unit_cost_cents ?? null }); } catch { biz = null; }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Novas rendas</h1><p>Do diagnóstico ao plano de execução: caminhos compatíveis com o seu perfil, tarefas, materiais e resultados. Ideias e estimativas — não promessas.</p></div>
        <ExplainScreen screen="income" workspaceId={ws.id} />
      </div>

      <section className="card" aria-labelledby="diag">
        <div className="card-header"><h2 id="diag">1 · Diagnóstico</h2>{profile ? <span className="badge badge-pos">✓ Preenchido</span> : <span className="badge badge-warn">Pendente</span>}</div>
        <ProfileForm profile={profile} isBusiness={ws.kind === "business"} disabled={!w} />
      </section>

      <section className="card" aria-labelledby="cam">
        <div className="card-header"><h2 id="cam">2 · Caminhos sugeridos</h2></div>
        {!st.ai ? <NotConfigured what="A IA (Anthropic)" /> : w ? <GeneratePaths workspaceId={ws.id} ready={Boolean(profile?.skills?.length && profile?.weekly_hours !== null)} /> : null}
        {(paths ?? []).length === 0 ? <p className="muted" style={{ marginTop: 12 }}>Nenhum caminho salvo ainda.</p> : (
          <div className="stack" style={{ marginTop: 16 }}>
            {(paths ?? []).map((p) => {
              const ts = (tasks ?? []).filter((t) => t.path_id === p.id);
              const done = ts.filter((t) => t.status === "done").length;
              return (
                <article key={p.id} className="card" style={{ background: "#fafbff" }}>
                  <div className="card-header" style={{ flexWrap: "wrap" }}>
                    <h3>{p.title} <span className="badge">{TYPE[p.path_type]}</span></h3>
                    {w ? <PathStatus id={p.id} status={p.status} /> : <span className="badge badge-muted">{p.status}</span>}
                  </div>
                  <div className="grid grid-2" style={{ gap: 12 }}>
                    <p className="small"><strong>Por que combina:</strong> {p.rationale}</p>
                    <p className="small"><strong>Oferta inicial:</strong> {p.offer}<br /><strong>Cliente:</strong> {p.target_customer}</p>
                    <p className="small"><strong>Recursos:</strong> {p.resources}<br /><strong>Investimento estimado:</strong> {p.investment_min_cents || p.investment_max_cents ? `${p.investment_min_cents ? formatBRL(String(p.investment_min_cents)) : "?"} a ${p.investment_max_cents ? formatBRL(String(p.investment_max_cents)) : "?"}` : "não estimado"} <span className="muted">— premissas: {p.assumptions}</span></p>
                    <p className="small"><strong>Tempo:</strong> {p.time_needed}<br /><strong>Limitações:</strong> {p.limitations}</p>
                    <p className="small"><strong>Primeiro teste de validação:</strong> {p.validation_experiment}</p>
                    <p className="small"><strong>Decidir continuar/ajustar/abandonar:</strong> {p.decision_metric}</p>
                  </div>
                  <div className="grid grid-2" style={{ marginTop: 12 }}>
                    <div><h4 className="small">Plano de 7 dias · {done}/{ts.length} concluídas</h4>
                      <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }} className="stack">{ts.map((t) => <li key={t.id}><TaskToggle id={t.id} title={t.title} status={t.status} disabled={!w} /></li>)}</ul>
                    </div>
                    <div><h4 className="small">Sequência de 30 dias</h4><ol className="small" style={{ paddingLeft: 18, margin: "6px 0 0" }}>{(p.plan_30d as string[]).map((x, i) => <li key={i}>{x}</li>)}</ol></div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="com">
        <div className="card-header"><h2 id="com">3 · Comercial</h2><span className="small">Recebido de propostas vinculadas: <Money cents={received} /></span></div>
        <div className="grid grid-2">
          <div className="stack">
            <h3 className="small">Contatos ({(contacts ?? []).length})</h3>
            {w ? <ContactForm /> : null}
            {(contacts ?? []).length === 0 ? <p className="small muted">Cadastre manualmente as pessoas com quem você está conversando.</p> : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">{(contacts ?? []).slice(0, 20).map((c) => <li key={c.id} className="row" style={{ justifyContent: "space-between" }}><span>{c.name}{c.email ? <span className="muted small"> · {c.email}</span> : null}</span><span className="badge badge-muted">{STAGE[c.stage]}</span></li>)}</ul>
            )}
          </div>
          <div className="stack">
            <h3 className="small">Propostas e negócios</h3>
            {w ? <ProposalForm contacts={(contacts ?? []).map((c) => ({ id: c.id, name: c.name }))} paths={(paths ?? []).map((p) => ({ id: p.id, name: p.title }))} documents={(docs ?? []).map((d) => ({ id: d.id, name: d.title }))} /> : null}
            {(proposals ?? []).length === 0 ? <p className="small muted">Nenhuma proposta.</p> : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">{(proposals ?? []).map((p) => (
                <li key={p.id} className="row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--rumo-border)", paddingBottom: 8 }}>
                  <span>{p.title}{p.contact_id ? <span className="small muted"> · {contactName.get(p.contact_id)}</span> : null}<br /><span className="small muted">{p.amount_cents ? formatBRL(String(p.amount_cents)) : "valor a definir"} · {fmtDate(p.created_at.slice(0, 10))}</span></span>
                  {p.revenue_transaction_id ? <span className="badge badge-pos">✓ Receita vinculada</span> : w ? <LinkRevenue proposalId={p.id} amount={p.amount_cents ? String(p.amount_cents) : null} accounts={accs} categories={cats.filter((c) => c.kind === "income")} today={today} /> : null}
                </li>
              ))}</ul>
            )}
            <p className="small muted">A venda só entra no financeiro quando você vincula — uma única vez, sem duplicar lançamento existente.</p>
          </div>
        </div>
      </section>

      {ws.kind === "business" ? (
        <section className="card" id="negocio" aria-labelledby="neg">
          <div className="card-header"><h2 id="neg">Indicadores do negócio · mês atual</h2><span className="badge badge-muted">Gerencial</span></div>
          {!biz ? <p className="muted">Cálculo indisponível no momento.</p> : (
            <div className="stack">
              <div className="grid grid-kpi">
                {[["Margem de contribuição", biz.contribution_margin_cents], ["Resultado gerencial", biz.operating_result_cents], ["Ponto de equilíbrio (receita)", biz.breakeven_revenue_cents]].map(([l, v]) => (
                  <div key={l} className="kpi" style={{ cursor: "default" }}><span className="kpi-label">{l}</span><span className="kpi-value" style={{ fontSize: "1.2rem" }}>{v ? <Money cents={v} /> : <span className="muted small">precisa de dados</span>}</span></div>
                ))}
              </div>
              {Object.keys(biz.missing).length ? <p className="small muted">Para calcular: classifique custos variáveis e fixos nos lançamentos e informe preço e custo unitário no diagnóstico. Faltando: {Object.values(biz.missing).flat().filter((v, i, a) => a.indexOf(v) === i).join(", ")}.</p> : null}
              <p className="small muted">{biz.disclaimer} Margem ≠ markup; retirada de sócio não é venda; faturamento não é lucro.</p>
            </div>
          )}
        </section>
      ) : null}

      <section className="card" aria-labelledby="docs">
        <div className="card-header"><h2 id="docs">Documentos</h2></div>
        {(docs ?? []).length === 0 ? <EmptyState title="Nenhum documento">Peça à RUMO IA uma proposta comercial, descrição de serviço, orçamento, texto de abordagem ou roteiro de divulgação e salve aqui.</EmptyState> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">{(docs ?? []).map((d) => (
            <li key={d.id}><details><summary style={{ cursor: "pointer", fontWeight: 600 }}>{d.title} <span className="badge badge-muted">{d.kind}</span> <span className="small muted">{fmtDate(d.created_at.slice(0, 10))}</span></summary>
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }} className="small">{d.body_md}</pre>
              <a className="btn btn-secondary btn-sm" href={`/api/documents/${d.id}`} download>Exportar (.md)</a>
            </details></li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
