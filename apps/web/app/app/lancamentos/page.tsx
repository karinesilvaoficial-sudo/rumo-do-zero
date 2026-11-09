import { formatBRL } from "@rumo/contracts";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExplainScreen } from "@/components/app/explain-screen";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/states";
import * as data from "@/lib/data";
import { fmtDate, resolvePeriod } from "@/lib/period";
import { getPeriod } from "@/lib/period-server";
import { supabaseServer } from "@/lib/supabase/server";
import { canAdmin, canWrite, getCtx } from "@/lib/workspace";
import { EntryToolbar, RowActions } from "./client";

export const metadata = { title: "Lançamentos" };
const PAGE = 50;
const KIND: Record<string, string> = { income: "Receita", expense: "Despesa", transfer: "Transferência", card_purchase: "Compra no cartão", card_charge: "Encargo do cartão", card_payment: "Pagamento de fatura", debt_payment: "Amortização" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const ws = ctx.active;
  const sp = await searchParams;
  const period = sp.de && sp.ate ? resolvePeriod("custom", sp.de, sp.ate, ws.timezone) : await getPeriod(sp, ws.timezone);
  const page = Math.max(0, Number.parseInt(sp.pagina ?? "0", 10) || 0);
  const sb = await supabaseServer();

  let q = sb.from("transactions")
    .select("id,kind,amount_cents,description,notes,competence_date,settled_date,category_id,account_id,to_account_id,reversal_of,reversed_at,version,source,created_at", { count: "exact" })
    .eq("workspace_id", ws.id).gte("competence_date", period.from).lte("competence_date", period.to)
    .order("competence_date", { ascending: false }).order("created_at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (sp.tipo && KIND[sp.tipo]) q = q.eq("kind", sp.tipo);
  if (sp.conta && /^[0-9a-f-]{36}$/i.test(sp.conta)) q = q.or(`account_id.eq.${sp.conta},to_account_id.eq.${sp.conta}`);
  if (sp.categoria && /^[0-9a-f-]{36}$/i.test(sp.categoria)) q = q.eq("category_id", sp.categoria);
  if (sp.q) q = q.ilike("description", `%${sp.q.replace(/[%_,()]/g, " ").slice(0, 60)}%`);

  const [{ data: rows, count, error }, cats, accs, bal] = await Promise.all([q, data.categories(ws.id), data.accountsList(ws.id), data.balances(ws.id, period.to)]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const accName = new Map(accs.map((a) => [a.id, a.name]));
  const total = count ?? 0;

  const chips: { label: string; remove: string }[] = [];
  const base = new URLSearchParams(Object.entries(sp).filter(([k]) => !["pagina", "novo", "conta"].includes(k) || k === "conta"));
  const without = (k: string | string[]) => { const u = new URLSearchParams(base); for (const x of ([] as string[]).concat(k)) u.delete(x); u.delete("pagina"); return `?${u}`; };
  chips.push({ label: `Período: ${period.label}`, remove: without(["de", "ate", "p"]) });
  if (sp.tipo && KIND[sp.tipo]) chips.push({ label: `Tipo: ${KIND[sp.tipo]}`, remove: without("tipo") });
  if (sp.conta && accName.get(sp.conta)) chips.push({ label: `Conta: ${accName.get(sp.conta)}`, remove: without("conta") });
  if (sp.categoria && catName.get(sp.categoria)) chips.push({ label: `Categoria: ${catName.get(sp.categoria)}`, remove: without("categoria") });
  if (sp.q) chips.push({ label: `Busca: “${sp.q.slice(0, 30)}”`, remove: without("q") });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lançamentos</h1>
          <p>Registros realizados de {ws.name}. Excluir é sempre estorno: o histórico fica preservado e os indicadores são recalculados.</p>
        </div>
        <ExplainScreen screen="entries" workspaceId={ws.id} period={{ from: period.from, to: period.to, label: period.label }} />
      </div>

      <EntryToolbar canWrite={canWrite(ws.role)} canAdmin={canAdmin(ws.role)} openNew={sp.novo === "1"} openAccount={sp.conta === "1"}
        accounts={accs} categories={cats} today={period.to < new Date().toISOString().slice(0, 10) ? period.to : new Date().toISOString().slice(0, 10)} />

      <section aria-label="Contas" className="grid grid-3">
        {bal.map((a) => (
          <Link key={a.account_id} href={`?conta=${a.account_id}`} className="kpi" style={{ textDecoration: "none", color: "inherit" }}>
            <span className="kpi-label">{a.name}</span>
            <span className="kpi-value" style={{ fontSize: "1.25rem" }}><Money cents={a.balance_cents} /></span>
            <span className="kpi-hint">Saldo inicial <Money cents={a.opening_cents} /> · até {fmtDate(period.to)}</span>
          </Link>
        ))}
      </section>

      <section className="card" aria-labelledby="lista">
        <div className="card-header">
          <h2 id="lista">Registros <span className="muted small">({total})</span></h2>
          <form className="row" role="search" action="">
            {Object.entries(sp).filter(([k]) => !["tipo", "q", "pagina", "novo"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <label className="sr-only" htmlFor="ft">Tipo</label>
            <select id="ft" name="tipo" className="select" defaultValue={sp.tipo ?? ""} style={{ width: "auto" }}>
              <option value="">Todos os tipos</option>
              {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label className="sr-only" htmlFor="fq">Buscar</label>
            <input id="fq" name="q" className="input" defaultValue={sp.q ?? ""} placeholder="Buscar descrição" style={{ width: 200 }} />
            <button className="btn btn-secondary btn-sm" type="submit">Filtrar</button>
          </form>
        </div>
        <div className="row" aria-label="Filtros ativos" style={{ marginBottom: 12 }}>
          {chips.map((c) => <Link key={c.label} href={c.remove} className="badge" style={{ textDecoration: "none" }} aria-label={`Remover filtro ${c.label}`}>{c.label} ✕</Link>)}
        </div>
        {error ? <div className="alert alert-error" role="alert">Não foi possível carregar os lançamentos. <Link href="">Tentar novamente</Link></div>
          : (rows ?? []).length === 0 ? (
            <EmptyState title={accs.length ? "Nenhum lançamento neste filtro" : "Cadastre uma conta para começar"} action={accs.length ? (canWrite(ws.role) ? { href: "?novo=1", label: "Novo lançamento" } : undefined) : (canAdmin(ws.role) ? { href: "?conta=1", label: "Cadastrar conta" } : undefined)}>
              {accs.length ? "Ajuste ou remova filtros, ou registre uma entrada ou despesa já realizada." : "A conta guarda o saldo inicial que você controla. Depois, registre entradas e despesas."}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Lançamentos de {period.label}</caption>
                <thead><tr><th>Data</th><th>Descrição</th><th className="hide-mobile">Categoria</th><th className="hide-mobile">Conta</th><th className="r">Valor</th><th><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {(rows ?? []).map((r) => {
                    const out = !["income"].includes(r.kind);
                    const reversed = Boolean(r.reversed_at) || Boolean(r.reversal_of);
                    return (
                      <tr key={r.id} style={reversed ? { opacity: 0.6 } : undefined}>
                        <td className="num">{fmtDate(r.competence_date)}</td>
                        <td>
                          <span style={reversed ? { textDecoration: "line-through" } : undefined}>{r.description}</span>{" "}
                          <span className={`badge ${r.kind === "income" ? "badge-pos" : r.kind === "transfer" ? "badge-muted" : ""}`}>{KIND[r.kind]}</span>
                          {r.reversed_at ? <span className="badge badge-warn">Estornado</span> : null}
                          {r.reversal_of ? <span className="badge badge-muted">Estorno</span> : null}
                        </td>
                        <td className="hide-mobile">{r.category_id ? catName.get(r.category_id) : <span className="muted">—</span>}</td>
                        <td className="hide-mobile">{r.account_id ? accName.get(r.account_id) : "Cartão"}{r.to_account_id ? ` → ${accName.get(r.to_account_id)}` : ""}</td>
                        <td className={`r money ${r.kind === "income" ? "pos" : ""}`}>{r.kind === "transfer" ? formatBRL(String(r.amount_cents)) : formatBRL(String(r.amount_cents) === "0" ? "0" : (out ? "-" : "") + String(r.amount_cents), { signed: !out })}</td>
                        <td className="r">{canWrite(ws.role) && !reversed ? <RowActions tx={{ id: r.id, kind: r.kind, version: r.version, description: r.description, category_id: r.category_id, amount_cents: String(r.amount_cents), date: r.settled_date ?? r.competence_date, competence_date: r.competence_date, notes: r.notes }} categories={cats} /> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <nav className="row" aria-label="Paginação" style={{ justifyContent: "space-between", marginTop: 12 }}>
          <span className="small muted">{total ? `${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} de ${total}` : ""}</span>
          <span className="row">
            {page > 0 ? <Link className="btn btn-secondary btn-sm" href={`?${new URLSearchParams({ ...sp, pagina: String(page - 1) })}`}>Anterior</Link> : null}
            {(page + 1) * PAGE < total ? <Link className="btn btn-secondary btn-sm" href={`?${new URLSearchParams({ ...sp, pagina: String(page + 1) })}`}>Próxima</Link> : null}
          </span>
        </nav>
      </section>
    </>
  );
}
