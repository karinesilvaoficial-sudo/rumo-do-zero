"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui";

type Job = { id: string; kind: string; status: string; created_at: string; expires_at: string | null; label: string };
const KIND: Record<string, string> = { summary_pdf: "PDF resumo", full_pdf: "PDF completo", csv: "CSV", xlsx: "Planilha XLSX" };
const STATUS: Record<string, string> = { queued: "Na fila", running: "Gerando", done: "Pronto", failed: "Falhou", expired: "Expirado" };

export function ExportPanel({ workspaceId, period, plan, jobs, disabled }: { workspaceId: string; period: { from: string; to: string; label: string }; plan: string; jobs: Job[]; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const paid = plan !== "free";
  async function request(kind: string) {
    setBusy(kind); setMsg(null);
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, kind, from: period.from, to: period.to, label: period.label, requestId: crypto.randomUUID() }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "Não foi possível gerar.");
      if (j.url) { window.location.assign(j.url); setMsg({ tone: "ok", text: `Arquivo pronto. Disponível por ${j.expiresInDays} dias no histórico.` }); }
      else setMsg({ tone: "info", text: j.message ?? "Na fila." });
      router.refresh();
    } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(null); }
  }
  async function download(id: string) {
    const r = await fetch(`/api/reports/${id}`);
    const j = await r.json();
    if (j.url) window.location.assign(j.url); else setMsg({ tone: "error", text: j.message ?? `Situação: ${STATUS[j.status] ?? j.status}` });
  }
  return (
    <div className="stack">
      <div className="row">
        <button className="btn btn-primary" disabled={disabled || busy !== null} aria-busy={busy === "summary_pdf"} onClick={() => request("summary_pdf")}>{busy === "summary_pdf" ? "Gerando…" : "PDF resumo"}</button>
        <button className="btn btn-secondary" disabled={disabled || busy !== null || !paid} onClick={() => request("full_pdf")} title={paid ? undefined : "Disponível a partir do Pro"}>{busy === "full_pdf" ? "Gerando…" : "PDF completo"}</button>
        <button className="btn btn-secondary" disabled={disabled || busy !== null || !paid} onClick={() => request("xlsx")} title={paid ? undefined : "Disponível a partir do Pro"}>{busy === "xlsx" ? "Gerando…" : "Planilha XLSX"}</button>
        <button className="btn btn-secondary" disabled={disabled || busy !== null} onClick={() => request("csv")}>{busy === "csv" ? "Gerando…" : "CSV dos meus registros"}</button>
      </div>
      <p className="small muted">Período: {period.label}. {paid ? "" : "No Free: PDF resumo e CSV. "}CSV com separador “;” e vírgula decimal; textos protegidos contra fórmulas.</p>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {jobs.length ? (
        <div className="table-wrap"><table className="table">
          <caption className="sr-only">Histórico de geração</caption>
          <thead><tr><th>Arquivo</th><th>Período</th><th>Situação</th><th>Disponível até</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{jobs.map((j) => (
            <tr key={j.id}><td>{KIND[j.kind]}</td><td>{j.label}</td><td><span className={`badge ${j.status === "done" ? "badge-pos" : j.status === "failed" ? "badge-neg" : "badge-muted"}`}>{STATUS[j.status] ?? j.status}</span></td>
              <td className="small">{j.expires_at ? new Date(j.expires_at).toLocaleDateString("pt-BR") : "—"}</td>
              <td className="r">{j.status === "done" ? <button className="btn btn-ghost btn-sm" onClick={() => download(j.id)}>Baixar</button> : j.status === "queued" || j.status === "running" ? <button className="btn btn-ghost btn-sm" onClick={() => router.refresh()}>Atualizar</button> : null}</td></tr>
          ))}</tbody>
        </table></div>
      ) : null}
    </div>
  );
}
