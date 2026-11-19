import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { type Mundo } from './mundo';
import { ARMAS, type FabricaDeArmas, type TipoArma } from './armas';

const ALTURA = 1.85;
const RAIO = 0.4;
const GRAVIDADE = 22;
export const ALTURA_OLHOS = 1.55;

export type ArmaNaMao = { tipo: TipoArma; pente: number };
export type Combatente = {
  nome: string;
  humano: boolean;
  cor: number;
  pos: THREE.Vector3; // pés
  vel: THREE.Vector3;
  guinada: number;
  arfagem: number;
  vida: number;
  colete: number;
  kits: number;
  municao: number;
  armas: [ArmaNaMao, ArmaNaMao | null];
  slot: 0 | 1;
  espera: number;
  recarga: number;
  estado: 'queda' | 'vivo' | 'morto';
  noChao: boolean;
  tempoMorto: number;
  abates: number;
  coice: number;
  raiz: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  acoes: Record<string, THREE.AnimationAction>;
  anim: string;
  ossos: Record<string, THREE.Object3D>;
  arma: THREE.Group;
  tipoVisivel: TipoArma | null;
  paraquedas: THREE.Object3D | null;
  perto: boolean;
  sombra: boolean;
  ia: { alvo: Combatente | null; reacao: number; pensar: number; destino: THREE.Vector3 | null; lado: number; travado: number; rajada: number; pericia: number; item: unknown };
};

export type Acerto = { alvo: Combatente; dist: number; cabeca: boolean; ponto: THREE.Vector3 };

