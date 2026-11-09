"use client";
import { ContactShadows } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Compass, StudioEnvironment } from "./compass";
import { StaticCompass } from "./static-compass";
import { hasWebGL, usePageVisible, useReducedMotion } from "./webgl";

/**
 * Canvas PERSISTENTE do shell (um único renderer para toda a navegação do app).
 * GSAP coordena câmera, objeto, luz e a entrada do conteúdo a cada troca de módulo.
 * frameloop="demand": só renderiza durante transições/acomodação; estático no restante.
 * A linha do tempo anterior é cancelada (kill) a cada troca de rota → cliques rápidos,
 * voltar/avançar e teclado não deixam estados intermediários.
 */
type Pose = { cam: [number, number, number]; rotY: number; heading: number; light: number; tilt: number };
const POSES: Record<string, Pose> = {
  "/app": { cam: [0, 3.4, 4.6], rotY: 0, heading: -0.35, light: 2.1, tilt: 0 },
  "/app/lancamentos": { cam: [1.6, 2.6, 4.4], rotY: 0.6, heading: 0.4, light: 1.9, tilt: 0.06 },
  "/app/planejamento": { cam: [-1.8, 3.0, 4.2], rotY: -0.5, heading: 1.2, light: 2.0, tilt: -0.05 },
  "/app/metas": { cam: [0, 4.6, 2.6], rotY: 0.9, heading: 0, light: 2.3, tilt: 0 },
  "/app/dividas": { cam: [2.2, 2.2, 3.8], rotY: -0.9, heading: 2.2, light: 1.8, tilt: 0.08 },
  "/app/rendas": { cam: [-1.2, 2.4, 4.6], rotY: 1.4, heading: -0.9, light: 2.2, tilt: -0.04 },
  "/app/ia": { cam: [0, 2.0, 4.9], rotY: -1.6, heading: 3.0, light: 2.0, tilt: 0.1 },
  "/app/relatorios": { cam: [1.0, 3.8, 3.8], rotY: 2.2, heading: 0.8, light: 2.1, tilt: 0 },
};
function poseFor(path: string): Pose {
  const key = Object.keys(POSES).filter((k) => path === k || path.startsWith(k + "/")).sort((a, b) => b.length - a.length)[0];
  return POSES[key ?? "/app"] ?? POSES["/app"]!;
}

function Director({ pose, reduced, object, light }: { pose: Pose; reduced: boolean; object: React.RefObject<THREE.Group | null>; light: React.RefObject<THREE.DirectionalLight | null> }) {
  const { camera, invalidate } = useThree();
  const tl = useRef<gsap.core.Timeline | null>(null);
  const [heading, setHeading] = useState(pose.heading);

  useEffect(() => {
    tl.current?.kill();
    const obj = object.current;
    const content = document.querySelector<HTMLElement>("[data-scene-content]");
    const look = () => { camera.lookAt(0, 0.3, 0); invalidate(); };
    if (reduced || !obj) {
      camera.position.set(...pose.cam);
      if (obj) { obj.rotation.y = pose.rotY; obj.rotation.x = pose.tilt; }
      if (light.current) light.current.intensity = pose.light;
      setHeading(pose.heading);
      look();
      if (content) gsap.set(content, { clearProps: "opacity,transform" });
      return;
    }
    const t = gsap.timeline({ defaults: { ease: "power3.inOut" }, onUpdate: look, onComplete: () => {
      // acomodação da agulha: alguns quadros extras e para
      gsap.to({}, { duration: 1.1, onUpdate: invalidate });
    } });
    t.to(camera.position, { x: pose.cam[0], y: pose.cam[1], z: pose.cam[2], duration: 0.7 }, 0)
      .to(obj.rotation, { y: pose.rotY, x: pose.tilt, duration: 0.75 }, 0)
      .add(() => setHeading(pose.heading), 0.15);
    if (light.current) t.to(light.current, { intensity: pose.light, duration: 0.6 }, 0);
    if (content) t.fromTo(content, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", clearProps: "opacity,transform" }, 0.12);
    tl.current = t;
    return () => {
      t.kill();
      if (content) gsap.set(content, { clearProps: "opacity,transform" });
    };
  }, [pose, reduced, camera, invalidate, object, light]);

  return <Compass ref={object} heading={heading} idleSpin={false} quality="low" scale={0.95} />;
}

export function SceneLayer({ reduceMotionPref }: { reduceMotionPref: boolean }) {
  const path = usePathname();
  const pose = poseFor(path);
  const sysReduced = useReducedMotion();
  const reduced = sysReduced || reduceMotionPref;
  const visible = usePageVisible();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [lost, setLost] = useState(false);
  const [key, setKey] = useState(0);
  const object = useRef<THREE.Group>(null);
  const light = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => setWebgl(hasWebGL()), []);
  useEffect(() => { document.documentElement.dataset.reduceMotion = String(reduceMotionPref); }, [reduceMotionPref]);

  return (
    <div className="scene-layer" aria-hidden>
      <div className="scene-object">
        {webgl === false || lost ? (
          <StaticCompass label="" />
        ) : webgl ? (
          <Canvas
            key={key}
            shadows="percentage"
            dpr={[1, 1.75]}
            frameloop={visible ? "demand" : "never"}
            camera={{ position: pose.cam, fov: 30 }}
            gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
            onCreated={({ gl, camera }) => {
              camera.lookAt(0, 0.3, 0);
              gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setLost(true); });
              gl.domElement.addEventListener("webglcontextrestored", () => { setLost(false); setKey((k) => k + 1); });
            }}
          >
            <StudioEnvironment intensity={0.85} />
            <directionalLight ref={light} position={[3, 6, 2]} intensity={pose.light} castShadow shadow-mapSize={[512, 512]} />
            <Director pose={pose} reduced={reduced} object={object} light={light} />
            <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={5} blur={2.4} far={2} resolution={256} frames={1} />
          </Canvas>
        ) : null}
      </div>
    </div>
  );
}
