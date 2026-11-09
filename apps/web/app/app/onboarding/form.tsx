"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Field, MoneyField } from "@/components/app/action-form";
import { Alert, SubmitButton } from "@/components/ui";
import { completeOnboarding } from "../actions";

export function OnboardingForm({ today, hasPersonal }: { today: string; hasPersonal: boolean }) {
  const router = useRouter();
  const [state, run] = useActionState(completeOnboarding, null);
  const [kind, setKind] = useState<"personal" | "business" | "both">(hasPersonal ? "business" : "personal");
  const [step, setStep] = useState(1);
  useEffect(() => { if (state?.ok) router.replace("/app"); }, [state, router]);
  return (
    <form action={run} className="card stack" style={{ maxWidth: 640 }} aria-describedby="passo">
      <p id="passo" className="small muted">Passo {step} de 2</p>
      <input type="hidden" name="kind" value={kind} />
      {step === 1 ? (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend><h2>Para que você vai usar o RUMO?</h2></legend>
          <div className="segmented" role="group" aria-label="Tipo de espaço">
            {([["personal", "Finanças pessoais"], ["business", "Meu negócio"], ["both", "Ambos"]] as const).map(([k, l]) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
          </div>
          {kind === "both" ? <Alert tone="info">Criaremos dois espaços separados — Pessoal e Negócio. O seletor no topo mostra qual está ativo, e membros do negócio não veem o pessoal.</Alert> : null}
          {kind !== "personal" ? <Field label="Nome do negócio" name="business_name" maxLength={80} placeholder="Ex.: Ateliê da Ana" /> : null}
          <Field label="Seu principal objetivo agora (opcional)" name="goal" maxLength={200} placeholder="Ex.: sair do cheque especial, montar reserva, aumentar vendas" />
          <div className="row"><button type="button" className="btn btn-primary" onClick={() => setStep(2)}>Continuar</button></div>
        </fieldset>
      ) : (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend><h2>Primeira conta (opcional)</h2></legend>
          <p className="muted small">Informe uma conta que você controla e o saldo de hoje. O saldo inicial não é contado como receita. Rendas, gastos e vencimentos você registra em seguida.</p>
          <Field label="Nome da conta" name="account_name" maxLength={60} placeholder="Ex.: Conta corrente" />
          <div className="form-grid">
            <MoneyField label="Saldo atual (R$)" name="opening" hint="Deixe em branco se não souber." />
            <Field label="Data do saldo" name="opening_date" type="date" defaultValue={today} />
          </div>
          {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Voltar</button>
            <SubmitButton pendingLabel="Criando…">Concluir</SubmitButton>
          </div>
        </fieldset>
      )}
    </form>
  );
}
