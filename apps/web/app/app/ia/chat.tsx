"use client";
import { formatBRL } from "@rumo/contracts";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { AudioControls, useAudio } from "@/components/app/audio";
import { MicButton } from "@/components/app/mic";
import { Icon } from "@/components/icons";
import { Alert } from "@/components/ui";
import { saveDocument } from "../rendas/actions";

export type Intent = { id: string; tool: string; summary: string; hash: string; expires_at: string; payload: Record<string, unknown>; status?: string };
type Doc = { kind: string; title: string; body: string };
export type Msg = { id: string; role: "user" | "assistant"; content: string; meta?: { workspace?: string; period?: { label: string }; sources?: string[]; intents?: Intent[]; documents?: Doc[]; credits?: number; truncated?: boolean } };

const TOOL_LABEL: Record<string, string> = { create_goal: "Criar meta", categorize_transaction: "Alterar categoria", upsert_budget: "Definir orçamento", create_commitment: "Criar compromisso", record_transaction: "Registrar lançamento", create_task: "Criar tarefa" };
const FIELD_LABEL: Record<string, string> = { name: "Nome", target_cents: "Valor-alvo", target_date: "Prazo", amount_cents: "Valor", month: "Mês", description: "Descrição", due_date: "Vencimento", direction: "Tipo", kind: "Tipo", date: "Data", title: "Título", category_id: "Categoria", account_id: "Conta", transaction_id: "Lançamento", expected_version: "Versão" };

function fmtField(k: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (k.endsWith("_cents")) return formatBRL(String(v));
  if (k.endsWith("date") || k === "month" || k === "date") return String(v).split("-").reverse().join("/");
  if (k === "direction") return v === "payable" ? "A pagar" : "A receber";
  if (k === "kind") return v === "income" ? "Receita" : "Despesa";
  if (k.endsWith("_id")) return "selecionado(a)";
  return String(v);
}

