"use client";
import { useState } from "react";
import { Alert } from "@/components/ui";

type P = { code: string; name: string; monthly: string; annual: string; annualMonthly: string; lines: string[] };

async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message ?? "Não foi possível abrir o pagamento.");
  return j as { url: string; message?: string };
}

export function PortalButton() {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="row">
      <button className="btn btn-secondary" onClick={async () => { try { window.location.assign((await post("/api/billing/portal")).url); } catch (e) { setErr((e as Error).message); } }}>Gerenciar pagamento, faturas e cancelamento</button>
      {err ? <Alert tone="error">{err}</Alert> : null}
    </div>
  );
}

export function PlanPicker({ plans, current, hasSubscription, pixEnabled, disabled, preselect }: { plans: P[]; current: string; hasSubscription: boolean; pixEnabled: boolean; disabled: boolean; preselect?: string }) {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go(plan: string, method: "card" | "pix") {
    setBusy(plan + method); setErr(null);
    try { window.location.assign((await post("/api/billing/checkout", { plan, interval, method })).url); } catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  return (
    <div className="stack">
      <div className="segmented" role="group" aria-label="Período de cobrança">
        <button type="button" aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Mensal</button>
        <button type="button" aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Anual (10 mensalidades)</button>
      </div>
      {err ? <Alert tone="error">{err}</Alert> : null}
      <div className="grid grid-3">
        {plans.map((p) => (
          <article key={p.code} className={`card plan-card ${preselect === p.code ? "highlight" : ""}`}>
            <h3>{p.name}{current === p.code ? <span className="badge" style={{ marginLeft: 8 }}>Atual</span> : null}</h3>
            {interval === "month"
              ? <div><div className="plan-price num">{p.monthly}<span className="small muted">/mês</span></div><p className="small muted">Cobrança mensal</p></div>
              : <div><div className="plan-price num">{p.annual}<span className="small muted">/ano</span></div><p className="small muted">Cobrança única anual · equivale a {p.annualMonthly}/mês</p></div>}
            <ul>{p.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <button className="btn btn-primary" disabled={disabled || busy !== null} aria-busy={busy === p.code + "card"} onClick={() => go(p.code, "card")}>{busy === p.code + "card" ? "Abrindo…" : hasSubscription ? "Trocar no portal" : "Assinar com cartão"}</button>
            <button className="btn btn-secondary" disabled={disabled || busy !== null || !pixEnabled || hasSubscription} onClick={() => go(p.code, "pix")} title={!pixEnabled ? "Pix indisponível para esta conta no momento" : hasSubscription ? "Você já tem renovação automática" : undefined}>
              {busy === p.code + "pix" ? "Abrindo…" : `Pagar ${interval === "year" ? "12 meses" : "1 mês"} com Pix`}
            </button>
            {!pixEnabled ? <p className="small muted">Pix ainda não habilitado nesta conta de recebimento.</p> : <p className="small muted">Pix: pré-pago, renovação manual.</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
