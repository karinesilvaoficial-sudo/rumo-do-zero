"use client";
import { formatBRL } from "@rumo/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, Field, MoneyField, Select } from "@/components/app/action-form";
import { Alert, Sheet } from "@/components/ui";
import { cancelCommitment, createCommitment, editRuleFrom, settleCommitment, upsertBudget } from "../actions";

type Cat = { id: string; name: string; kind: "income" | "expense" };

export function NewCommitment({ categories, today }: { categories: Cat[]; today: string }) {
  const [o, setO] = useState(false);
  const [dir, setDir] = useState<"payable" | "receivable">("payable");
  return (
    <>
      <button className="btn btn-primary" onClick={() => setO(true)}>Novo compromisso</button>
      <Sheet open={o} onClose={() => setO(false)} title="Novo compromisso">
        <div className="segmented" role="group" aria-label="Tipo" style={{ marginBottom: 12 }}>
          <button type="button" aria-pressed={dir === "payable"} onClick={() => setDir("payable")}>A pagar</button>
          <button type="button" aria-pressed={dir === "receivable"} onClick={() => setDir("receivable")}>A receber</button>
        </div>
        <ActionForm action={createCommitment} submit="Salvar" success="Compromisso criado." onDone={() => setTimeout(() => setO(false), 600)}>
          <input type="hidden" name="direction" value={dir} />
          <Field label="Descrição" name="description" required maxLength={200} />
          <div className="form-grid">
            <MoneyField label="Valor (R$)" name="amount" required />
            <Field label="Vencimento" name="due_date" type="date" required defaultValue={today} />
          </div>
          <Select label="Categoria" name="category_id" options={categories.filter((c) => c.kind === (dir === "payable" ? "expense" : "income")).map((c) => ({ value: c.id, label: c.name }))} />
          <div className="form-grid">
            <Select label="Repetir" name="recurring" required defaultValue="none" options={[{ value: "none", label: "Não repetir" }, { value: "monthly", label: "Mensal" }, { value: "weekly", label: "Semanal" }, { value: "yearly", label: "Anual" }]} />
            <Field label="Até (opcional)" name="end_date" type="date" />
          </div>
        </ActionForm>
      </Sheet>
    </>
  );
}

type Up = { id: string; direction: "payable" | "receivable"; description: string; due_date: string; amount_cents: string; pending_cents: string; overdue: boolean; version: number; source: string };

export function CommitmentRow({ c, accounts, today, canWrite }: { c: Up; accounts: { id: string; name: string }[]; today: string; canWrite: boolean }) {
  const router = useRouter();
  const [o, setO] = useState<null | "pay" | "cancel">(null);
  const [err, setErr] = useState<string | null>(null);
  const partial = c.pending_cents !== c.amount_cents;
  const brl = (s: string) => formatBRL(s).replace("R$ ", "");
  return (
    <li className="row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--rumo-border)", paddingBottom: 8 }}>
      <span><strong>{c.description}</strong> <span className={`badge ${c.direction === "payable" ? "" : "badge-pos"}`}>{c.direction === "payable" ? "a pagar" : "a receber"}</span>{partial ? <span className="badge badge-warn">parcial</span> : null}</span>
      <span className="row">
        <span className="money">{formatBRL(c.pending_cents)}</span>
        {canWrite && c.source === "commitment" ? <>
          <button className="btn btn-secondary btn-sm" onClick={() => setO("pay")}>{c.direction === "payable" ? "Pagar" : "Receber"}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setO("cancel")}>Cancelar</button>
        </> : c.source === "card_invoice" ? <a className="btn btn-ghost btn-sm" href="/app/dividas">Ver fatura</a> : null}
      </span>
      <Sheet open={o === "pay"} onClose={() => setO(null)} title={`${c.direction === "payable" ? "Pagamento" : "Recebimento"} · ${c.description}`}>
        <ActionForm action={settleCommitment} submit="Registrar" success="Registrado." onDone={() => setTimeout(() => { setO(null); router.refresh(); }, 600)}>
          <input type="hidden" name="commitment_id" value={c.id} />
          <p className="small muted">Pendente: {formatBRL(c.pending_cents)}. Valor menor registra pagamento parcial; o restante continua pendente.</p>
          <div className="form-grid">
            <MoneyField label="Valor (R$)" name="amount" required defaultValue={brl(c.pending_cents)} />
            <Field label="Data" name="date" type="date" required defaultValue={today} />
          </div>
          <Select label="Conta" name="account_id" required options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
        </ActionForm>
      </Sheet>
      <Sheet open={o === "cancel"} onClose={() => setO(null)} title="Cancelar compromisso">
        <p>O saldo pendente de <strong>{c.description}</strong> será cancelado. Pagamentos já registrados permanecem.</p>
        {err ? <Alert tone="error">{err}</Alert> : null}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-danger" onClick={async () => { const r = await cancelCommitment(c.id, c.version); if (!r.ok) setErr(r.error); else { setO(null); router.refresh(); } }}>Cancelar pendente</button>
        </div>
      </Sheet>
    </li>
  );
}

