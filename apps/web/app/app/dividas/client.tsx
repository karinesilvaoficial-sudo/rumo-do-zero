"use client";
import { formatBRL, parseBRLInput } from "@rumo/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, Field, MoneyField, Select } from "@/components/app/action-form";
import { Sheet } from "@/components/ui";
import { cardPurchase, createCard, createDebt, invoiceCharge, payDebt, payInvoice } from "../actions";

type Opt = { id: string; name: string };

export function CardForms({ canAdmin, canWrite, cards, accounts, categories, today }: { canAdmin: boolean; canWrite: boolean; cards: Opt[]; accounts: Opt[]; categories: Opt[]; today: string }) {
  const [o, setO] = useState<null | "card" | "purchase">(null);
  const [total, setTotal] = useState("");
  const [n, setN] = useState(1);
  const cents = parseBRLInput(total);
  const preview = cents && cents >= BigInt(n) ? Array.from({ length: n }, (_, i) => (i < n - 1 ? cents / BigInt(n) : cents - (cents / BigInt(n)) * BigInt(n - 1))) : null;
  return (
    <>
      {canWrite && cards.length ? <button className="btn btn-primary" onClick={() => setO("purchase")}>Compra no cartão</button> : null}
      {canAdmin ? <button className="btn btn-secondary" onClick={() => setO("card")}>Novo cartão</button> : null}
      <Sheet open={o === "card"} onClose={() => setO(null)} title="Novo cartão">
        <ActionForm action={createCard} submit="Cadastrar" success="Cartão cadastrado." onDone={() => setTimeout(() => setO(null), 600)}>
          <Field label="Nome" name="name" required maxLength={60} placeholder="Ex.: Cartão Azul" />
          <div className="form-grid">
            <Field label="Dia do fechamento" name="closing_day" type="number" min={1} max={28} required />
            <Field label="Dia do vencimento" name="due_day" type="number" min={1} max={28} required />
          </div>
          <MoneyField label="Limite (opcional)" name="limit" />
          <Select label="Conta de pagamento" name="payment_account_id" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
        </ActionForm>
      </Sheet>
      <Sheet open={o === "purchase"} onClose={() => setO(null)} title="Compra no cartão">
        <ActionForm action={cardPurchase} submit="Registrar compra" success="Compra registrada nas faturas." onDone={() => setTimeout(() => setO(null), 700)}>
          <Select label="Cartão" name="card_id" required options={cards.map((c) => ({ value: c.id, label: c.name }))} />
          <Field label="Descrição" name="description" required maxLength={200} />
          <div className="form-grid">
            <Field label="Valor total (R$)" name="total" required inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
            <Field label="Parcelas" name="installments" type="number" min={1} max={48} required value={n} onChange={(e) => setN(Math.max(1, Math.min(48, Number(e.target.value) || 1)))} />
            <Field label="Data da compra" name="date" type="date" required defaultValue={today} />
          </div>
          <Select label="Categoria" name="category_id" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          {preview ? <p className="small muted" aria-live="polite">Parcelas: {n > 1 ? `${n - 1}× ${formatBRL(preview[0]!)} + 1× ${formatBRL(preview[n - 1]!)}` : formatBRL(preview[0]!)} = {formatBRL(cents!)} (resíduo na última).</p> : null}
        </ActionForm>
      </Sheet>
    </>
  );
}

export function InvoiceActions({ invoiceId, pending, accounts, defaultAccount, today }: { invoiceId: string; pending: string; accounts: Opt[]; defaultAccount: string | null; today: string }) {
  const router = useRouter();
  const [o, setO] = useState<null | "pay" | "charge">(null);
  return (
    <span className="row" style={{ gap: 4, flexWrap: "nowrap", justifyContent: "flex-end" }}>
      <button className="btn btn-secondary btn-sm" onClick={() => setO("pay")}>Pagar</button>
      <button className="btn btn-ghost btn-sm" onClick={() => setO("charge")}>Encargo</button>
      <Sheet open={o === "pay"} onClose={() => setO(null)} title="Pagamento de fatura">
        <ActionForm action={payInvoice} submit="Registrar pagamento" success="Pagamento registrado." onDone={() => setTimeout(() => { setO(null); router.refresh(); }, 600)}>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <p className="small muted">Pendente: {formatBRL(pending)}. Pagamento parcial mantém o restante em aberto. Não gera nova despesa (a despesa é a compra).</p>
          <div className="form-grid">
            <MoneyField label="Valor (R$)" name="amount" required defaultValue={formatBRL(pending).replace("R$ ", "")} />
            <Field label="Data" name="date" type="date" required defaultValue={today} />
          </div>
          <Select label="Conta" name="account_id" required defaultValue={defaultAccount ?? undefined} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
        </ActionForm>
      </Sheet>
      <Sheet open={o === "charge"} onClose={() => setO(null)} title="Encargo informado">
        <ActionForm action={invoiceCharge} submit="Registrar encargo" success="Encargo registrado." onDone={() => setTimeout(() => { setO(null); router.refresh(); }, 600)}>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <p className="small muted">Juros, multa, IOF ou anuidade que constam na fatura. Entram como despesa em “Juros e encargos”.</p>
          <MoneyField label="Valor (R$)" name="amount" required />
          <Field label="Descrição" name="description" maxLength={200} placeholder="Ex.: Juros do rotativo" />
        </ActionForm>
      </Sheet>
    </span>
  );
}