function IntentCard({ intent, workspaceId, canAct }: { intent: Intent; workspaceId: string; canAct: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(intent.status ?? "prepared");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const ms = new Date(intent.expires_at).getTime() - Date.now();
    const t = setTimeout(() => setExpired(true), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [intent.expires_at]);
  async function decide(decision: "confirm" | "reject") {
    if (busy) return; // evita clique duplo
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/ai/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, intentId: intent.id, hash: intent.hash, decision }) });
      const j = (await res.json()) as { status?: string; message?: string };
      if (!res.ok) throw new Error(j.message ?? "Não foi possível concluir.");
      setStatus(j.status === "executed" ? "executed" : j.status ?? decision);
      if (j.status === "executed") router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="intent-card" role="group" aria-label={`Proposta: ${TOOL_LABEL[intent.tool] ?? intent.tool}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{TOOL_LABEL[intent.tool] ?? intent.tool}</strong>
        <span className={`badge ${status === "executed" ? "badge-pos" : status === "prepared" && !expired ? "" : "badge-muted"}`}>
          {status === "executed" ? "Executada" : status === "rejected" ? "Recusada" : status === "expired" || expired ? "Expirada" : "Aguardando confirmação"}
        </span>
      </div>
      <p className="small">{intent.summary}</p>
      <dl className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
        {Object.entries(intent.payload).filter(([k]) => k !== "expected_version").map(([k, v]) => (<Fragment key={k}><dt className="muted">{FIELD_LABEL[k] ?? k}</dt><dd style={{ margin: 0 }} className={k.endsWith("_cents") ? "money" : ""}>{fmtField(k, v)}</dd></Fragment>))}
      </dl>
      {err ? <Alert tone="error">{err}</Alert> : null}
      {status === "prepared" && !expired ? (
        canAct ? (
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => decide("confirm")} disabled={busy} aria-busy={busy}>{busy ? "Executando…" : "Confirmar"}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => decide("reject")} disabled={busy}>Recusar</button>
          </div>
        ) : <p className="small muted">Seu papel neste espaço é de leitura; peça a um colaborador para confirmar.</p>
      ) : null}
    </div>
  );
}

function DocCard({ doc, canAct }: { doc: Doc; canAct: boolean }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="intent-card">
      <div className="row" style={{ justifyContent: "space-between" }}><strong>{doc.title}</strong><span className="badge">Documento</span></div>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, maxHeight: 260, overflow: "auto" }} className="small">{doc.body}</pre>
      <div className="row">
        <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(doc.body)}>Copiar</button>
        {canAct ? <button className="btn btn-primary btn-sm" disabled={busy || Boolean(saved)} onClick={async () => {
          setBusy(true);
          const r = await saveDocument(doc.kind, doc.title, doc.body, null);
          setBusy(false);
          setSaved(r.ok ? "Salvo em Novas rendas › Documentos" : r.error);
        }}>{saved ? "Salvo" : "Salvar no espaço"}</button> : null}
      </div>
      {saved ? <p className="small muted" role="status">{saved}. Criar um documento não o envia a ninguém.</p> : null}
    </div>
  );
}

function AssistantBubble({ m, workspaceId, canAct, voiceReady }: { m: Msg; workspaceId: string; canAct: boolean; voiceReady: boolean }) {
  const a = useAudio();
  return (
    <motion.div className="msg msg-assistant" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      {m.content}
      {m.meta?.intents?.map((i) => <div key={i.id} style={{ marginTop: 10 }}><IntentCard intent={i} workspaceId={workspaceId} canAct={canAct} /></div>)}
      {m.meta?.documents?.map((d, idx) => <div key={idx} style={{ marginTop: 10 }}><DocCard doc={d} canAct={canAct} /></div>)}
      <div className="msg-meta">
        {m.meta?.workspace ? <>Espaço: {m.meta.workspace}{m.meta.period ? ` · ${m.meta.period.label}` : ""}</> : null}
        {m.meta?.sources?.length ? <> · Consultado: {m.meta.sources.join("; ")}</> : null}
        {m.meta?.credits ? <> · {m.meta.credits} crédito{m.meta.credits > 1 ? "s" : ""}</> : null}
      </div>
      {voiceReady && m.content ? (
        <div className="row" style={{ marginTop: 6, gap: 6 }}>
          {a.state === "idle" && !a.canRepeat ? <button className="btn btn-ghost btn-sm" onClick={() => a.request("/api/voice/tts", { workspaceId, text: m.content })}><Icon.speaker width={16} height={16} />Ouvir resposta</button> : null}
          <AudioControls a={a} label="resposta" />
        </div>
      ) : null}
    </motion.div>
  );
}

export function Chat({ workspaceId, workspaceName, conversationId, initial, period, canAct, aiReady, voiceReady }: {
  workspaceId: string; workspaceName: string; conversationId: string | null; initial: Msg[]; period: { from: string; to: string; label: string }; canAct: boolean; aiReady: boolean; voiceReady: boolean;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [conv, setConv] = useState(conversationId);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ credits: number; available: number | null; question: string; requestId: string } | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => () => ctrl.current?.abort(), []);

  async function send(question: string, requestId = crypto.randomUUID(), confirmCredits?: number) {
    if (!question.trim() || busy) return;
    setBusy(true); setErr(null); setConfirm(null);
    const c = new AbortController();
    ctrl.current = c;
    if (!confirmCredits) setMsgs((m) => [...m, { id: requestId, role: "user", content: question }]);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", signal: c.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, conversationId: conv, message: question, inputMode: mode, period, requestId, confirmCredits }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? "A RUMO IA está indisponível no momento.");
      if (j.needsConfirmation) { setConfirm({ credits: j.credits, available: j.available, question, requestId }); return; }
      setConv(j.conversationId);
      if (!conv) window.history.replaceState(null, "", `/app/ia?c=${j.conversationId}`);
      setMsgs((m) => [...m, { id: j.messageId, role: "assistant", content: j.text, meta: j }]);
      setText(""); setMode("text");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr(`${(e as Error).message} Sua mensagem não foi perdida; você pode tentar novamente.`);
    } finally { setBusy(false); }
  }

  return (
    <section className="chat card" aria-label={`Conversa com a RUMO IA no espaço ${workspaceName}`}>
      <div className="chat-log" ref={log} aria-live="polite">
        {msgs.length === 0 ? (
          <div className="empty">
            <h3>Como posso ajudar?</h3>
            <div className="row" style={{ justifyContent: "center" }}>
              {["Explique meu resultado deste mês", "Quais contas vencem nos próximos 15 dias?", "Crie uma meta de reserva de emergência", "Escreva uma proposta para meu serviço"].map((s) => (
                <button key={s} className="btn btn-secondary btn-sm" onClick={() => setText(s)} disabled={!aiReady}>{s}</button>
              ))}
            </div>
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {msgs.map((m) => m.role === "user"
            ? <motion.div key={m.id} className="msg msg-user" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>{m.content}</motion.div>
            : <AssistantBubble key={m.id} m={m} workspaceId={workspaceId} canAct={canAct} voiceReady={voiceReady} />)}
        </AnimatePresence>
        {busy ? <div className="msg msg-assistant muted" role="status">Consultando seus dados…</div> : null}
      </div>
      {confirm ? (
        <Alert tone="info">
          Esta resposta deve consumir até <strong>{confirm.credits} créditos</strong>{confirm.available !== null ? ` (disponíveis: ${confirm.available})` : ""}. O não utilizado é devolvido.
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => send(confirm.question, confirm.requestId, confirm.credits)}>Continuar</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setConfirm(null); setMsgs((m) => m.slice(0, -1)); }}>Cancelar</button>
          </div>
        </Alert>
      ) : null}
      {err ? <Alert tone="error">{err}</Alert> : null}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <label htmlFor="pergunta" className="sr-only">Mensagem para a RUMO IA</label>
        <textarea id="pergunta" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={1} placeholder={aiReady ? "Pergunte ou peça algo ao RUMO…" : "IA não configurada neste ambiente"} disabled={!aiReady}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
        {voiceReady ? <MicButton key={workspaceId} workspaceId={workspaceId} disabled={!aiReady || busy} onText={(t) => { setText(t); setMode("voice"); }} /> : null}
        {busy ? <button type="button" className="btn btn-secondary" onClick={() => ctrl.current?.abort()}>Parar</button>
          : <button className="btn btn-primary" type="submit" disabled={!aiReady || !text.trim()}>Enviar</button>}
      </form>
      {mode === "voice" && text ? <p className="small muted">Texto transcrito — revise antes de enviar.</p> : null}
    </section>
  );
}
