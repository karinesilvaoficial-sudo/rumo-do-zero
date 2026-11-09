"use client";
import { formatBRL, type IncomePath } from "@rumo/contracts";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionForm, Field, MoneyField, Select } from "@/components/app/action-form";
import { Alert, Sheet } from "@/components/ui";
import { linkProposalRevenue, saveContact, saveIncomePath, saveIncomeProfile, saveProposal, setPathStatus, setTaskStatus } from "./actions";

type Profile = { skills?: string[]; interests?: string[]; experience?: string | null; region?: string | null; weekly_hours?: number | null; resources?: string | null; restrictions?: string | null; capital_cents?: number | string | null; goal_monthly_cents?: number | string | null; business?: Record<string, string | null> } | null;
const brl = (v: unknown) => (v === null || v === undefined ? undefined : formatBRL(String(v)).replace("R$ ", ""));

export function ProfileForm({ profile, isBusiness, disabled }: { profile: Profile; isBusiness: boolean; disabled: boolean }) {
  const p = profile ?? {};
  return (
    <ActionForm action={saveIncomeProfile} submit="Salvar diagnóstico" success="Diagnóstico salvo." resetOnSuccess={false} disabled={disabled}>
      <div className="form-grid">
        <Field label="Habilidades" name="skills" defaultValue={(p.skills ?? []).join(", ")} hint="Separe por vírgula. Ex.: confeitaria, Excel, design" required />
        <Field label="Interesses" name="interests" defaultValue={(p.interests ?? []).join(", ")} />
        <Field label="Horas por semana disponíveis" name="weekly_hours" type="number" min={0} max={80} defaultValue={p.weekly_hours ?? undefined} required />
        <Field label="Cidade/região (se relevante)" name="region" defaultValue={p.region ?? ""} maxLength={120} />
        <MoneyField label="Capital que aceita comprometer (R$)" name="capital" defaultValue={brl(p.capital_cents)} hint="Em branco = não informado" />
        <MoneyField label="Objetivo de renda mensal (R$)" name="goal_monthly" defaultValue={brl(p.goal_monthly_cents)} />
      </div>
      <div className="field"><label htmlFor="f-exp">Experiência</label><textarea id="f-exp" name="experience" className="textarea" maxLength={2000} defaultValue={p.experience ?? ""} /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor="f-res">Recursos disponíveis</label><textarea id="f-res" name="resources" className="textarea" maxLength={2000} defaultValue={p.resources ?? ""} placeholder="Ex.: carro, notebook, cozinha equipada" /></div>
        <div className="field"><label htmlFor="f-rst">Restrições</label><textarea id="f-rst" name="restrictions" className="textarea" maxLength={2000} defaultValue={p.restrictions ?? ""} placeholder="Ex.: só noites e fins de semana" /></div>
      </div>
      {isBusiness ? (
        <fieldset className="form-grid" style={{ border: "1px solid var(--rumo-border)", borderRadius: 12, padding: 12 }}>
          <legend className="small" style={{ fontWeight: 700 }}>Negócio</legend>
          <Field label="Oferta atual" name="offer" defaultValue={p.business?.offer ?? ""} />
          <Field label="Capacidade ociosa" name="idle_capacity" defaultValue={p.business?.idle_capacity ?? ""} />
          <Field label="Canais de venda" name="channels" defaultValue={p.business?.channels ?? ""} />
          <MoneyField label="Ticket médio informado (R$)" name="ticket" defaultValue={brl(p.business?.ticket_cents)} />
          <Field label="Custos (descrição)" name="costs" defaultValue={p.business?.variable_costs_note ?? ""} />
        </fieldset>
      ) : null}
    </ActionForm>
  );
}

export function GeneratePaths({ workspaceId, ready }: { workspaceId: string; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ credits: number; requestId: string } | null>(null);
  const [paths, setPaths] = useState<IncomePath[]>([]);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  async function run(confirmCredits?: number, requestId = crypto.randomUUID()) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/ai/income-paths", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, requestId, confirmCredits }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "Não foi possível gerar agora.");
      if (j.needsConfirmation) { setConfirm({ credits: j.credits, requestId }); return; }
      setConfirm(null); setPaths(j.paths); setSaved(new Set());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="stack">
      <div className="row">
        <button className="btn btn-primary" disabled={!ready || busy} aria-busy={busy} onClick={() => run()}>{busy ? "Gerando…" : "Gerar caminhos com a RUMO IA"}</button>
        {!ready ? <span className="small muted">Preencha habilidades e horas semanais no diagnóstico.</span> : null}
      </div>
      {confirm ? <Alert tone="info">Esta geração consome até <strong>{confirm.credits} créditos de IA</strong>. <button className="btn btn-primary btn-sm" onClick={() => run(confirm.credits, confirm.requestId)} disabled={busy}>Continuar</button> <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancelar</button></Alert> : null}
      {err ? <Alert tone="error">{err}</Alert> : null}
      {paths.length ? <p className="small muted">Ideias baseadas nos dados que você informou, sem pesquisa de mercado externa. Salve as que fizerem sentido.</p> : null}
      {paths.map((p, i) => (
        <div key={i} className="intent-card">
          <strong>{p.title}</strong>
          <p className="small">{p.rationale}</p>
          <p className="small"><strong>Teste de validação:</strong> {p.validation_experiment}</p>
          <button className="btn btn-secondary btn-sm" disabled={saved.has(i)} onClick={async () => {
            const r = await saveIncomePath(p);
            if (r.ok) { setSaved(new Set([...saved, i])); router.refresh(); } else setErr(r.error);
          }}>{saved.has(i) ? "✓ Salvo com plano e tarefas" : "Salvar este caminho"}</button>
        </div>
      ))}
    </div>
  );
}

