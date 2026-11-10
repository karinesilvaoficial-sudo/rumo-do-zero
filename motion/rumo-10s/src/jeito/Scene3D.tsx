import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useThree} from '@react-three/fiber';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {interpolate, random, useCurrentFrame} from 'remotion';
import {BEATS, FREEZE_SLOW, ORGANIZE, SKELETON} from './edl';
import {cardFace, coinEdge, coinFace, receipt} from './textures';
import {drawScreen, H as SH, W as SW} from './screen';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eOut = (x: number) => 1 - Math.pow(1 - x, 3);
const p01 = (f: number, a: number, b: number) => Math.min(1, Math.max(0, (f - a) / (b - a)));

/** Simulation time: runs, slows down and stops (time-freeze), then holds. */
const simTime = (f: number) => {
  if (f <= FREEZE_SLOW.from) return f;
  const d = FREEZE_SLOW.to - FREEZE_SLOW.from;
  const t = Math.min(f - FREEZE_SLOW.from, d) / d;
  return FREEZE_SLOW.from + d * (t - (t * t) / 2); // velocity decays linearly to 0
};
const T_FROZEN = simTime(9999);

type Chaos = {x: number; y: number; z: number; v: number; rx: number; ry: number; rz: number; sx: number; sw: number};
const chaosOf = (kind: string, i: number): Chaos => {
  const r = (k: string) => random(`${kind}${i}${k}`);
  const v = 0.035 + r('v') * 0.035;
  const targetY = -3.6 + r('y') * 8.2; // where it sits when time freezes
  return {
    x: -2.6 + r('x') * 5.2,
    y: targetY + v * T_FROZEN,
    z: -5 + r('z') * 7.5,
    v,
    rx: (r('a') - 0.5) * 0.12,
    ry: (r('b') - 0.5) * 0.12,
    rz: (r('c') - 0.5) * 0.1,
    sx: r('s') * 6,
    sw: 0.2 + r('w') * 0.5,
  };
};
const chaosPose = (c: Chaos, t: number) => ({
  pos: new THREE.Vector3(c.x + Math.sin(t / 20 + c.sx) * c.sw, c.y - c.v * t, c.z),
  rot: new THREE.Euler(c.sx + c.rx * t, c.sx * 2 + c.ry * t, c.rz * t),
});

const Env: React.FC = () => {
  const {gl, scene} = useThree();
  useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
  }, [gl, scene]);
  return null;
};

const Rig: React.FC = () => {
  const f = useCurrentFrame();
  const {camera} = useThree();
  // handheld shake in chaos, locked off after the freeze
  const shake = interpolate(f, [0, 90, 100], [1, 1, 0], clamp);
  const z = interpolate(f, [0, 90, 165, 200, 330, 380, 450], [15, 13.2, 11.5, 13, 12.6, 14.5, 14.8], {...clamp, easing: ease});
  const orbit = interpolate(f, [90, 165], [0, 0.18], {...clamp, easing: ease}) * (f < 200 ? 1 : interpolate(f, [200, 240], [1, 0], clamp));
  camera.position.set(
    Math.sin(orbit) * z + Math.sin(f / 7) * 0.06 * shake,
    0.2 + Math.cos(f / 9) * 0.05 * shake,
    Math.cos(orbit) * z,
  );
  camera.lookAt(0, 0.1, 0);
  (camera as THREE.PerspectiveCamera).fov = 35;
  (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  return null;
};

/* ------------------------------- geometries ------------------------------- */
const roundedRect = (w: number, h: number, r: number) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
};
/** ShapeGeometry with 0..1 UVs. */
const faceGeo = (w: number, h: number, r: number) => {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 12);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
};

const N_COINS = 18;
const N_CARDS = 5;
const N_BILLS = 6;
const COIN_R = 0.4;
const COIN_T = 0.085;

/** Organized target: two growing stacks flanking the phone. */
const stackTarget = (i: number) => {
  const left = i % 2 === 0;
  const k = Math.floor(i / 2);
  return new THREE.Vector3(left ? -1.95 : 1.95, -3.0 + k * (COIN_T + 0.012) * (left ? 1 : 1.25), -0.8);
};