export function RuleEdit({ rule, today }: { rule: { id: string; version: number; description: string }; today: string }) {
  const [o, setO] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setO(true)}>Editar próximas</button>
      <Sheet open={o} onClose={() => setO(false)} title={`Editar próximas · ${rule.description}`}>
        <ActionForm action={editRuleFrom} submit="Aplicar" success="Regra e próximas ocorrências atualizadas." onDone={() => setTimeout(() => setO(false), 700)}>
          <input type="hidden" name="rule_id" value={rule.id} />
          <input type="hidden" name="version" value={rule.version} />
          <Field label="A partir de" name="from" type="date" required defaultValue={today} />
          <MoneyField label="Novo valor (R$)" name="amount" />
          <Field label="Nova descrição" name="description" maxLength={200} />
          <p className="small muted">Ocorrências já pagas ou editadas individualmente não mudam.</p>
        </ActionForm>
      </Sheet>
    </>
  );
}

export function BudgetForm({ categories, month }: { categories: Cat[]; month: string }) {
  return (
    <details style={{ marginTop: 12 }}><summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Definir orçamento de categoria</summary>
      <ActionForm action={upsertBudget} submit="Salvar orçamento" success="Orçamento salvo." className="form-grid">
        <input type="hidden" name="month" value={month} />
        <Select label="Categoria" name="category_id" required options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <MoneyField label="Valor mensal (R$)" name="amount" required />
      </ActionForm>
    </details>
  );
}

export function ScenarioForm({ values }: { values: Record<string, { income_factor: string; expense_factor: string }> }) {
  const names: Record<string, [string, string]> = { conservative: ["Conservador", "c"], central: ["Central", "m"], optimistic: ["Otimista", "o"] };
  return (
    <details style={{ marginTop: 12 }}><summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Editar hipóteses dos cenários</summary>
      <form className="form-grid" style={{ marginTop: 12 }}>
        {Object.entries(values).map(([k, v]) => (
          <fieldset key={k} className="stack" style={{ border: "1px solid var(--rumo-border)", borderRadius: 12, padding: 12 }}>
            <legend className="small" style={{ fontWeight: 700 }}>{names[k]?.[0]}</legend>
            <Field label="Fator de entradas" name={`${names[k]?.[1]}_r`} defaultValue={v.income_factor} inputMode="decimal" pattern="\d(\.\d{1,4})?" hint="1.00 = igual à média" />
            <Field label="Fator de saídas" name={`${names[k]?.[1]}_d`} defaultValue={v.expense_factor} inputMode="decimal" pattern="\d(\.\d{1,4})?" />
          </fieldset>
        ))}
        <div><button className="btn btn-secondary btn-sm">Recalcular</button></div>
      </form>
    </details>
  );
}
