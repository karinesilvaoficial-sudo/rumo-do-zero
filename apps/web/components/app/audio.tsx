"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

/**
 * Player controlado: o áudio só começa por ação do usuário. Parar cancela a requisição em andamento.
 * Repetir reutiliza o mesmo blob (sem nova geração/cobrança).
 */
export function useAudio() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);

  const cleanup = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    audio.current?.pause();
  }, []);
  useEffect(() => () => { cleanup(); if (url.current?.startsWith("blob:")) URL.revokeObjectURL(url.current); }, [cleanup]);
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);

  const playUrl = useCallback(async (src: string) => {
    if (url.current?.startsWith("blob:") && url.current !== src) URL.revokeObjectURL(url.current);
    url.current = src;
    const a = audio.current ?? new Audio();
    audio.current = a;
    a.src = src;
    a.volume = volume;
    a.onended = () => setState("idle");
    a.onpause = () => setState((s) => (s === "playing" ? "paused" : s));
    a.onplay = () => setState("playing");
    try { await a.play(); } catch { setState("error"); setError("Não foi possível reproduzir o áudio."); }
  }, [volume]);

  const request = useCallback(async (endpoint: string, body: unknown) => {
    cleanup();
    setError(null);
    setState("loading");
    const c = new AbortController();
    ctrl.current = c;
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: c.signal });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? "Áudio indisponível no momento.");
      }
      if (res.headers.get("content-type")?.includes("application/json")) {
        const j = (await res.json()) as { url: string | null };
        if (!j.url) throw new Error("Áudio indisponível no momento.");
        await playUrl(j.url);
      } else {
        await playUrl(URL.createObjectURL(await res.blob()));
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") { setState("idle"); return; }
      setState("error");
      setError((e as Error).message);
    }
  }, [cleanup, playUrl]);

  return {
    state, error, volume, setVolume, request,
    pause: () => audio.current?.pause(),
    resume: () => void audio.current?.play(),
    stop: () => { cleanup(); if (audio.current) audio.current.currentTime = 0; setState("idle"); },
    repeat: () => { if (url.current) void playUrl(url.current); },
    canRepeat: Boolean(url.current),
  };
}

export function AudioControls({ a, label }: { a: ReturnType<typeof useAudio>; label: string }) {
  if (a.state === "idle" && !a.canRepeat && !a.error) return null;
  return (
    <div className="row" role="group" aria-label={`Controles de áudio: ${label}`} style={{ gap: 6 }}>
      {a.state === "loading" ? <span className="small muted" role="status"><span className="spinner" style={{ display: "inline-block", width: 12, height: 12, border: "2px solid currentColor", borderRightColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite", marginRight: 6 }} />Gerando áudio…</span> : null}
      {a.state === "playing" ? <button className="btn btn-ghost btn-sm" onClick={a.pause}>Pausar</button> : null}
      {a.state === "paused" ? <button className="btn btn-ghost btn-sm" onClick={a.resume}>Continuar</button> : null}
      {a.state === "playing" || a.state === "paused" || a.state === "loading" ? <button className="btn btn-ghost btn-sm" onClick={a.stop}><Icon.stop width={16} height={16} />Parar</button> : null}
      {a.canRepeat && a.state === "idle" ? <button className="btn btn-ghost btn-sm" onClick={a.repeat}>Repetir</button> : null}
      <label className="small row" style={{ gap: 4 }}><span className="sr-only">Volume</span>
        <input type="range" min={0} max={1} step={0.1} value={a.volume} onChange={(e) => a.setVolume(Number(e.target.value))} aria-label="Volume" style={{ width: 70 }} />
      </label>
      {a.error ? <span className="small neg" role="alert">{a.error}</span> : null}
    </div>
  );
}
