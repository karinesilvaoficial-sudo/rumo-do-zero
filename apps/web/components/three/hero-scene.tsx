/* eslint-disable react-hooks/immutability -- objetos Three.js (câmera, luzes, materiais, cena) são mutáveis por design; alterados apenas em efeitos e quadros, nunca durante a renderização React. */
"use client";
import { ContactShadows, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, Physics, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Compass, StudioEnvironment } from "./compass";
import { StaticCompass } from "./static-compass";
import { hasWebGL, usePageVisible, useReducedMotion } from "./webgl";

/**
 * Cena da página pública. Interação física (Rapier): três marcadores de meta podem ser
 * arrastados e soltos; acomodam-se com colisões suaves ao redor da bússola. Poucos corpos,
 * colisores simplificados, passo fixo de 1/60 s e corpos dormem quando param.
 * A física nunca altera dados financeiros nem controles da interface.
 */
const MARKERS = [
  { id: "m1", color: "#1F57FF", start: [-1.9, 1.6, 0.9] as const },
  { id: "m2", color: "#0B1F4D", start: [1.8, 2.1, 0.6] as const },
  { id: "m3", color: "#6F8FE8", start: [0.4, 2.6, 1.9] as const },
];

function Marker({ color, start, dragging, onGrab }: { color: string; start: readonly [number, number, number]; dragging: boolean; onGrab: (b: RapierRigidBody) => void }) {
  const body = useRef<RapierRigidBody>(null);
  const geo = useMemo(() => ({ disc: new THREE.CylinderGeometry(0.26, 0.26, 0.09, 48), core: new THREE.CylinderGeometry(0.1, 0.1, 0.1, 32) }), []);
  const mats = useMemo(() => ({
    metal: new THREE.MeshPhysicalMaterial({ color: "#d3d8e1", metalness: 1, roughness: 0.28 }),
    core: new THREE.MeshPhysicalMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.35, roughness: 0.2, clearcoat: 1 }),
  }), [color]);
  useEffect(() => () => { Object.values(geo).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); }, [geo, mats]);
  return (
    <RigidBody ref={body} colliders={false} position={[...start]} linearDamping={dragging ? 6 : 0.6} angularDamping={1.2} restitution={0.15} friction={0.9} canSleep>
      <CylinderCollider args={[0.045, 0.26]} />
      <group
        onPointerDown={(e) => { e.stopPropagation(); (e.target as Element | null)?.setPointerCapture?.(e.pointerId); if (body.current) onGrab(body.current); }}
        onPointerOver={() => { document.body.style.cursor = "grab"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}
      >
        <mesh geometry={geo.disc} material={mats.metal} castShadow />
        <mesh geometry={geo.core} material={mats.core} position={[0, 0.01, 0]} />
      </group>
    </RigidBody>
  );
}

function DragController({ grabbed, release }: { grabbed: RapierRigidBody | null; release: () => void }) {
  const { raycaster, pointer, camera } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const up = () => { document.body.style.cursor = ""; release(); };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [release]);
  useFrame(() => {
    if (!grabbed) return;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    hit.x = THREE.MathUtils.clamp(hit.x, -2.6, 2.6);
    hit.z = THREE.MathUtils.clamp(hit.z, -1.8, 2.4);
    const p = grabbed.translation();
    grabbed.wakeUp();
    grabbed.setLinvel({ x: (hit.x - p.x) * 12, y: (hit.y - p.y) * 12, z: (hit.z - p.z) * 12 }, true);
  });
  return null;
}

function Rig({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ pointer }, dt) => {
    if (reduced || !group.current) return;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, pointer.x * 0.18, 3, dt);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -pointer.y * 0.06, 3, dt);
  });
  return <group ref={group}><Compass position={[0, 0, 0]} heading={-0.35} idleSpin={!reduced} /></group>;
}

export default function HeroScene() {
  const [webgl] = useState<boolean>(() => hasWebGL());
  const [dpr, setDpr] = useState(1.5);
  const [grabbed, setGrabbed] = useState<RapierRigidBody | null>(null);
  const [lost, setLost] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const active = visible && inView;
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0 }}>
      {webgl === false || lost ? (
        <div style={{ position: "absolute", inset: "12%" }}><StaticCompass /></div>
      ) : webgl ? (
        <Canvas
          key={resetKey}
          shadows="percentage"
          dpr={[1, dpr]}
          frameloop={active ? "always" : "never"}
          camera={{ position: [0, 4.4, 7.2], fov: 30, near: 0.1, far: 40 }}
          gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace, toneMappingExposure: 1.05 }}
          onCreated={({ gl, camera }) => {
            camera.lookAt(0, 0.35, 0);
            gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setLost(true); });
            gl.domElement.addEventListener("webglcontextrestored", () => { setLost(false); setResetKey((k) => k + 1); });
          }}
          aria-hidden
        >
          <PerformanceMonitor onIncline={() => setDpr(2)} onDecline={() => setDpr(1)} />
          <color attach="background" args={["#eef3ff"]} />
          <StudioEnvironment intensity={0.9} />
          <directionalLight position={[3.5, 6, 2.5]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}
            shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} />
          <ambientLight intensity={0.25} />
          <Suspense fallback={null}>
            <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={!active}>
              <Rig reduced={reduced} />
              {/* colisor da bússola (estático) e plinto */}
              <RigidBody type="fixed" colliders={false}>
                <CylinderCollider args={[0.21, 1.5]} position={[0, 0.21, 0]} />
                <CuboidCollider args={[6, 0.1, 6]} position={[0, -0.1, 0]} />
                <CuboidCollider args={[0.1, 2, 4]} position={[-3, 1, 0]} />
                <CuboidCollider args={[0.1, 2, 4]} position={[3, 1, 0]} />
                <CuboidCollider args={[4, 2, 0.1]} position={[0, 1, -2.2]} />
                <CuboidCollider args={[4, 2, 0.1]} position={[0, 1, 2.8]} />
              </RigidBody>
              {MARKERS.map((m) => (
                <Marker key={m.id} color={m.color} start={m.start} dragging={false} onGrab={setGrabbed} />
              ))}
              <DragController grabbed={grabbed} release={() => setGrabbed(null)} />
            </Physics>
          </Suspense>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]}>
            <planeGeometry args={[14, 14]} />
            <shadowMaterial opacity={0.12} />
          </mesh>
          <ContactShadows position={[0, 0.001, 0]} opacity={0.42} scale={7} blur={2.6} far={2.5} resolution={512} frames={reduced ? 1 : Infinity} />
        </Canvas>
      ) : null}
    </div>
  );
}
