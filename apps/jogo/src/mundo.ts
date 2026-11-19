import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { semente, suave } from './util';
import { criarTexturas, repetir } from './texturas';

export const TAMANHO = 220;
export const METADE = TAMANHO / 2;
const MARGEM = 2;

export type Circulo = { x: number; z: number; r: number };
export type Caixa = { minX: number; maxX: number; minZ: number; maxZ: number; topo: number };

export function altura(x: number, z: number) {
  const ondas = 2.2 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05) + 1.1 * Math.sin(x * 0.11 + z * 0.07) + 0.45 * Math.sin(z * 0.21 - x * 0.13);
  return ondas;
}

// Deforma uma geometria com ruído que depende só da posição: vértices duplicados
// (geometria sem índice) recebem o mesmo deslocamento e a malha não abre frestas.
function amassar(geo: THREE.BufferGeometry, forca: number, achatar = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const k = 1 - forca / 2 + (n - Math.floor(n)) * forca;
    p.setXYZ(i, x * k, y * k * achatar, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export function criarMundo(cena: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const tx = criarTexturas();
  const rnd = semente(2026);
  const circulos: Circulo[] = [];
  const caixas: Caixa[] = [];
  const solidos: THREE.Object3D[] = [];
  const paredes: THREE.Object3D[] = []; // só as caixas: usadas para a câmera não atravessar parede

  // Céu, sol e neblina de fim de tarde.
  const sol = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(68), THREE.MathUtils.degToRad(215));
  const ceu = new Sky();
  ceu.scale.setScalar(4000);
  const u = ceu.material.uniforms;
  u.turbidity.value = 3.5;
  u.rayleigh.value = 1.1;
  u.mieCoefficient.value = 0.003;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sol);
  cena.add(ceu);
  cena.fog = new THREE.Fog(0xc9b79a, 70, 340);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const cenaCeu = new THREE.Scene();
  cenaCeu.add(ceu.clone());
  cena.environment = pmrem.fromScene(cenaCeu, 0.02).texture;
  cena.environmentIntensity = 0.55;

  cena.add(new THREE.HemisphereLight(0xcfe0ff, 0x5a4a32, 0.55));
  const luzSol = new THREE.DirectionalLight(0xffe2b8, 3.1);
  luzSol.castShadow = true;
  luzSol.shadow.mapSize.set(2048, 2048);
  luzSol.shadow.bias = -0.0004;
  luzSol.shadow.normalBias = 0.04;
  const sc = luzSol.shadow.camera;
  sc.left = sc.bottom = -45;
  sc.right = sc.top = 45;
  sc.near = 1;
  sc.far = 220;
  cena.add(luzSol, luzSol.target);

  // Terreno: malha de 150 m com relevo e mistura grama/terra por vértice.
  const geo = new THREE.PlaneGeometry(TAMANHO + 60, TAMANHO + 60, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  const manchas = semente(5);
  const fases = [manchas() * 6, manchas() * 6, manchas() * 6];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, altura(x, z));
    const seco = suave(0.35, 0.8, 0.5 + 0.5 * Math.sin(x * 0.07 + fases[0]) * Math.cos(z * 0.06 + fases[1]) + 0.2 * Math.sin((x + z) * 0.19 + fases[2]));
    const t = seco * 0.8;
    cores[i * 3] = 1 + t * 0.35;
    cores[i * 3 + 1] = 1 - t * 0.18;
    cores[i * 3 + 2] = 1 - t * 0.3;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.computeVertexNormals();
  const chao = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ ...repetir(tx.grama, 56, 56), vertexColors: true, roughness: 0.95 }));
  chao.receiveShadow = true;
  cena.add(chao);
  solidos.push(chao);

  const livre = (x: number, z: number, r: number) =>
    Math.hypot(x, z + 16) > 4 + r &&
    circulos.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + r + 0.6) &&
    caixas.every((c) => x < c.minX - r - 0.6 || x > c.maxX + r + 0.6 || z < c.minZ - r - 0.6 || z > c.maxZ + r + 0.6);

  function sortear(r: number, alcance = METADE - MARGEM - 3): [number, number] | null {
    for (let i = 0; i < 40; i++) {
      const x = (rnd() * 2 - 1) * alcance;
      const z = (rnd() * 2 - 1) * alcance;
      if (livre(x, z, r)) return [x, z];
    }
    return null;
  }

  function bloco(x: number, z: number, lx: number, ly: number, lz: number, material: THREE.Material, enterrar = 0.4) {
    const base = Math.min(altura(x - lx / 2, z - lz / 2), altura(x + lx / 2, z - lz / 2), altura(x - lx / 2, z + lz / 2), altura(x + lx / 2, z + lz / 2));
    const topo = Math.max(altura(x, z), base) + ly;
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, topo - base + enterrar, lz), material);
    m.position.set(x, (topo + base - enterrar) / 2, z);
    m.castShadow = m.receiveShadow = true;
    cena.add(m);
    solidos.push(m);
    paredes.push(m);
    caixas.push({ minX: x - lx / 2, maxX: x + lx / 2, minZ: z - lz / 2, maxZ: z + lz / 2, topo });
    return m;
  }

  // Muro do perímetro: o limite dos 150 m.
  const matMuro = new THREE.MeshStandardMaterial({ ...repetir(tx.concreto, 56, 1.4), color: 0xb9b1a2, roughness: 0.9 });
  for (const [x, z, lx, lz] of [[0, -METADE, TAMANHO + 2, 1.2], [0, METADE, TAMANHO + 2, 1.2], [-METADE, 0, 1.2, TAMANHO + 2], [METADE, 0, 1.2, TAMANHO + 2]]) {
    bloco(x, z, lx, 7.5, lz, matMuro, 6);
  }

  // Contêineres.
  const coresConteiner = [0xb5482a, 0x2f6f8f, 0x4d7a3a, 0xc9a227, 0x7a7d82, 0x8b3f5e];
  const matConteiner = coresConteiner.map((c) => new THREE.MeshStandardMaterial({ ...repetir(tx.chapa, 2, 1), color: c, roughness: 0.55, metalness: 0.5 }));
  for (let i = 0; i < 30; i++) {
    const deitado = rnd() > 0.5;
    const [lx, lz] = deitado ? [6.1, 2.44] : [2.44, 6.1];
    const p = sortear(4);
    if (!p) continue;
    bloco(p[0], p[1], lx, 2.6, lz, matConteiner[i % matConteiner.length]);
    if (rnd() > 0.65) {
      // segundo contêiner empilhado
      const topo = caixas[caixas.length - 1].topo;
      const m = new THREE.Mesh(new THREE.BoxGeometry(lx, 2.6, lz), matConteiner[(i + 2) % matConteiner.length]);
      m.position.set(p[0] + (deitado ? 0.6 : 0), topo + 1.3, p[1] + (deitado ? 0 : 0.6));
      m.castShadow = m.receiveShadow = true;
      cena.add(m);
      solidos.push(m);
      caixas[caixas.length - 1].topo = topo + 2.6;
    }
  }

  // Ruínas: paredes de concreto com vãos de porta.
  const matParede = new THREE.MeshStandardMaterial({ ...repetir(tx.concreto, 2, 1), roughness: 0.88 });
  for (const [cx, cz] of [[-38, -30], [34, 36], [40, -42], [-44, 40], [-82, 8], [78, -6], [6, 84], [-10, -86], [84, 78], [-80, -78]]) {
    const L = 11;
    const P = 8;
    const A = 3.4;
    bloco(cx - L / 2, cz, 0.5, A, P, matParede);
    bloco(cx + L / 2, cz - 2.2, 0.5, A, P - 4.4, matParede);
    bloco(cx - 2.6, cz - P / 2, L - 5.2, A, 0.5, matParede);
    bloco(cx + 1.2, cz + P / 2, L - 2.4, A * 0.55, 0.5, matParede);
    circulos.push({ x: cx, z: cz, r: 0 }); // reserva a área interna
  }

  // Barreiras baixas, boas para cobertura.
  const matBarreira = new THREE.MeshStandardMaterial({ ...repetir(tx.concreto, 1.5, 0.5), color: 0xd8d2c4, roughness: 0.85 });
  for (let i = 0; i < 44; i++) {
    const p = sortear(2.5);
    if (!p) continue;
    const ao = rnd() > 0.5;
    bloco(p[0], p[1], ao ? 3.6 : 0.6, 1.05, ao ? 0.6 : 3.6, matBarreira);
  }

  // Caixotes em grupos; os baixos servem de degrau.
  const matCaixote = new THREE.MeshStandardMaterial({ ...tx.caixote, roughness: 0.8 });
  for (let g = 0; g < 52; g++) {
    const p = sortear(2.2);
    if (!p) continue;
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const lado = 0.9 + rnd() * 0.5;
      const x = p[0] + (i === 0 ? 0 : (rnd() - 0.5) * 3.2);
      const z = p[1] + (i === 0 ? 0 : (rnd() - 0.5) * 3.2);
      if (i > 0 && !livre(x, z, lado * 0.6)) continue;
      bloco(x, z, lado, lado, lado, matCaixote, 0.3);
    }
  }

  // Torre central: marco visível de qualquer ponto do mapa.
  const matAco = new THREE.MeshStandardMaterial({ ...repetir(tx.metal, 1, 4), color: 0x9a8f80, metalness: 0.8, roughness: 0.45 });
  const torre = new THREE.Group();
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 14, 8), matAco);
    perna.position.set(dx, 7, dz);
    torre.add(perna);
  }
  for (const y of [3.5, 7, 10.5]) {
    for (const [lx, lz, px, pz] of [[2.2, 0.08, 0, -1.1], [2.2, 0.08, 0, 1.1], [0.08, 2.2, -1.1, 0], [0.08, 2.2, 1.1, 0]]) {
      const travessa = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.08, lz), matAco);
      travessa.position.set(px, y, pz);
      torre.add(travessa);
    }
  }
  const plataforma = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 3.2), matAco);
  plataforma.position.y = 14;
  const tanque = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 20), new THREE.MeshStandardMaterial({ ...repetir(tx.chapa, 3, 1), color: 0xa8552e, metalness: 0.5, roughness: 0.55 }));
  tanque.position.y = 15.45;
  const farol = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
  farol.position.y = 17;
  torre.add(plataforma, tanque, farol);
  torre.position.set(0, 0, -16);
  torre.traverse((o) => ((o.castShadow = true), (o.receiveShadow = true)));
  cena.add(torre);
  for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) circulos.push({ x: dx, z: -16 + dz, r: 0.2 });

  // Árvores: tronco e três copas, instanciadas.
  const N_ARV = 260;
  const troncoGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 7);
  troncoGeo.translate(0, 0.5, 0);
  const copaGeo = amassar(new THREE.IcosahedronGeometry(1, 2), 0.3, 0.85);
  const troncos = new THREE.InstancedMesh(troncoGeo, new THREE.MeshStandardMaterial({ ...repetir(tx.casca, 2, 3), roughness: 1 }), N_ARV);
  const copas = new THREE.InstancedMesh(copaGeo, new THREE.MeshStandardMaterial({ ...repetir(tx.folhas, 3, 3), roughness: 0.9, flatShading: true }), N_ARV * 3);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eixoY = new THREE.Vector3(0, 1, 0);
  const tom = new THREE.Color();
  let nArv = 0;
  for (let i = 0; i < N_ARV; i++) {
    const p = sortear(0.9);
    if (!p) continue;
    const h = 3.2 + rnd() * 3.4;
    const y = altura(p[0], p[1]) - 0.15;
    q.setFromAxisAngle(eixoY, rnd() * 6.28);
    troncos.setMatrixAt(nArv, m4.compose(new THREE.Vector3(p[0], y, p[1]), q, new THREE.Vector3(1 + h * 0.12, h, 1 + h * 0.12)));
    for (let c = 0; c < 3; c++) {
      const r = (1.5 - c * 0.3) * (0.8 + rnd() * 0.4) * (h / 5);
      const desloc = c === 0 ? 0 : 0.7;
      m4.compose(new THREE.Vector3(p[0] + (rnd() - 0.5) * desloc * 2, y + h * (0.8 + c * 0.22), p[1] + (rnd() - 0.5) * desloc * 2), q, new THREE.Vector3(r, r, r));
      copas.setMatrixAt(nArv * 3 + c, m4);
      copas.setColorAt(nArv * 3 + c, tom.setHSL(0.22 + rnd() * 0.08, 0.5, 0.42 + rnd() * 0.2));
    }
    circulos.push({ x: p[0], z: p[1], r: 0.38 });
    nArv++;
  }
  troncos.count = nArv;
  copas.count = nArv * 3;
  for (const im of [troncos, copas]) {
    im.castShadow = im.receiveShadow = true;
    cena.add(im);
  }
  solidos.push(troncos);

  // Pedras.
  const pedraGeo = amassar(new THREE.DodecahedronGeometry(1, 1), 0.36);
  const pedras = new THREE.InstancedMesh(pedraGeo, new THREE.MeshStandardMaterial({ ...repetir(tx.pedra, 2, 2), roughness: 0.95, flatShading: true }), 90);
  let nPedra = 0;
  for (let i = 0; i < 90; i++) {
    const r = 0.5 + rnd() * rnd() * 1.9;
    const p = sortear(r);
    if (!p) continue;
    q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 6, rnd() * 3));
    pedras.setMatrixAt(nPedra++, m4.compose(new THREE.Vector3(p[0], altura(p[0], p[1]) + r * 0.15, p[1]), q, new THREE.Vector3(r, r * 0.7, r)));
    circulos.push({ x: p[0], z: p[1], r: r * 0.85 });
  }
  pedras.count = nPedra;
  pedras.castShadow = pedras.receiveShadow = true;
  cena.add(pedras);
  solidos.push(pedras);

  // Morros distantes além do muro, para fechar o horizonte.
  const matMorro = new THREE.MeshStandardMaterial({ ...repetir(tx.terra, 10, 6), color: 0x9aa878, roughness: 1 });
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2 + rnd() * 0.2;
    const d = TAMANHO + rnd() * 80;
    const h = 16 + rnd() * 30;
    const geoMorro = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    geoMorro.scale(50 + rnd() * 40, h, 50 + rnd() * 40);
    const morro = new THREE.Mesh(amassar(geoMorro, 0.22), matMorro);
    morro.position.set(Math.cos(ang) * d, -4, Math.sin(ang) * d);
    morro.rotation.y = rnd() * 6;
    cena.add(morro);
  }

  // Pontos onde os itens aparecem, espalhados pelo mapa inteiro.
  const pontosDeItem: [number, number][] = [];
  for (let i = 0; i < 400 && pontosDeItem.length < 96; i++) {
    const p = sortear(0.8, METADE - 6);
    if (p && pontosDeItem.every((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) > 9)) pontosDeItem.push(p);
  }

  /** Linha de visão entre dois pontos na altura do peito: bloqueada por caixas altas. */
  function visao(a: THREE.Vector3, b: THREE.Vector3) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const ya = a.y + 1.4;
    const yb = b.y + 1.4;
    for (const c of caixas) {
      let t0 = 0;
      let t1 = 1;
      if (Math.abs(dx) < 1e-6) {
        if (a.x < c.minX || a.x > c.maxX) continue;
      } else {
        const u = (c.minX - a.x) / dx;
        const v = (c.maxX - a.x) / dx;
        t0 = Math.max(t0, Math.min(u, v));
        t1 = Math.min(t1, Math.max(u, v));
      }
      if (Math.abs(dz) < 1e-6) {
        if (a.z < c.minZ || a.z > c.maxZ) continue;
      } else {
        const u = (c.minZ - a.z) / dz;
        const v = (c.maxZ - a.z) / dz;
        t0 = Math.max(t0, Math.min(u, v));
        t1 = Math.min(t1, Math.max(u, v));
      }
      if (t0 > t1) continue;
      const tm = (t0 + t1) / 2;
      if (ya + (yb - ya) * tm < c.topo) return false;
    }
    return true;
  }

  /** Empurra um círculo para fora dos obstáculos e devolve a altura do piso sob ele. */
  function resolver(p: THREE.Vector3, raio: number, pes: number, degrau = 0.45) {
    const lim = METADE - 0.6 - raio;
    p.x = Math.min(lim, Math.max(-lim, p.x));
    p.z = Math.min(lim, Math.max(-lim, p.z));
    let piso = altura(p.x, p.z);
    for (const c of circulos) {
      if (c.r === 0) continue;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + raio;
      if (d < min && d > 1e-5) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    for (const c of caixas) {
      const px = Math.min(c.maxX, Math.max(c.minX, p.x));
      const pz = Math.min(c.maxZ, Math.max(c.minZ, p.z));
      const dx = p.x - px;
      const dz = p.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= raio * raio) continue;
      if (pes >= c.topo - degrau) {
        // em cima da caixa (ou subindo um degrau baixo)
        if (d2 === 0) piso = Math.max(piso, c.topo);
        continue;
      }
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = px + (dx / d) * raio;
        p.z = pz + (dz / d) * raio;
      } else {
        // centro dentro da caixa: sai pela face mais próxima
        const saidas = [p.x - c.minX, c.maxX - p.x, p.z - c.minZ, c.maxZ - p.z];
        const menor = saidas.indexOf(Math.min(...saidas));
        if (menor === 0) p.x = c.minX - raio;
        else if (menor === 1) p.x = c.maxX + raio;
        else if (menor === 2) p.z = c.minZ - raio;
        else p.z = c.maxZ + raio;
      }
    }
    return piso;
  }

  function atualizarSol(alvo: THREE.Vector3) {
    luzSol.target.position.set(alvo.x, 0, alvo.z);
    luzSol.position.copy(luzSol.target.position).addScaledVector(sol, 110);
  }

  return { texturas: tx, solidos, paredes, caixas, circulos, pontosDeItem, resolver, visao, livre, atualizarSol };
}

export type Mundo = ReturnType<typeof criarMundo>;
