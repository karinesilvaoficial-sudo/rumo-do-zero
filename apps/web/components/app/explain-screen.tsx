"use client";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { AudioControls, useAudio } from "./audio";

/** "Explique esta tela": geral (sem dados) ou com os valores do período/filtro atual, por escolha explícita. */
export function ExplainScreen({ screen, workspaceId, period }: { screen: string; workspaceId: string; period?: { from: string; to: string; label: string } }) {
  const a = useAudio();
  const [menu, setMenu] = useState(false);
  const run = (personal: boolean) => { setMenu(false); void a.request("/api/voice/explain", { screen, workspaceId, personal, period }); };
  return (
    <div className="row" style={{ position: "relative", gap: 6 }}>
      <button className="btn btn-secondary" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} disabled={a.state === "loading"}>
        <Icon.speaker width={18} height={18} />Explique esta tela
      </button>
      {menu ? (
        <div role="menu" className="card" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 5, padding: 8, width: 280 }}>
          <button role="menuitem" className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => run(false)}>Explicação geral da tela</button>
          <button role="menuitem" className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => run(true)}>Incluir meus valores do período</button>
          <p className="small muted" style={{ padding: "4px 10px" }}>Com valores, o áudio é privado e consome minutos de voz do plano.</p>
        </div>
      ) : null}
      <AudioControls a={a} label="explicação da tela" />
    </div>
  );
}
