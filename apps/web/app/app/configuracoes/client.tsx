"use client";
import { useState } from "react";
import { ActionForm, Field } from "@/components/app/action-form";
import { Alert } from "@/components/ui";
import { savePreferences } from "../actions";
import { requestAccountDeletion, saveNotificationPrefs } from "./actions";

export function Prefs({ profile }: { profile: { full_name: string | null; timezone: string; reduce_motion: boolean; hide_values: boolean } }) {
  return (
    <ActionForm action={savePreferences} submit="Salvar preferências" success="Preferências salvas." resetOnSuccess={false}>
      <div className="form-grid">
        <Field label="Nome" name="full_name" defaultValue={profile.full_name ?? ""} maxLength={120} />
        <div className="field"><label htmlFor="tz">Fuso horário</label>
          <select id="tz" name="timezone" className="select" defaultValue={profile.timezone}>
            {["America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza", "America/Recife", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha"].map((t) => <option key={t} value={t}>{t.replace("America/", "").replace("_", " ")}</option>)}
          </select></div>
      </div>
      <label className="row small"><input type="checkbox" name="reduce_motion" defaultChecked={profile.reduce_motion} /> Reduzir animações (transições 3D e movimentos)</label>
      <label className="row small"><input type="checkbox" name="hide_values" defaultChecked={profile.hide_values} /> Iniciar com valores ocultos na tela (não altera dados nem exportações)</label>
    </ActionForm>
  );
}

const KINDS: [string, string][] = [["due_reminder", "Vencimentos"], ["invitation", "Convites"], ["report_ready", "Relatórios prontos"], ["billing", "Cobrança"], ["goal", "Metas"]];
export function NotifPrefs({ prefs }: { prefs: { kind: string; in_app: boolean; email: boolean; include_amounts: boolean; send_hour: number }[] }) {
  const get = (k: string) => prefs.find((p) => p.kind === k);
  return (
    <ActionForm action={saveNotificationPrefs} submit="Salvar notificações" success="Notificações salvas." resetOnSuccess={false}>
      <div className="table-wrap"><table className="table"><thead><tr><th>Tipo</th><th>No aplicativo</th><th>Por e-mail</th></tr></thead>
        <tbody>{KINDS.map(([k, l]) => <tr key={k}><td>{l}</td><td><input type="checkbox" name={`${k}_app`} defaultChecked={get(k)?.in_app ?? true} aria-label={`${l} no aplicativo`} /></td><td><input type="checkbox" name={`${k}_email`} defaultChecked={get(k)?.email ?? true} aria-label={`${l} por e-mail`} /></td></tr>)}</tbody></table></div>
      <label className="row small"><input type="checkbox" name="include_amounts" defaultChecked={prefs[0]?.include_amounts ?? false} /> Incluir valores nos e-mails (desligado por padrão)</label>
      <Field label="Horário preferido dos lembretes" name="send_hour" type="number" min={0} max={23} defaultValue={prefs[0]?.send_hour ?? 8} hint="Horário local do espaço" />
    </ActionForm>
  );
}

export function ExportAll({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="row">
      <button className="btn btn-secondary" disabled={busy} aria-busy={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try {
          const r = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, kind: "csv", from: "2000-01-01", to: "2100-12-31", label: "Todos os registros", requestId: crypto.randomUUID() }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.message ?? "Falha na exportação.");
          if (j.url) window.location.assign(j.url); else setErr(j.message);
        } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? "Gerando…" : `Exportar todos os registros de “${workspaceName}” (CSV)`}</button>
      {err ? <Alert tone="error">{err}</Alert> : null}
    </div>
  );
}

export function Danger() {
  return (
    <ActionForm action={requestAccountDeletion} submit="Solicitar exclusão" success="Solicitação registrada. Você receberá a confirmação por e-mail.">
      <p className="small">A exclusão remove seu perfil e os espaços que você possui. Membros de espaços compartilhados perdem o acesso. Registros de cobrança podem ser mantidos pelo prazo legal. Exporte seus dados antes.</p>
      <Field label="Digite EXCLUIR para confirmar" name="confirm" required autoComplete="off" />
    </ActionForm>
  );
}