export async function criarCombatentes(cena: THREE.Scene, mundo: Mundo, fabrica: FabricaDeArmas) {
  const gltf = await new GLTFLoader().loadAsync('/models/RobotExpressive.glb');
  const escala = ALTURA / new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
  const lista: Combatente[] = [];
  const eventos = { morte: (_c: Combatente, _autor: Combatente | null) => {}, pouso: (_c: Combatente) => {} };

  const pintura = new Map<string, THREE.Material>();
  function pintar(mat: THREE.Material, cor: number) {
    const chave = `${cor}:${mat.name}`;
    let m = pintura.get(chave);
    if (!m) {
      m = mat.clone();
      const pm = m as THREE.MeshStandardMaterial;
      if (mat.name === 'Main') {
        pm.color.setHex(cor);
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

  const geoVelame = new THREE.SphereGeometry(2.3, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2.4);
  function criarParaquedas(cor: number) {
    const g = new THREE.Group();
    const velame = new THREE.Mesh(geoVelame, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }));
    velame.position.y = 3.4;
    velame.castShadow = true;
    const pontos: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pontos.push(Math.cos(a) * 2.2, 4.1, Math.sin(a) * 2.2, Math.cos(a) * 0.25, 1.6, Math.sin(a) * 0.25);
    }
    const cordas = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pontos, 3)), new THREE.LineBasicMaterial({ color: 0x2a2620 }));
    g.add(velame, cordas);
    g.scale.setScalar(1 / escala); // a raiz do robô é reduzida; o paraquedas fica em metros
    return g;
  }

  function criar(nome: string, humano: boolean, cor: number): Combatente {
    const raiz = clonarEsqueleto(gltf.scene);
    raiz.scale.setScalar(escala);
    raiz.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      m.material = Array.isArray(m.material) ? m.material.map((x) => pintar(x, cor)) : pintar(m.material, cor);
    });
    const mixer = new THREE.AnimationMixer(raiz);
    const acoes: Record<string, THREE.AnimationAction> = {};
    for (const clip of gltf.animations) acoes[clip.name] = mixer.clipAction(clip);
    acoes.Death.setLoop(THREE.LoopOnce, 1);
    acoes.Death.clampWhenFinished = true;
    acoes.Idle.play();
    const ossos: Record<string, THREE.Object3D> = {};
    for (const n of ['UpperArmR', 'LowerArmR', 'Palm2R', 'UpperArmL', 'LowerArmL', 'Palm2L']) ossos[n] = raiz.getObjectByName(n)!;
    const arma = new THREE.Group();
    cena.add(raiz, arma);
    const c: Combatente = {
      nome, humano, cor, pos: raiz.position, vel: new THREE.Vector3(), guinada: 0, arfagem: 0, vida: 100, colete: 0, kits: 0, municao: 36,
      armas: [{ tipo: 'pistola', pente: ARMAS.pistola.pente }, null], slot: 0, espera: 0, recarga: 0, estado: 'queda', noChao: false, tempoMorto: 0, abates: 0, coice: 0,
      raiz, mixer, acoes, anim: 'Idle', ossos, arma, tipoVisivel: null, paraquedas: null, perto: true, sombra: true,
      ia: { alvo: null, reacao: 0, pensar: Math.random(), destino: null, lado: Math.random() > 0.5 ? 1 : -1, travado: 0, rajada: 0, pericia: 0.45 + Math.random() * 0.45, item: null },
    };
    lista.push(c);
    return c;
  }

  /** Coloca o combatente no ar, de paraquedas, pronto para uma nova partida. */
  function lancar(c: Combatente, x: number, z: number, alturaInicial: number) {
    c.pos.set(x, alturaInicial, z);
    c.vel.set(0, 0, 0);
    Object.assign(c, { vida: 100, colete: 0, kits: 0, municao: 36, slot: 0, espera: 0, recarga: 0, estado: 'queda', noChao: false, tempoMorto: 0, abates: 0, arfagem: 0 });
    c.armas = [{ tipo: 'pistola', pente: ARMAS.pistola.pente }, null];
    c.ia.alvo = c.ia.destino = c.ia.item = null;
    c.raiz.visible = true;
    c.mixer.stopAllAction();
    c.acoes.Idle.reset().play();
    c.anim = 'Idle';
    if (c.paraquedas) c.raiz.remove(c.paraquedas);
    c.paraquedas = criarParaquedas(c.cor);
    c.raiz.add(c.paraquedas);
  }

  const armaAtual = (c: Combatente) => c.armas[c.slot] ?? c.armas[0];

  function trocarAnim(c: Combatente, nome: string, fade = 0.15) {
    if (c.anim === nome) return;
    c.acoes[c.anim].fadeOut(fade);
    c.acoes[nome].reset().fadeIn(fade).play();
    c.anim = nome;
  }

  /** Movimento, gravidade e colisão. `vx`/`vz` é a velocidade desejada no plano. */
  function fisica(c: Combatente, vx: number, vz: number, pular: boolean, dt: number) {
    if (c.estado === 'morto') return;
    if (c.estado === 'queda') {
      const k = 1 - Math.exp(-3 * dt);
      c.vel.x += (vx - c.vel.x) * k;
      c.vel.z += (vz - c.vel.z) * k;
      c.pos.x += c.vel.x * dt;
      c.pos.z += c.vel.z * dt;
      c.pos.y -= 11 * dt;
      const piso = mundo.resolver(c.pos, RAIO, c.pos.y);
      if (c.pos.y <= piso) {
        c.pos.y = piso;
        c.vel.set(0, 0, 0);
        c.estado = 'vivo';
        c.noChao = true;
        if (c.paraquedas) c.raiz.remove(c.paraquedas);
        c.paraquedas = null;
        eventos.pouso(c);
      }
      return;
    }
    const k = 1 - Math.exp(-(c.noChao ? 14 : 3) * dt);
    c.vel.x += (vx - c.vel.x) * k;
    c.vel.z += (vz - c.vel.z) * k;
    if (c.noChao && pular) {
      c.vel.y = 7.2;
      c.noChao = false;
    }
    c.vel.y -= GRAVIDADE * dt;
    c.pos.x += c.vel.x * dt;
    c.pos.z += c.vel.z * dt;
    c.pos.y += c.vel.y * dt;
    const piso = mundo.resolver(c.pos, RAIO, c.pos.y);
    if (c.pos.y <= piso) {
      c.pos.y = piso;
      c.vel.y = 0;
      c.noChao = true;
    } else if (c.pos.y - piso > 0.25) c.noChao = false;
    else if (c.noChao) c.pos.y = piso;
  }

  const direcaoDeMira = (c: Combatente, alvo = new THREE.Vector3()) =>
    alvo.set(-Math.sin(c.guinada) * Math.cos(c.arfagem), Math.sin(c.arfagem), -Math.cos(c.guinada) * Math.cos(c.arfagem));

  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const qd = new THREE.Quaternion();
  const qw = new THREE.Quaternion();
  const qp = new THREE.Quaternion();
  /** Gira um osso para que o segmento osso→filho aponte na direção pedida (em coordenadas do mundo). */
  function apontarOsso(osso: THREE.Object3D, filho: THREE.Object3D, dir: THREE.Vector3) {
    osso.getWorldPosition(va);
    filho.getWorldPosition(vb).sub(va).normalize();
    qd.setFromUnitVectors(vb, dir);
    osso.getWorldQuaternion(qw).premultiply(qd);
    osso.parent!.getWorldQuaternion(qp).invert();
    osso.quaternion.copy(qp.multiply(qw));
    osso.updateMatrixWorld(true);
  }

  const mira = new THREE.Vector3();
  const lado = new THREE.Vector3();
  const alvoBraco = new THREE.Vector3();
  const punho = new THREE.Vector3();
  const apoio = new THREE.Vector3();
  const olharPara = new THREE.Vector3();

  /** Animação, pose dos braços e posição da arma. Chamado depois da física. */
  function animar(c: Combatente, dt: number) {
    c.raiz.rotation.y = c.guinada + Math.PI;
    if (c.estado === 'morto') {
      c.tempoMorto += dt;
      c.mixer.update(dt);
      c.arma.visible = false;
      if (c.tempoMorto > 6) c.raiz.visible = false;
      return;
    }
    const v = Math.hypot(c.vel.x, c.vel.z);
    if (c.estado === 'queda') trocarAnim(c, 'Idle');
    else if (v > 0.9) {
      trocarAnim(c, 'Running');
      c.acoes.Running.timeScale = Math.max(0.7, v / 5.2);
    } else trocarAnim(c, 'Idle');
    if (!c.perto) {
      c.arma.visible = false;
      return;
    }
    c.mixer.update(dt);
    c.coice = Math.max(0, c.coice - dt * 8);

    const tipo = armaAtual(c).tipo;
    if (c.tipoVisivel !== tipo) {
      c.arma.clear();
      c.arma.add(fabrica.modelo(tipo));
      c.tipoVisivel = tipo;
    }
    c.arma.visible = c.estado === 'vivo';
    if (c.estado !== 'vivo') return;

    // Braços: o direito segura a empunhadura, o esquerdo apoia o cano. A arma fica na palma direita.
    c.raiz.updateMatrixWorld(true);
    direcaoDeMira(c, mira);
    lado.set(Math.cos(c.guinada), 0, -Math.sin(c.guinada)); // direita do combatente
    const baixa = c.recarga > 0 ? 0.55 : 0;
    alvoBraco.copy(mira).addScaledVector(lado, -0.28).setY(mira.y - 0.2 - baixa).normalize();
    apontarOsso(c.ossos.UpperArmR, c.ossos.LowerArmR, alvoBraco);
    alvoBraco.copy(mira).addScaledVector(lado, -0.1).setY(mira.y + 0.05 - baixa).normalize();
    apontarOsso(c.ossos.LowerArmR, c.ossos.Palm2R, alvoBraco);
    c.ossos.Palm2R.getWorldPosition(punho);
    olharPara.copy(mira).setY(mira.y - baixa).normalize();
    c.arma.position.copy(punho).addScaledVector(olharPara, 0.08 - c.coice * 0.05);
    c.arma.position.y += 0.02;
    c.arma.lookAt(apoio.copy(c.arma.position).add(olharPara));
    if (tipo !== 'pistola') {
      const frente = (c.arma.children[0]?.userData.boca ?? 0.4) * 0.55;
      apoio.copy(c.arma.position).addScaledVector(olharPara, frente);
      c.ossos.UpperArmL.getWorldPosition(va);
      alvoBraco.copy(apoio).sub(va).normalize();
      apontarOsso(c.ossos.UpperArmL, c.ossos.LowerArmL, vb.copy(alvoBraco).addScaledVector(lado, -0.35).setY(alvoBraco.y - 0.25).normalize());
      c.ossos.LowerArmL.getWorldPosition(va);
      apontarOsso(c.ossos.LowerArmL, c.ossos.Palm2L, alvoBraco.copy(apoio).sub(va).normalize());
    }
  }

  /** Ponta do cano no mundo, para o clarão e o rastro. */
  function boca(c: Combatente, alvo = new THREE.Vector3()) {
    if (!c.perto || !c.arma.visible) return alvo.set(c.pos.x, c.pos.y + 1.2, c.pos.z);
    const m = c.arma.children[0];
    return alvo.set(0, 0.08, -(m?.userData.boca ?? 0.4)).applyMatrix4(c.arma.matrixWorld);
  }

  function raioEsfera(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number) {
    const ox = o.x - cx;
    const oy = o.y - cy;
    const oz = o.z - cz;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const disc = b * b - (ox * ox + oy * oy + oz * oz - r * r);
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : -1;
  }

  /** Combatente mais próximo na linha de tiro: três esferas (pernas, tronco, cabeça). */
  function mirar(origem: THREE.Vector3, dir: THREE.Vector3, distMax: number, ignorar: Combatente): Acerto | null {
    let melhor: Acerto | null = null;
    for (const c of lista) {
      if (c === ignorar || c.estado === 'morto') continue;
      for (const [fy, fr, cabeca] of [[0.8, 0.21, true], [0.5, 0.25, false], [0.2, 0.2, false]] as const) {
        const t = raioEsfera(origem, dir, c.pos.x, c.pos.y + ALTURA * fy, c.pos.z, ALTURA * fr);
        if (t > 0 && t < distMax && (!melhor || t < melhor.dist)) melhor = { alvo: c, dist: t, cabeca, ponto: origem.clone().addScaledVector(dir, t) };
      }
    }
    return melhor;
  }

  /** Aplica dano (o colete absorve 60% enquanto durar). Devolve true se o alvo caiu. */
  function ferir(c: Combatente, dano: number, autor: Combatente | null) {
    if (c.estado === 'morto') return false;
    if (c.colete > 0) {
      const absorvido = Math.min(c.colete, dano * 0.6);
      c.colete -= absorvido;
      dano -= absorvido;
    }
    c.vida -= dano;
    if (c.vida > 0) return false;
    c.vida = 0;
    c.estado = 'morto';
    c.tempoMorto = 0;
    if (c.paraquedas) c.raiz.remove(c.paraquedas);
    c.paraquedas = null;
    if (autor && autor !== c) autor.abates++;
    c.pos.y = Math.max(c.pos.y, mundo.resolver(c.pos, RAIO, c.pos.y));
    trocarAnim(c, 'Death', 0.1);
    eventos.morte(c, autor);
    return true;
  }

  const vivos = () => lista.filter((c) => c.estado !== 'morto');
  return { lista, eventos, criar, lancar, fisica, animar, armaAtual, direcaoDeMira, boca, mirar, ferir, vivos };
}

export type Combatentes = Awaited<ReturnType<typeof criarCombatentes>>;
