"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionForm, Field, Select } from "@/components/app/action-form";
import { Alert } from "@/components/ui";
import { changeRole, invite, removeMember, revokeInvite } from "./actions";

export function InviteForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  return (
    <ActionForm action={invite} submit="Enviar convite" success="Convite criado. O e-mail entra na fila de envio; a entrega é confirmada pelo provedor." className="form-grid">
      <Field label="E-mail" name="email" type="email" required maxLength={200} />
      <Select label="Papel" name="role" required defaultValue="reader" options={[...(canInviteAdmin ? [{ value: "admin", label: "Administrador" }] : []), { value: "collaborator", label: "Colaborador" }, { value: "reader", label: "Leitor" }]} />
    </ActionForm>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  const router = useRouter();
  const [p, start] = useTransition();
  return <button className="btn btn-ghost btn-sm" disabled={p} onClick={() => start(async () => { await revokeInvite(id); router.refresh(); })}>Revogar</button>;
}

export function MemberActions({ userId, role, self, isOwner }: { userId: string; role: string; self: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <span className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
      {isOwner && !self ? (
        <select className="select" style={{ width: "auto", minHeight: 36 }} defaultValue={role} disabled={p} aria-label="Alterar papel"
          onChange={(e) => start(async () => { const r = await changeRole(userId, e.target.value); if (!r.ok) setErr(r.error); router.refresh(); })}>
          <option value="admin">Administrador</option><option value="collaborator">Colaborador</option><option value="reader">Leitor</option>
        </select>
      ) : null}
      {confirm ? (
        <>
          <button className="btn btn-danger btn-sm" disabled={p} onClick={() => start(async () => { const r = await removeMember(userId); if (!r.ok) setErr(r.error); else if (self) window.location.replace(new URL("/app", window.location.origin)); router.refresh(); })}>Confirmar</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Cancelar</button>
        </>
      ) : <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>{self ? "Sair do espaço" : "Remover"}</button>}
      {err ? <Alert tone="error">{err}</Alert> : null}
    </span>
  );
}