export function DebtForms({ debts, accounts, today }: { debts: Opt[]; accounts: Opt[]; today: string }) {
  const [o, setO] = useState<null | "new" | "pay">(null);
  return (
    <span className="row">
      <button className="btn btn-secondary" onClick={() => setO("new")}>Nova dívida</button>
      {debts.length ? <button className="btn btn-ghost" onClick={() => setO("pay")}>Registrar pagamento</button> : null}
      <Sheet open={o === "new"} onClose={() => setO(null)} title="Nova dívida">
        <ActionForm action={createDebt} submit="Cadastrar" success="Dívida cadastrada." onDone={() => setTimeout(() => setO(null), 600)}>
          <Field label="Nome" name="name" required maxLength={80} placeholder="Ex.: Empréstimo pessoal" />
          <Field label="Credor" name="creditor" maxLength={80} />
          <div className="form-grid">
            <MoneyField label="Saldo devedor (R$)" name="outstanding" required />
            <Field label="Taxa de juros (% ao mês)" name="monthly_rate" inputMode="decimal" placeholder="Ex.: 2,99" hint="Deixe em branco se não souber — não assumimos zero." />
          </div>
          <div className="form-grid">
            <MoneyField label="Parcela (R$)" name="installment" />
            <Field label="Parcelas restantes" name="remaining" type="number" min={0} />
            <Field label="Dia do vencimento" name="due_day" type="number" min={1} max={28} />
          </div>
        </ActionForm>
      </Sheet>
      <Sheet open={o === "pay"} onClose={() => setO(null)} title="Pagamento de dívida">
        <ActionForm action={payDebt} submit="Registrar" success="Pagamento registrado." onDone={() => setTimeout(() => setO(null), 600)}>
          <Select label="Dívida" name="debt_id" required options={debts.map((d) => ({ value: d.id, label: d.name }))} />
          <div className="form-grid">
            <MoneyField label="Amortização do principal (R$)" name="principal" required hint="Reduz o saldo devedor; não é despesa." />
            <MoneyField label="Juros e encargos (R$)" name="interest" hint="Entram como despesa." />
          </div>
          <div className="form-grid">
            <Field label="Data" name="date" type="date" required defaultValue={today} />
            <Select label="Conta" name="account_id" required options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </div>
        </ActionForm>
      </Sheet>
    </span>
  );
}

export function PayoffForm({ defaultBudget, strategy }: { defaultBudget?: string; strategy: "avalanche" | "snowball" }) {
  const router = useRouter();
  const [budget, setBudget] = useState(defaultBudget ? formatBRL(defaultBudget).replace("R$ ", "") : "");
  const [s, setS] = useState(strategy);
  return (
    <form className="row" style={{ alignItems: "flex-end", marginTop: 8 }} onSubmit={(e) => {
      e.preventDefault();
      const c = parseBRLInput(budget);
      if (c && c > 0n) router.push(`?orcamento=${c}&estrategia=${s}`);
    }}>
      <Field label="Quanto você pode pagar por mês (R$)" name="budget" value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" required />
      <div className="segmented" role="group" aria-label="Estratégia">
        <button type="button" aria-pressed={s === "avalanche"} onClick={() => setS("avalanche")}>Avalanche</button>
        <button type="button" aria-pressed={s === "snowball"} onClick={() => setS("snowball")}>Bola de neve</button>
      </div>
      <button className="btn btn-primary btn-sm">Simular</button>
    </form>
  );
}
