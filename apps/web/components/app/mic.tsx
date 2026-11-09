"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

const MAX_SECONDS = 60;

/**
 * Gravação por turnos (falar → encerrar). Indicador visível enquanto grava; nada é gravado em segundo plano.
 * O texto transcrito volta para revisão antes do envio. Permissão negada → mantém digitação.
 */
export function MicButton({ workspaceId, onText, disabled }: { workspaceId: string; onText: (t: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);

  const stopAll = () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => () => { ctrl.current?.abort(); if (rec.current?.state === "recording") rec.current.stop(); stopAll(); }, []);

  async function start() {
    setErr(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setErr("Microfone indisponível neste navegador. Use a digitação."); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setErr("Permissão de microfone negada. Você pode continuar digitando.");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const r = new MediaRecorder(stream.current, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      stopAll();
      const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
      const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
      setState("transcribing");
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("seconds", String(seconds));
      fd.set("audio", new File([blob], "fala", { type: blob.type.split(";")[0] }));
      const c = new AbortController();
      ctrl.current = c;
      try {
        const res = await fetch("/api/voice/stt", { method: "POST", body: fd, signal: c.signal });
        const j = (await res.json()) as { text?: string; message?: string };
        if (!res.ok) throw new Error(j.message ?? "Transcrição indisponível.");
        if (!j.text) throw new Error("Não entendi o áudio. Tente novamente ou digite.");
        onText(j.text);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      } finally {
        setState("idle");
      }
    };
    rec.current = r;
    started.current = Date.now();
    setSecs(0);
    timer.current = setInterval(() => {
      const s = Math.round((Date.now() - started.current) / 1000);
      setSecs(s);
      if (s >= MAX_SECONDS && r.state === "recording") r.stop();
    }, 250);
    r.start();
    setState("recording");
  }

  return (
    <div className="row" style={{ gap: 6 }}>
      {state === "recording" ? (
        <button type="button" className="btn btn-danger icon-btn" onClick={() => rec.current?.stop()} aria-label={`Encerrar gravação (${secs} s)`}><Icon.stop /></button>
      ) : (
        <button type="button" className="btn btn-ghost icon-btn" onClick={start} disabled={disabled || state === "transcribing"} aria-label="Falar com o RUMO"><Icon.mic /></button>
      )}
      {state === "recording" ? <span className="small row" role="status" style={{ gap: 6 }}><span className="rec-dot" aria-hidden />Gravando… {secs}s / {MAX_SECONDS}s</span> : null}
      {state === "transcribing" ? <span className="small muted" role="status">Transcrevendo…</span> : null}
      {err ? <span className="small neg" role="alert">{err}</span> : null}
    </div>
  );
}
