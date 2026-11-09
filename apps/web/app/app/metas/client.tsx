"use client";
import { useState } from "react";
import { ActionForm, Field, MoneyField } from "@/components/app/action-form";
import { Sheet } from "@/components/ui";
import { contributeGoal, createGoal } from "../actions";

export function NewGoal({ open }: { open: boolean }) {
  const [o, setO] = useState(open);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setO(true)}>Nova meta</button>
      <Sheet open={o} onClose={() => setO(false)} title="Nova meta">
        <ActionForm action={createGoal} submit="Criar meta" success="Meta criada." onDone={() => setTimeout(() => setO(false), 600)}>
          <Field label="Nome" name="name" required maxLength={80} placeholder="Ex.: Reserva de emergência" />
          <div className="form-grid">
            <MoneyField label="Valor-alvo (R$)" name="target" required />
            <Field label="Prazo (opcional)" name="target_date" type="date" />
          </div>
        </ActionForm>
      </Sheet>
    </>
  );
}

export function GoalActions({ goalId, name, today }: { goalId: string; name: string; today: string }) {
  const [o, setO] = useState(false);
  return (
    <>
      <div className="row"><button className="btn btn-secondary btn-sm" onClick={() => setO(true)}>Registrar contribuição</button></div>
      <Sheet open={o} onClose={() => setO(false)} title={`Contribuição · ${name}`}>
        <ActionForm action={contributeGoal} submit="Registrar" success="Contribuição registrada." onDone={() => setTimeout(() => setO(false), 600)}>
          <input type="hidden" name="goal_id" value={goalId} />
          <div className="segmented" role="radiogroup" aria-label="Tipo">
            <label className="btn btn-ghost btn-sm"><input type="radio" name="direction" value="in" defaultChecked /> Guardar</label>
            <label className="btn btn-ghost btn-sm"><input type="radio" name="direction" value="out" /> Retirar</label>
          </div>
          <div className="form-grid">
            <MoneyField label="Valor (R$)" name="amount" required />
            <Field label="Data" name="date" type="date" required defaultValue={today} />
          </div>
          <Field label="Observação" name="note" maxLength={200} />
        </ActionForm>
      </Sheet>
    </>
  );
}
