"use client";
import { ActionForm, Field } from "@/components/app/action-form";
import { setCostCap } from "../configuracoes/actions";

export function CostCapForm({ current }: { current: number | null }) {
  return (
    <ActionForm action={setCostCap} submit="Salvar teto" success="Teto atualizado." resetOnSuccess={false} className="form-grid">
      <Field label="Teto mensal (USD) para IA + voz" name="cap" inputMode="decimal" defaultValue={current === null ? "" : String(current)} hint="Vazio = sem teto (rotas de custo desligadas em produção)" />
    </ActionForm>
  );
}