export const Scene3D: React.FC = () => {
  const f = useCurrentFrame();
  const t = simTime(f);

  const assets = useMemo(() => {
    const face = coinFace();
    const edgeBump = coinEdge();
    edgeBump.wrapS = THREE.RepeatWrapping;
    const gold = new THREE.MeshStandardMaterial({color: '#F2B54A', metalness: 1, roughness: 0.28, bumpMap: edgeBump, bumpScale: 0.6});
    const goldFace = new THREE.MeshStandardMaterial({map: face, metalness: 0.95, roughness: 0.3, bumpMap: face, bumpScale: 1.2});
    const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_T, 72, 1);
    const cardBody = new THREE.ExtrudeGeometry(roundedRect(1.7, 1.07, 0.09), {depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10});
    cardBody.translate(0, 0, -0.01);
    const cardFaceGeo = faceGeo(1.7, 1.07, 0.09);
    const cardMats = [0, 1, 2].map((v) => new THREE.MeshPhysicalMaterial({map: cardFace(v), roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08}));
    const cardEdge = new THREE.MeshStandardMaterial({color: '#1B2B44', metalness: 0.5, roughness: 0.4});
    const billGeo = new THREE.PlaneGeometry(1.0, 1.48, 8, 8);
    // slight paper curl
    const bp = billGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.sin(bp.getY(i) * 2) * 0.06 + bp.getX(i) * bp.getX(i) * 0.08);
    billGeo.computeVertexNormals();
    const billMats = [0, 1, 2, 3].map((v) => new THREE.MeshStandardMaterial({map: receipt(v), roughness: 0.85, side: THREE.DoubleSide, transparent: true}));
    // phone
    const PW = 2.55;
    const PH = 5.25;
    const phoneBody = new THREE.ExtrudeGeometry(roundedRect(PW, PH, 0.42), {depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 6, curveSegments: 24});
    phoneBody.translate(0, 0, -0.1);
    const titanium = new THREE.MeshPhysicalMaterial({color: '#3A4A62', metalness: 1, roughness: 0.22, clearcoat: 0.6, transparent: true});
    const glassBlack = new THREE.MeshPhysicalMaterial({color: '#02060C', roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true});
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = SW;
    screenCanvas.height = SH;
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.anisotropy = 8;
    const screenMat = new THREE.MeshBasicMaterial({map: screenTex, toneMapped: false, transparent: true});
    const screenGeo = faceGeo(PW - 0.18, PH - 0.18, 0.34);
    const glassGeo = faceGeo(PW - 0.04, PH - 0.04, 0.4);
    const camBump = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 32);
    return {gold, goldFace, coinGeo, cardBody, cardFaceGeo, cardMats, cardEdge, billGeo, billMats, phoneBody, titanium, glassBlack, screenCanvas, screenTex, screenMat, screenGeo, glassGeo, camBump};
  }, []);

  // live UI texture
  drawScreen(assets.screenCanvas.getContext('2d')!, f, SKELETON.from, SKELETON.to);
  assets.screenTex.needsUpdate = true;

  const org = ease(p01(f, ORGANIZE.from, ORGANIZE.to));
  const brand = ease(p01(f, BEATS.brand.from, BEATS.brand.from + 40));

  /* ---------------------------------- phone --------------------------------- */
  const pin = eOut(p01(f, BEATS.ai.from - 8, BEATS.ai.from + 30));
  const phoneY = interpolate(pin, [0, 1], [-9, -0.38]) + Math.sin(f / 24) * 0.04 - brand * 1.2;
  const phoneRotY = interpolate(pin, [0, 1], [Math.PI * 0.9, 0]) + Math.sin(f / 40) * 0.03 + brand * 0.5;
  const phoneRotX = interpolate(pin, [0, 1], [0.5, 0.04]);
  const phoneZ = 0.6 - brand * 4;
  const phoneOp = 1 - p01(f, BEATS.brand.from + 6, BEATS.brand.from + 34);
  assets.titanium.opacity = phoneOp;
  assets.glassBlack.opacity = phoneOp;
  assets.screenMat.opacity = phoneOp;

  return (
    <>
      <Env />
      <Rig />
      <ambientLight intensity={0.15} />
      <directionalLight position={[4, 6, 6]} intensity={2.2} color="#DDEBFF" />
      <pointLight position={[-4, -2, 3]} intensity={30} color="#0A90FF" distance={14} />
      <pointLight position={[3, 3, -3]} intensity={25} color="#36DDFF" distance={12} />
      <pointLight position={[0, -4, 4]} intensity={12} color="#FFBF55" distance={10} />

      {/* COINS: chaos -> frozen -> organized stacks -> orbit ring around the brand */}
      {new Array(N_COINS).fill(0).map((_, i) => {
        const c = chaosOf('coin', i);
        const pose = chaosPose(c, t);
        const delay = (i % 9) * 2.5;
        const k = ease(p01(f, ORGANIZE.from + delay, ORGANIZE.to + delay));
        const target = stackTarget(i);
        const pos = pose.pos.clone().lerp(target, k);
        // little hop as it lands on the stack
        pos.y += Math.sin(k * Math.PI) * 1.2;
        const rx = interpolate(k, [0, 1], [pose.rot.x, 0]);
        const ry = interpolate(k, [0, 1], [pose.rot.y, i * 0.7]);
        const rz = interpolate(k, [0, 1], [pose.rot.z, 0]);
        // brand: rise into a tilted orbit ring
        const bd = ease(p01(f, BEATS.brand.from + i * 1.2, BEATS.brand.from + 36 + i * 1.2));
        const ang = (i / N_COINS) * Math.PI * 2 + (f - BEATS.brand.from) * 0.018;
        const ring = new THREE.Vector3(Math.cos(ang) * 3.0, 2.75 + Math.sin(ang) * 0.32, Math.sin(ang) * 1.4 - 3.2);
        pos.lerp(ring, bd);
        return (
          <group key={`c${i}`} position={pos} scale={1 - bd * 0.25} rotation={[rx + bd * (Math.PI / 2 - 0.2), ry + bd * ang, rz]}>
            <mesh geometry={assets.coinGeo} material={[assets.gold, assets.goldFace, assets.goldFace]} />
          </group>
        );
      })}

      {/* CARDS: tumble in chaos, then fan neatly behind the phone and recede */}
      {new Array(N_CARDS).fill(0).map((_, i) => {
        const c = chaosOf('card', i);
        const pose = chaosPose(c, t);
        const fan = new THREE.Vector3((i - 2) * 0.55, 1.2 + Math.abs(i - 2) * -0.15, -3.2);
        const pos = pose.pos.clone().lerp(fan, org);
        const out = p01(f, 250, 290);
        pos.z -= out * 6;
        const mat = assets.cardMats[i % 3];
        return (
          <group key={`k${i}`} position={pos} rotation={[pose.rot.x * (1 - org), pose.rot.y * (1 - org), pose.rot.z * (1 - org) + org * (i - 2) * -0.18]} scale={1 - out * 0.4} visible={out < 1}>
            <mesh geometry={assets.cardBody} material={assets.cardEdge} />
            <mesh geometry={assets.cardFaceGeo} material={mat} position={[0, 0, 0.022]} />
          </group>
        );
      })}

      {/* BILLS: fly around in chaos, then get swept away into the distance */}
      {new Array(N_BILLS).fill(0).map((_, i) => {
        const c = chaosOf('bill', i);
        const pose = chaosPose(c, t * 1.2);
        const k = ease(p01(f, ORGANIZE.from - 16 + i * 2, ORGANIZE.from + 14 + i * 2));
        const pos = pose.pos.clone().add(new THREE.Vector3((i % 2 ? 1 : -1) * 7 * k, 2 * k, -10 * k));
        const m = assets.billMats[i % 4];
        m.opacity = 1 - k;
        return k >= 1 ? null : (
          <mesh key={`b${i}`} geometry={assets.billGeo} material={m} position={pos} rotation={[pose.rot.x * 0.6, pose.rot.y, pose.rot.z + k * 3]} />
        );
      })}

      {/* PHONE */}
      {pin > 0 && phoneOp > 0 && (
        <group scale={0.93} position={[0, phoneY, phoneZ]} rotation={[phoneRotX, phoneRotY, 0]}>
          <mesh geometry={assets.phoneBody} material={assets.titanium} />
          <mesh geometry={assets.glassGeo} material={assets.glassBlack} position={[0, 0, 0.152]} />
          <mesh geometry={assets.screenGeo} material={assets.screenMat} position={[0, 0, 0.156]} />
          <mesh geometry={assets.camBump} material={assets.glassBlack} position={[-0.75, 2.0, -0.17]} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={assets.camBump} material={assets.glassBlack} position={[-0.38, 2.0, -0.17]} rotation={[Math.PI / 2, 0, 0]} />
        </group>
      )}
    </>
  );
};