export function PathStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="row small" style={{ gap: 6 }}>Situação
      <select className="select" style={{ width: "auto", minHeight: 36 }} defaultValue={status} disabled={pending} onChange={(e) => start(async () => { await setPathStatus(id, e.target.value); router.refresh(); })}>
        <option value="suggested" disabled>Sugerido</option><option value="active">Em execução</option><option value="continued">Continuar</option><option value="paused">Ajustar/pausado</option><option value="abandoned">Abandonado</option>
      </select>
    </label>
  );
}

export function TaskToggle({ id, title, status, disabled }: { id: string; title: string; status: string; disabled: boolean }) {
  const router = useRouter();
  const [done, setDone] = useState(status === "done");
  const [pending, start] = useTransition();
  return (
    <label className="row small" style={{ gap: 8, minHeight: 32 }}>
      <input type="checkbox" checked={done} disabled={disabled || pending} onChange={(e) => { const v = e.target.checked; setDone(v); start(async () => { const r = await setTaskStatus(id, v ? "done" : "todo"); if (!r.ok) setDone(!v); router.refresh(); }); }} />
      <span style={done ? { textDecoration: "line-through", color: "var(--rumo-muted)" } : undefined}>{title}</span>
    </label>
  );
}

export function ContactForm() {
  const [o, setO] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setO(true)}>Novo contato</button>
      <Sheet open={o} onClose={() => setO(false)} title="Novo contato comercial">
        <ActionForm action={saveContact} submit="Salvar" success="Contato salvo." onDone={() => setTimeout(() => setO(false), 500)}>
          <Field label="Nome" name="name" required maxLength={120} />
          <div className="form-grid"><Field label="E-mail" name="email" type="email" maxLength={200} /><Field label="Telefone" name="phone" maxLength={40} /></div>
          <Select label="Etapa" name="stage" required defaultValue="lead" options={[{ value: "lead", label: "Contato" }, { value: "contacted", label: "Abordado" }, { value: "proposal", label: "Proposta" }, { value: "won", label: "Fechado" }, { value: "lost", label: "Perdido" }]} />
          <div className="field"><label htmlFor="f-n">Anotações</label><textarea id="f-n" name="notes" className="textarea" maxLength={2000} /></div>
        </ActionForm>
      </Sheet>
    </>
  );
}

type Opt = { id: string; name: string };
export function ProposalForm({ contacts, paths, documents }: { contacts: Opt[]; paths: Opt[]; documents: Opt[] }) {
  const [o, setO] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setO(true)}>Nova proposta</button>
      <Sheet open={o} onClose={() => setO(false)} title="Nova proposta">
        <ActionForm action={saveProposal} submit="Salvar" success="Proposta salva." onDone={() => setTimeout(() => setO(false), 500)}>
          <Field label="Título" name="title" required maxLength={160} />
          <MoneyField label="Valor proposto (R$)" name="amount" />
          <Select label="Contato" name="contact_id" options={contacts.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Caminho de renda" name="path_id" options={paths.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="Documento" name="document_id" options={documents.map((c) => ({ value: c.id, label: c.name }))} />
        </ActionForm>
      </Sheet>
    </>
  );
}

export function LinkRevenue({ proposalId, amount, accounts, categories, today }: { proposalId: string; amount: string | null; accounts: Opt[]; categories: Opt[]; today: string }) {
  const [o, setO] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setO(true)}>Registrar recebimento</button>
      <Sheet open={o} onClose={() => setO(false)} title="Vincular receita da proposta">
        <ActionForm action={linkProposalRevenue} submit="Registrar receita" success="Receita vinculada ao financeiro." onDone={() => setTimeout(() => setO(false), 600)}>
          <input type="hidden" name="proposal_id" value={proposalId} />
          <input type="hidden" name="mode" value="new" />
          <div className="form-grid">
            <MoneyField label="Valor recebido (R$)" name="amount" required defaultValue={amount ? formatBRL(amount).replace("R$ ", "") : undefined} />
            <Field label="Data" name="date" type="date" required defaultValue={today} />
          </div>
          <Select label="Conta" name="account_id" required options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          <Select label="Categoria" name="category_id" options={categories.map((a) => ({ value: a.id, label: a.name }))} />
          <p className="small muted">Se o recebimento já foi lançado, não registre de novo: use a RUMO IA ou o suporte para vincular o lançamento existente.</p>
        </ActionForm>
      </Sheet>
    </>
  );
}
