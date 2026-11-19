import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { METADE, altura, type Mundo } from './mundo';
import type { Jogador } from './jogador';
import { som } from './audio';

type Tipo = 'sucateiro' | 'atirador' | 'brutamontes';

const FICHA: Record<Tipo, { altura: number; vida: number; vel: number; dano: number; pontos: number; cor: number; alcance: number; anim: string }> = {
  sucateiro: { altura: 1.85, vida: 70, vel: 3.9, dano: 12, pontos: 100, cor: 0xe0a21c, alcance: 1.7, anim: 'Running' },
  atirador: { altura: 1.95, vida: 90, vel: 2.6, dano: 9, pontos: 150, cor: 0xc8402a, alcance: 26, anim: 'Walking' },
  brutamontes: { altura: 3.0, vida: 420, vel: 2.3, dano: 30, pontos: 300, cor: 0x3f5f78, alcance: 2.6, anim: 'Walking' },
};

type Inimigo = {
  tipo: Tipo;
  raiz: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  acoes: Record<string, THREE.AnimationAction>;
  atual: string;
  vida: number;
  morto: number; // segundos desde a morte; -1 enquanto vivo
  espera: number; // tempo até o próximo ataque
  golpe: number; // contagem até o golpe acertar
  lado: number; // sentido do passo lateral do atirador
  travado: number;
};

type Raio = { malha: THREE.Mesh; vel: THREE.Vector3; vida: number; dano: number };

export type Acerto = { inimigo: Inimigo; dist: number; cabeca: boolean; ponto: THREE.Vector3 };

