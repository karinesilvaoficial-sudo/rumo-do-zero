"use client";
import dynamic from "next/dynamic";
import { StaticCompass } from "@/components/three/static-compass";

// 3D + física carregados sob demanda; o conteúdo e os controles já estão utilizáveis antes.
const HeroScene = dynamic(() => import("@/components/three/hero-scene"), {
  ssr: false,
  loading: () => <div style={{ position: "absolute", inset: "12%" }}><StaticCompass /></div>,
});

export function HeroStage() {
  return (
    <figure className="hero-stage" style={{ margin: 0 }}>
      <HeroScene />
      <figcaption className="small muted" style={{ position: "absolute", left: 18, bottom: 14, right: 18, pointerEvents: "none" }}>
        Arraste os marcadores de meta ao redor da bússola.
      </figcaption>
    </figure>
  );
}
