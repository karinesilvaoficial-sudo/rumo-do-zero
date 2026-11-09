"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, Field, MoneyField, Select } from "@/components/app/action-form";
import { Icon } from "@/components/icons";
import { Alert, Sheet } from "@/components/ui";
import { createAccount, createCategory, createTransaction, editTransaction, reverseTransaction } from "../actions";

type Cat = { id: string; name: string; kind: "income" | "expense" };
type Acc = { id: string; name: string };

export function EntryToolbar({ canWrite, canAdmin, openNew, openAccount, accounts, categories, today }: { canWrite: boolean; canAdmin: boolean; openNew: boolean; openAccount: boolean; accounts: Acc[]; categories: Cat[]; today: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "new" | "account" | "category">(openNew && canWrite ? (accounts.length ? "new" : canAdmin ? "account" : null) : openAccount && canAdmin ? "account" : null);
  const [kind, setKind] = useState<"income" | "expense" | "transfer">("expense");
  const close = () => { setMode(null); router.replace("/app/lancamentos", { scroll: false }); };
  return (
    <div className="row">
      {canWrite ? <button className="btn btn-primary" onClick={() => setMode(accounts.length ? "new" : "account")} disabled={!accounts.length && !canAdmin}><Icon.plus width={18} height={18} />Novo lançamento</button> : <p className="small muted">Seu papel neste espaço é de leitura.</p>}
      {canAdmin ? <button className="btn btn-secondary" onClick={() => setMode("account")}>Nova conta</button> : null}
      {canWrite ? <button className="btn btn-ghost" onClick={() => setMode("category")}>Nova categoria</button> : null}

      <Sheet open={mode === "new"} onClose={close} title="Novo lançamento">
        <div className="segmented" role="group" aria-label="Tipo de lançamento" style={{ marginBottom: 16 }}>
          {([["expense", "Despesa"], ["income", "Receita"], ["transfer", "Transferência"]] as const).map(([k, l]) => (
            <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div>
        <ActionForm action={createTransaction} submit="Registrar" success="Lançamento registrado. Indicadores atualizados." onDone={() => setTimeout(close, 700)}>
          <input type="hidden" name="kind" value={kind} />
          <div className="form-grid">
            <MoneyField label="Valor (R$)" name="amount" required />
            <Field label={kind === "transfer" ? "Data" : "Data do pagamento/recebimento"} name="date" type="date" required defaultValue={today} />
          </div>
          {kind !== "transfer" ? <Field label="Descrição" name="description" required maxLength={200} placeholder={kind === "income" ? "Ex.: Salário, venda, serviço" : "Ex.: Mercado, aluguel"} /> : <Field label="Descrição (opcional)" name="description" maxLength={200} />}
          <div className="form-grid">
            <Select label={kind === "transfer" ? "De (conta)" : "Conta"} name="account_id" required options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
            {kind === "transfer"
              ? <Select label="Para (conta)" name="to_account_id" required options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
              : <Select label="Categoria" name="category_id" options={categories.filter((c) => c.kind === kind).map((c) => ({ value: c.id, label: c.name }))} />}
          </div>
          {kind !== "transfer" ? (
            <details><summary className="small" style={{ cursor: "pointer" }}>Mais opções</summary>
              <div className="stack" style={{ marginTop: 12 }}>
                <Field label="Competência (mês a que se refere)" name="competence_date" type="date" hint="Se vazio, igual à data." />
                <div className="field"><label htmlFor="f-notes">Anotações</label><textarea id="f-notes" name="notes" className="textarea" maxLength={2000} /></div>
              </div>
            </details>
          ) : <p className="small muted">Transferência entre contas próprias não é receita nem despesa.</p>}
        </ActionForm>
      </Sheet>

      <Sheet open={mode === "account"} onClose={close} title="Nova conta">
        <ActionForm action={createAccount} submit="Cadastrar conta" success="Conta cadastrada." onDone={() => setTimeout(close, 600)}>
          <Field label="Nome" name="name" required maxLength={60} placeholder="Ex.: Conta corrente, Carteira" />
          <Select label="Tipo" name="kind" required options={[{ value: "checking", label: "Conta corrente" }, { value: "savings", label: "Poupança" }, { value: "cash", label: "Dinheiro" }, { value: "investment", label: "Investimento" }, { value: "other", label: "Outra" }]} />
          <div className="form-grid">
            <MoneyField label="Saldo inicial (R$)" name="opening" hint="Pode ser negativo. Não conta como receita." />
            <Field label="Data do saldo" name="opening_date" type="date" required defaultValue={today} />
          </div>
        </ActionForm>
      </Sheet>

      <Sheet open={mode === "category"} onClose={close} title="Nova categoria">
        <ActionForm action={createCategory} submit="Criar" success="Categoria criada." onDone={() => setTimeout(close, 600)}>
          <Field label="Nome" name="name" required maxLength={40} />
          <Select label="Tipo" name="kind" required options={[{ value: "expense", label: "Despesa" }, { value: "income", label: "Receita" }]} />
        </ActionForm>
      </Sheet>
    </div>
  );
}

type Tx = { id: string; kind: string; version: number; description: string; category_id: string | null; amount_cents: string; date: string; competence_date: string; notes: string | null };

export function RowActions({ tx, categories }: { tx: Tx; categories: Cat[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "edit" | "reverse">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editable = tx.kind === "income" || tx.kind === "expense";
  const brl = (c: string) => (BigInt(c) / 100n).toString() + "," + (BigInt(c) % 100n).toString().padStart(2, "0");
  return (
    <span className="row" style={{ gap: 4, justifyContent: "flex-end", flexWrap: "nowrap" }}>
      {editable ? <button className="btn btn-ghost btn-sm" onClick={() => setMode("edit")} aria-label={`Editar ${tx.description}`}>Editar</button> : null}
      <button className="btn btn-ghost btn-sm" onClick={() => setMode("reverse")} aria-label={`Estornar ${tx.description}`}>Estornar</button>
      <Sheet open={mode === "edit"} onClose={() => setMode(null)} title="Editar lançamento">
        <ActionForm action={editTransaction} submit="Salvar alterações" success="Alterações salvas." resetOnSuccess={false} onDone={() => setTimeout(() => setMode(null), 600)}>
          <input type="hidden" name="id" value={tx.id} />
          <input type="hidden" name="version" value={tx.version} />
          <Field label="Descrição" name="description" defaultValue={tx.description} maxLength={200} />
          <div className="form-grid">
            <MoneyField label="Valor (R$)" name="amount" defaultValue={brl(tx.amount_cents)} />
            <Field label="Data" name="date" type="date" defaultValue={tx.date} />
          </div>
          <Select label="Categoria" name="category_id" defaultValue={tx.category_id ?? ""} options={categories.filter((c) => c.kind === tx.kind).map((c) => ({ value: c.id, label: c.name }))} />
          <p className="small muted">Se outra pessoa alterar este registro antes, avisaremos para evitar sobrescrever.</p>
        </ActionForm>
      </Sheet>
      <Sheet open={mode === "reverse"} onClose={() => setMode(null)} title="Estornar lançamento">
        <div className="stack">
          <p>Estornar <strong>{tx.description}</strong>? Um registro espelho será criado, o original fica marcado como estornado e os saldos são recalculados.</p>
          {err ? <Alert tone="error">{err}</Alert> : null}
          <div className="row">
            <button className="btn btn-danger" disabled={busy} aria-busy={busy} onClick={async () => {
              setBusy(true); setErr(null);
              const r = await reverseTransaction(tx.id, tx.version, "estorno pelo usuário");
              setBusy(false);
              if (!r.ok) { setErr(r.error); return; }
              setMode(null); router.refresh();
            }}>{busy ? "Estornando…" : "Confirmar estorno"}</button>
            <button className="btn btn-ghost" onClick={() => setMode(null)}>Cancelar</button>
          </div>
        </div>
      </Sheet>
    </span>
  );
}