export async function criarInimigos(cena: THREE.Scene, mundo: Mundo, jogador: Jogador) {
  const gltf = await new GLTFLoader().loadAsync('/models/RobotExpressive.glb');
  const alturaModelo = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;

  // Um conjunto de materiais por tipo: mesma malha, pintura diferente.
  const pintura = new Map<string, THREE.Material>();
  function pintar(mat: THREE.Material, tipo: Tipo) {
    const chave = `${tipo}:${mat.name}`;
    let m = pintura.get(chave);
    if (!m) {
      m = mat.clone();
      const pm = m as THREE.MeshStandardMaterial;
      if (mat.name === 'Main') {
        pm.color.setHex(FICHA[tipo].cor);
        pm.roughness = 0.42;
        pm.metalness = 0.35;
      } else if (mat.name === 'Grey') {
        pm.metalness = 0.75;
        pm.roughness = 0.4;
      }
      pintura.set(chave, m);
    }
    return m;
  }

  const lista: Inimigo[] = [];
  const raios: Raio[] = [];
  const geoRaio = new THREE.SphereGeometry(0.16, 10, 8);
  const matRaio = new THREE.MeshBasicMaterial({ color: 0xff4a2a });
  const eventos = { abate: (_i: Inimigo, _cabeca: boolean) => {}, golpe: (_dano: number, _de: THREE.Vector3) => {} };

  function gerar(tipo: Tipo, x: number, z: number) {
    const f = FICHA[tipo];
    const raiz = clonarEsqueleto(gltf.scene);
    raiz.scale.setScalar(f.altura / alturaModelo);
    raiz.position.set(x, altura(x, z), z);
    raiz.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      m.material = Array.isArray(m.material) ? m.material.map((x) => pintar(x, tipo)) : pintar(m.material, tipo);
    });
    const mixer = new THREE.AnimationMixer(raiz);
    const acoes: Record<string, THREE.AnimationAction> = {};
    for (const clip of gltf.animations) acoes[clip.name] = mixer.clipAction(clip);
    for (const nome of ['Death', 'Punch']) {
      acoes[nome].setLoop(THREE.LoopOnce, 1);
      acoes[nome].clampWhenFinished = true;
    }
    acoes[f.anim].play();
    cena.add(raiz);
    lista.push({ tipo, raiz, mixer, acoes, atual: f.anim, vida: f.vida, morto: -1, espera: 1 + Math.random(), golpe: 0, lado: Math.random() > 0.5 ? 1 : -1, travado: 0 });
  }

  function trocar(e: Inimigo, nome: string, fade = 0.18) {
    if (e.atual === nome) return;
    e.acoes[e.atual].fadeOut(fade);
    e.acoes[nome].reset().fadeIn(fade).play();
    e.atual = nome;
  }

  const para = new THREE.Vector3();
  const centro = new THREE.Vector3();
  const anterior = new THREE.Vector3();

  function atualizar(dt: number) {
    const alvo = jogador.pos;
    for (let i = lista.length - 1; i >= 0; i--) {
      const e = lista[i];
      e.mixer.update(dt);
      if (e.morto >= 0) {
        e.morto += dt;
        if (e.morto > 3.2) e.raiz.position.y -= dt * 0.9;
        if (e.morto > 5) {
          cena.remove(e.raiz);
          e.mixer.stopAllAction();
          lista.splice(i, 1);
        }
        continue;
      }
      const f = FICHA[e.tipo];
      const p = e.raiz.position;
      para.set(alvo.x - p.x, 0, alvo.z - p.z);
      const dist = para.length();
      para.divideScalar(dist || 1);
      e.raiz.rotation.y = Math.atan2(para.x, para.z);
      e.espera -= dt;

      if (e.golpe > 0) {
        // golpe corpo a corpo em andamento: acerta no meio da animação
        e.golpe -= dt;
        if (e.golpe <= 0 && dist < f.alcance + 0.6 && Math.abs(alvo.y - p.y) < f.altura) eventos.golpe(f.dano, p);
        continue;
      }

      let mover = 0;
      let lateral = 0;
      if (e.tipo === 'atirador') {
        if (dist > f.alcance) mover = 1;
        else if (dist < 11) mover = -0.7;
        else lateral = e.lado;
        if (dist < f.alcance + 6 && e.espera <= 0 && jogador.estado.vivo) {
          e.espera = 1.5 + Math.random() * 1.2;
          if (Math.random() < 0.3) e.lado *= -1;
          const malha = new THREE.Mesh(geoRaio, matRaio);
          malha.position.set(p.x + para.x * 0.6, p.y + f.altura * 0.62, p.z + para.z * 0.6);
          const mira = new THREE.Vector3(alvo.x + jogador.vel.x * 0.35, alvo.y + 1.2, alvo.z + jogador.vel.z * 0.35).sub(malha.position).normalize();
          mira.x += (Math.random() - 0.5) * 0.07;
          mira.z += (Math.random() - 0.5) * 0.07;
          cena.add(malha);
          raios.push({ malha, vel: mira.multiplyScalar(19), vida: 4, dano: f.dano });
          som.raio();
        }
      } else if (dist > f.alcance) {
        mover = 1;
      } else if (e.espera <= 0 && jogador.estado.vivo) {
        e.espera = e.tipo === 'brutamontes' ? 1.7 : 1.1;
        e.golpe = 0.32;
        trocar(e, 'Punch', 0.08);
        e.acoes.Punch.timeScale = 1.5;
        continue;
      }

      if (mover !== 0 || lateral !== 0) {
        anterior.copy(p);
        // se ficou preso num obstáculo, contorna por um lado durante um tempo
        const desvio = e.travado > 0 ? e.lado * 0.9 : 0;
        const vx = para.x * mover - para.z * (lateral * 0.6 + desvio);
        const vz = para.z * mover + para.x * (lateral * 0.6 + desvio);
        p.x += vx * f.vel * dt;
        p.z += vz * f.vel * dt;
        for (const o of lista) {
          if (o === e || o.morto >= 0) continue;
          const dx = p.x - o.raiz.position.x;
          const dz = p.z - o.raiz.position.z;
          const d = Math.hypot(dx, dz);
          const min = (f.altura + FICHA[o.tipo].altura) * 0.2;
          if (d < min && d > 1e-4) {
            p.x += (dx / d) * (min - d) * 0.5;
            p.z += (dz / d) * (min - d) * 0.5;
          }
        }
        p.y = mundo.resolver(p, f.altura * 0.22, p.y, 0.6);
        const andou = Math.hypot(p.x - anterior.x, p.z - anterior.z);
        e.travado = andou < f.vel * dt * 0.35 ? 0.9 : Math.max(0, e.travado - dt);
        trocar(e, f.anim);
      } else {
        trocar(e, 'Idle');
      }
    }

    for (let i = raios.length - 1; i >= 0; i--) {
      const r = raios[i];
      r.vida -= dt;
      r.malha.position.addScaledVector(r.vel, dt);
      const q = r.malha.position;
      const noJogador = Math.hypot(q.x - alvo.x, q.z - alvo.z) < 0.55 && q.y > alvo.y - 0.1 && q.y < alvo.y + 1.9;
      if (noJogador) eventos.golpe(r.dano, q);
      if (noJogador || r.vida <= 0 || mundo.bloqueado(q)) {
        cena.remove(r.malha);
        raios.splice(i, 1);
      }
    }
  }

  function raioEsfera(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number) {
    const ox = o.x - c.x;
    const oy = o.y - c.y;
    const oz = o.z - c.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const disc = b * b - (ox * ox + oy * oy + oz * oz - r * r);
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : -1;
  }

  /** Inimigo mais próximo na linha de tiro. Três esferas por robô: pernas, tronco e cabeça. */
  function mirar(origem: THREE.Vector3, dir: THREE.Vector3, distMax: number): Acerto | null {
    let melhor: Acerto | null = null;
    for (const e of lista) {
      if (e.morto >= 0) continue;
      const h = FICHA[e.tipo].altura;
      const p = e.raiz.position;
      for (const [fy, fr, cabeca] of [[0.8, 0.21, true], [0.5, 0.25, false], [0.2, 0.2, false]] as const) {
        const t = raioEsfera(origem, dir, centro.set(p.x, p.y + h * fy, p.z), h * fr);
        if (t > 0 && t < distMax && (!melhor || t < melhor.dist)) melhor = { inimigo: e, dist: t, cabeca, ponto: origem.clone().addScaledVector(dir, t) };
      }
    }
    return melhor;
  }

  function ferir(a: Acerto, dano: number) {
    const e = a.inimigo;
    e.vida -= dano * (a.cabeca ? 2.2 : 1);
    if (e.vida > 0) return false;
    e.morto = 0;
    e.golpe = 0;
    trocar(e, 'Death', 0.1);
    eventos.abate(e, a.cabeca);
    return true;
  }

  /** Posição de entrada longe do jogador, junto ao muro. */
  function pontoDeEntrada(): [number, number] {
    for (let i = 0; i < 60; i++) {
      const lado = Math.floor(Math.random() * 4);
      const t = (Math.random() * 2 - 1) * (METADE - 6);
      const b = METADE - 4 - Math.random() * 8;
      const [x, z] = lado === 0 ? [t, -b] : lado === 1 ? [t, b] : lado === 2 ? [-b, t] : [b, t];
      if (Math.hypot(x - jogador.pos.x, z - jogador.pos.z) > 38 && mundo.livre(x, z, 1)) return [x, z];
    }
    return [METADE - 6, METADE - 6];
  }

  function gerarOnda(n: number) {
    const total = 4 + n * 2;
    for (let i = 0; i < total; i++) {
      const sorte = Math.random();
      const tipo: Tipo = n >= 3 && i % 7 === 6 ? 'brutamontes' : n >= 2 && sorte < 0.3 ? 'atirador' : 'sucateiro';
      const [x, z] = pontoDeEntrada();
      gerar(tipo, x, z);
    }
  }

  function limpar() {
    for (const e of lista) cena.remove(e.raiz);
    for (const r of raios) cena.remove(r.malha);
    lista.length = raios.length = 0;
  }

  return { lista, eventos, atualizar, mirar, ferir, gerar, gerarOnda, limpar, vivos: () => lista.filter((e) => e.morto < 0).length, pontos: (e: Inimigo) => FICHA[e.tipo].pontos };
}

export type Inimigos = Awaited<ReturnType<typeof criarInimigos>>;
