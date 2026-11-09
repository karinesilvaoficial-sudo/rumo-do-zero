"use client";
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { forwardRef, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * Bússola RUMO — geometria procedural (sem assets externos):
 *  • base em cerâmica branca (LatheGeometry com chanfro) com clearcoat;
 *  • anel externo em metal escovado (anisotropia + microtextura gerada em canvas);
 *  • escala de 72 marcações instanciadas;
 *  • agulha bicolor (azul elétrico / azul profundo) — mesma forma do símbolo da marca;
 *  • núcleo azul elétrico com leve emissão.
 * Materiais PBR em espaço linear; saída sRGB e tone mapping configurados no Canvas.
 */

/** Ambiente de estúdio procedural (RoomEnvironment → PMREM). Descartado ao desmontar. */
export function StudioEnvironment({ intensity = 1 }: { intensity?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.035);
    scene.environment = rt.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
      room.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
    };
  }, [gl, scene, intensity]);
  return null;
}

/** Microtextura de metal escovado (riscos concêntricos) para rugosidade/anisotropia. */
function useBrushedTexture(size = 512) {
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.fillStyle = "#7a7a7a";
    g.fillRect(0, 0, size, size);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // riscos finos ao longo de v: no LatheGeometry viram anéis concêntricos (metal torneado/escovado)
    for (let y = 0; y < size; y++) {
      const v = 122 + Math.round((rnd() - 0.5) * 26);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.globalAlpha = 0.35 + rnd() * 0.4;
      g.fillRect(0, y, size, 1);
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }, [size]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

function ceramicProfile(): THREE.Vector2[] {
  // perfil (raio, altura) com chanfros suaves
  const pts: [number, number][] = [[0, 0], [1.38, 0], [1.46, 0.03], [1.5, 0.1], [1.5, 0.2], [1.46, 0.27], [1.36, 0.3], [0, 0.3]];
  return pts.map(([x, y]) => new THREE.Vector2(x, y));
}

function ringProfile(r0: number, r1: number, h: number): THREE.Vector2[] {
  const b = 0.018;
  return [[r0 + b, 0], [r1 - b, 0], [r1, b], [r1, h - b], [r1 - b, h], [r0 + b, h], [r0, h - b], [r0, b], [r0 + b, 0]].map(([x, y]) => new THREE.Vector2(x, y));
}

export type CompassProps = { accent?: string; heading?: number; idleSpin?: boolean; castShadow?: boolean; quality?: "high" | "low" };

export const Compass = forwardRef<THREE.Group, CompassProps & ThreeElements["group"]>(function Compass(
  { accent = "#1F57FF", heading = 0, idleSpin = true, castShadow = true, quality = "high", ...props }, ref) {
  const brushed = useBrushedTexture(quality === "high" ? 512 : 256);
  const needle = useRef<THREE.Group>(null);
  const ticks = useRef<THREE.InstancedMesh>(null);

  const geo = useMemo(() => {
    const base = new THREE.LatheGeometry(ceramicProfile(), 128);
    const outer = new THREE.LatheGeometry(ringProfile(1.32, 1.5, 0.42), 160);
    const inner = new THREE.LatheGeometry(ringProfile(1.02, 1.08, 0.36), 128);
    // metade esquerda/direita para as duas cores
    const half = (side: 1 | -1) => {
      const s = new THREE.Shape();
      s.moveTo(0, 1.05);
      s.lineTo(0.17 * side, -0.42);
      s.lineTo(0, -0.18);
      s.closePath();
      return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 2 });
    };
    const tick = new THREE.BoxGeometry(0.012, 0.012, 0.09);
    const core = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 48);
    return { base, outer, inner, left: half(-1), right: half(1), tick, core };
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const mats = useMemo(() => ({
    ceramic: new THREE.MeshPhysicalMaterial({ color: "#fbfcfe", roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.18, sheen: 0.2, sheenColor: new THREE.Color("#dfe7ff") }),
    metal: new THREE.MeshPhysicalMaterial({ color: "#c9ced8", metalness: 1, roughness: 0.34, anisotropy: 0.6, anisotropyRotation: Math.PI / 2 }),
    dark: new THREE.MeshPhysicalMaterial({ color: "#0B1F4D", metalness: 0.4, roughness: 0.35, clearcoat: 0.6 }),
    accent: new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.2, roughness: 0.28, clearcoat: 1, emissive: new THREE.Color(accent), emissiveIntensity: 0.08 }),
    core: new THREE.MeshPhysicalMaterial({ color: accent, emissive: new THREE.Color(accent), emissiveIntensity: 0.9, roughness: 0.15, metalness: 0 }),
    tick: new THREE.MeshStandardMaterial({ color: "#52627A", metalness: 0.6, roughness: 0.4 }),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mats.accent.color.set(accent);
    mats.accent.emissive.set(accent);
    mats.core.color.set(accent);
    mats.core.emissive.set(accent);
  }, [accent, mats]);
  useEffect(() => {
    if (brushed) {
      mats.metal.roughnessMap = brushed;
      mats.metal.needsUpdate = true;
    }
  }, [brushed, mats]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useEffect(() => {
    const im = ticks.current;
    if (!im) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const long = i % 6 === 0;
      m.compose(new THREE.Vector3(Math.sin(a) * 1.2, 0.33, Math.cos(a) * 1.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(long ? 2.4 : 1, 1, long ? 1.8 : 1));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  }, []);

  // agulha estabiliza suavemente no rumo indicado (amortecimento crítico)
  const vel = useRef(0);
  useFrame((_, dt) => {
    const n = needle.current;
    if (!n) return;
    const t = Math.min(dt, 1 / 30);
    const target = heading + (idleSpin ? Math.sin(performance.now() / 2600) * 0.06 : 0);
    const k = 18, c = 2 * Math.sqrt(k);
    vel.current += (-(n.rotation.y - target) * k - vel.current * c) * t;
    n.rotation.y += vel.current * t;
  });

  return (
    <group ref={ref} {...props}>
      <mesh geometry={geo.base} material={mats.ceramic} castShadow={castShadow} receiveShadow />
      <mesh geometry={geo.outer} material={mats.metal} castShadow={castShadow} receiveShadow />
      <mesh geometry={geo.inner} material={mats.metal} position={[0, 0.0, 0]} />
      <instancedMesh ref={ticks} args={[geo.tick, mats.tick, 72]} />
      <group ref={needle} position={[0, 0.44, 0]} scale={1.18}>
        <mesh geometry={geo.left} material={mats.accent} rotation={[-Math.PI / 2, 0, 0]} castShadow={castShadow} />
        <mesh geometry={geo.right} material={mats.dark} rotation={[-Math.PI / 2, 0, 0]} castShadow={castShadow} />
      </group>
      <mesh geometry={geo.core} material={mats.metal} position={[0, 0.44, 0]} />
      <mesh geometry={geo.core} material={mats.core} position={[0, 0.49, 0]} scale={[0.55, 0.4, 0.55]} />
    </group>
  );
});
