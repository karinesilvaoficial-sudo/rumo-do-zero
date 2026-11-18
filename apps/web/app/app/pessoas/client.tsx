"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionForm, Field, Select } from "@/components/app/action-form";
import { Alert } from "@/components/ui";
import { changeRole, invite, removeMember, revokeInvite } from "./actions";

export function InviteForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  const [sent, setSent] = useState<{ link: string; emailEnabled: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <ActionForm action={invite} submit="Criar convite" success="Convite criado." className="form-grid"
        onDone={(d) => { setCopied(false); setSent(d as { link: string; emailEnabled: boolean }); }}>
        <Field label="E-mail" name="email" type="email" required maxLength={200} />
        <Select label="Papel" name="role" required defaultValue="reader" options={[...(canInviteAdmin ? [{ value: "admin", label: "Administrador" }] : []), { value: "collaborator", label: "Colaborador" }, { value: "reader", label: "Leitor" }]} />
      </ActionForm>
      {sent ? (
        <div className="card stack" role="status" style={{ gap: 8 }}>
          <p className="small">{sent.emailEnabled ? "Enviamos o convite por e-mail. Se não chegar em alguns minutos (veja também o spam), envie o link abaixo por WhatsApp." : "O envio de e-mail ainda não está ativo. Copie o link abaixo e envie por WhatsApp ou mensagem."} O link vale por 7 dias e só funciona para o e-mail convidado.</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input className="input" readOnly value={sent.link} aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} style={{ flex: "1 1 260px" }} />
            <button type="button" className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(sent.link); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copiado!" : "Copiar link"}</button>
            <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent("Você foi convidado para o RUMO: " + sent.link)}`} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
          </div>
        </div>
      ) : null}
    </div>
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
