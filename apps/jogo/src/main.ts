import * as THREE from 'three';
import './estilo.css';
import { criarMundo, METADE, altura } from './mundo';
import { ARMAS, criarFabricaDeArmas, type Item, type TipoArma, type TipoItem } from './armas';
import { ALTURA_OLHOS, criarCombatentes, type Combatente } from './combatentes';
import { criarBots } from './bots';
import { criarZona } from './zona';
import { criarControle } from './controle';
import { api, type Linha } from './api';
import { ligarAudio, som } from './audio';
import { limitar } from './util';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const TESTE = new URLSearchParams(location.search).has('teste');
const TOTAL = 20;
const NOMES = ['Parafuso', 'Biela', 'Faísca', 'Rebite', 'Catraca', 'Mancal', 'Bobina', 'Pistão', 'Arruela', 'Válvula', 'Engrenagem', 'Solda', 'Dínamo', 'Manivela', 'Torno', 'Cabo', 'Bucha', 'Fusível', 'Graxa'];
const CORES = [0xe0a21c, 0xc8402a, 0x3f5f78, 0x4d7a3a, 0x8b3f5e, 0x2f8f8a, 0xb5651d, 0x6a5acd, 0x7a7d82];

const tela = $<HTMLCanvasElement>('tela');
const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;

const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1200);
const mundo = criarMundo(cena, renderer);
const fabrica = criarFabricaDeArmas(mundo.texturas);
const zona = criarZona(cena);
const controle = criarControle(tela);
document.body.classList.toggle('toque', controle.e.toque);
renderer.setPixelRatio(Math.min(devicePixelRatio, controle.e.toque ? 1.5 : 2));

function ajustar() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', ajustar);
ajustar();

const combatentes = await criarCombatentes(cena, mundo, fabrica);
const jogador = combatentes.criar('Você', true, 0xf1e9da);
for (let i = 0; i < TOTAL - 1; i++) combatentes.criar(NOMES[i], false, CORES[i % CORES.length]);
for (const c of combatentes.lista) c.raiz.visible = false;

type Fase = 'menu' | 'jogando' | 'pausa' | 'caindo' | 'fim';
const jogo = { fase: 'menu' as Fase, tempo: 0, colocacao: 0, espera: 0, vitoria: false, partida: null as { id: string; token: string } | null };

// ---- Itens no chão ----
const itens: Item[] = [];
function soltarItem(tipo: TipoItem, x: number, z: number, arma?: TipoArma, pente?: number) {
  const malha = fabrica.visualDeItem(tipo, arma);
  malha.position.set(x, altura(x, z), z);
  cena.add(malha);
  itens.push({ tipo, arma, pente, malha, x, z });
}
function removerItem(it: Item) {
  cena.remove(it.malha);
  const i = itens.indexOf(it);
  if (i >= 0) itens.splice(i, 1);
}
function espalharItens() {
  for (const it of [...itens]) removerItem(it);
  const armas: TipoArma[] = ['fuzil', 'sub', 'escopeta', 'precisao', 'fuzil', 'sub', 'escopeta'];
  mundo.pontosDeItem.forEach(([x, z], i) => {
    const s = Math.random();
    if (i % 5 < 2) soltarItem('arma', x, z, armas[Math.floor(Math.random() * armas.length)]);
    else if (s < 0.5) soltarItem('municao', x, z);
    else if (s < 0.75) soltarItem('kit', x, z);
    else soltarItem('colete', x, z);
  });
}

/** Pega um item. Devolve false se o combatente não tinha uso para ele. */
function pegar(c: Combatente, it: Item) {
  if (it.tipo === 'municao') {
    if (c.municao >= 240) return false;
    c.municao = Math.min(240, c.municao + 45);
  } else if (it.tipo === 'colete') {
    if (c.colete >= 100) return false;
    c.colete = Math.min(100, c.colete + 50);
  } else if (it.tipo === 'kit') {
    if (c.kits >= 4) return false;
    c.kits++;
  } else {
    const antiga = c.armas[1];
    c.armas[1] = { tipo: it.arma!, pente: it.pente ?? ARMAS[it.arma!].pente };
    c.slot = 1;
    c.recarga = 0;
    if (antiga) soltarItem('arma', c.pos.x + 0.6, c.pos.z + 0.6, antiga.tipo, antiga.pente);
  }
  removerItem(it);
  if (c.humano) som.coleta();
  return true;
}

function usarKit(c: Combatente) {
  if (c.kits === 0 || c.vida >= 100 || c.estado !== 'vivo') return;
  c.kits--;
  c.vida = Math.min(100, c.vida + 50);
  if (c.humano) som.coleta();
}

function recarregar(c: Combatente) {
  const a = combatentes.armaAtual(c);
  const f = ARMAS[a.tipo];
  const infinita = !c.humano && a.tipo === 'pistola'; // robôs nunca ficam sem a pistola
  if (c.recarga > 0 || a.pente === f.pente || (c.municao === 0 && !infinita)) return;
  c.recarga = f.recarga;
  if (c.humano) som.recarga();
}

function tique(c: Combatente, dt: number) {
  c.espera = Math.max(0, c.espera - dt);
  if (c.recarga > 0 && (c.recarga -= dt) <= 0) {
    c.recarga = 0;
    const a = combatentes.armaAtual(c);
    const falta = ARMAS[a.tipo].pente - a.pente;
    const infinita = !c.humano && a.tipo === 'pistola';
    const n = infinita ? falta : Math.min(falta, c.municao);
    a.pente += n;
    if (!infinita) c.municao -= n;
  }
}

/** Gasta uma munição se a arma puder disparar agora. */
function puxarGatilho(c: Combatente) {
  const a = combatentes.armaAtual(c);
  if (c.espera > 0 || c.recarga > 0 || c.estado !== 'vivo') return false;
  if (a.pente === 0) {
    if (c.humano) {
      c.espera = 0.3;
      som.seco();
    }
    recarregar(c);
    return false;
  }
  a.pente--;
  c.espera = ARMAS[a.tipo].cadencia;
  c.coice = 1;
  return true;
}

// ---- Efeitos: rastros, faíscas e clarão ----
const rastros = Array.from({ length: 28 }, () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.frustumCulled = false;
  cena.add(m);
  return m;
});
let iRastro = 0;
function tracar(de: THREE.Vector3, ate: THREE.Vector3) {
  const r = rastros[iRastro++ % rastros.length];
  r.position.copy(de).lerp(ate, 0.5);
  r.lookAt(ate);
  r.scale.set(1, 1, de.distanceTo(ate));
  (r.material as THREE.MeshBasicMaterial).opacity = 0.7;
}
const faiscas = Array.from({ length: 60 }, () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
  m.visible = false;
  cena.add(m);
  return { m, v: new THREE.Vector3(), vida: 0 };
});
let iFaisca = 0;
function faiscar(p: THREE.Vector3, cor: number, n: number) {
  for (let i = 0; i < n; i++) {
    const f = faiscas[iFaisca++ % faiscas.length];
    f.m.position.copy(p);
    (f.m.material as THREE.MeshBasicMaterial).color.setHex(cor);
    f.v.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).multiplyScalar(5);
    f.vida = 0.3 + Math.random() * 0.2;
    f.m.visible = true;
  }
}
const clarao = new THREE.PointLight(0xffb060, 0, 16, 2);
cena.add(clarao);

// ---- HUD ----
const hud = {
  raiz: $('hud'), vivos: $('vivos'), abates: $('abates'), zona: $('zona'), feed: $('feed'), vida: $('vida'), vidaNum: $('vidaNum'), colete: $('colete'), coleteNum: $('coleteNum'), kits: $('kits'),
  pente: $('pente'), reserva: $('reserva'), armaNome: $('armaNome'), slots: $('slots'), municao: document.querySelector<HTMLElement>('.municao')!, dica: $('dica'), aviso: $('aviso'),
  dano: $('dano'), tempestade: $('tempestade'), mira: $('mira'), marca: $('marca'), mapa: $<HTMLCanvasElement>('mapa').getContext('2d')!,
};
let danoTela = 0;
let marcaTempo = 0;
let avisoTempo = 0;
let abertura = 0;
function avisar(texto: string, seg = 2.4) {
  hud.aviso.textContent = texto;
  hud.aviso.classList.add('visivel');
  avisoTempo = seg;
}
function noticiar(autor: string | null, vitima: string, eu: boolean) {
  const li = document.createElement('li');
  if (eu) li.className = 'eu';
  const b1 = document.createElement('b');
  b1.textContent = autor ?? 'A zona';
  const b2 = document.createElement('b');
  b2.textContent = vitima;
  li.append(b1, ' eliminou ', b2);
  hud.feed.prepend(li);
  while (hud.feed.children.length > 5) hud.feed.lastChild!.remove();
  setTimeout(() => li.remove(), 6000);
}

combatentes.eventos.pouso = (c) => {
  if (c.humano) {
    som.pouso();
    avisar('Ache uma arma');
  }
};
combatentes.eventos.morte = (c, autor) => {
  noticiar(autor ? autor.nome : null, c.nome, c.humano || autor === jogador);
  const principal = c.armas[1];
  if (principal) soltarItem('arma', c.pos.x, c.pos.z, principal.tipo, principal.pente);
  if (c.municao > 20) soltarItem('municao', c.pos.x + 0.8, c.pos.z - 0.5);
  if (c.kits > 0) soltarItem('kit', c.pos.x - 0.8, c.pos.z + 0.4);
  const d = c.pos.distanceTo(jogador.pos);
  if (d < 60) som.abate();
  if (c.humano && jogo.fase === 'jogando') {
    jogo.colocacao = combatentes.vivos().length + 1;
    jogo.fase = 'caindo';
    jogo.espera = 2.2;
    controle.e.ativo = false;
    controle.limpar();
  }
};

// ---- Tiros ----
const raycaster = new THREE.Raycaster();
const origem = new THREE.Vector3();
const frente = new THREE.Vector3();
const dirTiro = new THREE.Vector3();
const bocaArma = new THREE.Vector3();
const tmp = new THREE.Vector3();

function tiroDoJogador() {
  const a = combatentes.armaAtual(jogador);
  const f = ARMAS[a.tipo];
  if (!puxarGatilho(jogador)) return;
  camera.getWorldDirection(frente);
  // O raio parte da câmera, mas só vale a partir da altura do personagem, para não acertar o que está atrás dele.
  const recuoCam = camera.position.distanceTo(tmp.set(jogador.pos.x, jogador.pos.y + ALTURA_OLHOS, jogador.pos.z));
  origem.copy(camera.position).addScaledVector(frente, recuoCam);
  combatentes.boca(jogador, bocaArma);
  const movendo = Math.hypot(jogador.vel.x, jogador.vel.z) > 1;
  const desvio = f.dispersao + abertura * 0.025 + (movendo ? 0.01 : 0) + (jogador.noChao ? 0 : 0.03);
  let acertou = false;
  let matou = false;
  let cabeca = false;
  for (let i = 0; i < f.balins; i++) {
    dirTiro.set((Math.random() - 0.5) * desvio * 2, (Math.random() - 0.5) * desvio * 2, -1).normalize().transformDirection(camera.matrixWorld);
    raycaster.set(origem, dirTiro);
    raycaster.far = f.alcance * 1.6;
    const parede = raycaster.intersectObjects(mundo.solidos, false)[0];
    const acerto = combatentes.mirar(origem, dirTiro, parede ? parede.distance : raycaster.far, jogador);
    if (acerto) {
      const queda = acerto.dist > f.alcance ? 0.5 : 1;
      matou = combatentes.ferir(acerto.alvo, f.dano * queda * (acerto.cabeca ? 1.8 : 1), jogador) || matou;
      acertou = true;
      cabeca ||= acerto.cabeca;
      faiscar(acerto.ponto, acerto.cabeca ? 0xfff0c0 : 0xff9a3a, 3);
      tracar(bocaArma, acerto.ponto);
    } else {
      const fim = parede ? parede.point : tmp.copy(origem).addScaledVector(dirTiro, f.alcance);
      if (parede) faiscar(fim, 0xc9b79a, 2);
      tracar(bocaArma, fim);
    }
  }
  abertura = Math.min(1, abertura + (f.cadencia > 0.4 ? 0.5 : 0.14));
  jogador.arfagem = limitar(jogador.arfagem + 0.006 + f.grave * 0.02, -1.3, 1.3);
  clarao.position.copy(bocaArma);
  clarao.intensity = 30;
  som.tiro(1, f.grave);
  if (acertou) {
    if (cabeca) som.cabeca();
    else som.acerto();
    marcaTempo = matou ? 0.35 : 0.14;
  }
}

function tiroDoBot(b: Combatente, alvo: Combatente) {
  const a = combatentes.armaAtual(b);
  const f = ARMAS[a.tipo];
  if (!puxarGatilho(b)) return;
  const dist = b.pos.distanceTo(alvo.pos);
  const movendo = Math.hypot(alvo.vel.x, alvo.vel.z) > 3;
  const chance = limitar(0.5 - (dist / f.alcance) * 0.38, 0.06, 0.5) * b.ia.pericia * (movendo ? 0.7 : 1);
  combatentes.boca(b, bocaArma);
  let dano = 0;
  for (let i = 0; i < f.balins; i++) if (Math.random() < chance) dano += f.dano * (Math.random() < 0.1 ? 1.8 : 1);
  tmp.set(alvo.pos.x, alvo.pos.y + 1.1, alvo.pos.z);
  if (dano === 0) tmp.add(dirTiro.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(2.4));
  const dj = b.pos.distanceTo(jogador.pos);
  if (dj < 120) {
    tracar(bocaArma, tmp);
    som.tiro(limitar(1 - dj / 95, 0, 1) * 0.55, f.grave);
  }
  if (dano > 0) {
    if (alvo.humano) {
      dano *= 0.75;
      danoTela = Math.min(1, danoTela + 0.2 + dano / 50);
      som.dano();
    } else {
      dano *= 0.2; // robô contra robô: mais lento, para a partida durar
      if (dj < 60) faiscar(tmp, 0xff9a3a, 2);
      if (!alvo.ia.alvo) Object.assign(alvo.ia, { alvo: b, reacao: 0.4 }); // quem leva tiro revida
    }
    combatentes.ferir(alvo, dano, b);
  }
}

const bots = criarBots(combatentes, mundo, zona, { itens, pegar, atirar: tiroDoBot, recarregar, usarKit });

// ---- Partida ----
async function comecar() {
  ligarAudio();
  espalharItens();
  zona.reiniciar();
  hud.feed.replaceChildren();
  const usados: [number, number][] = [];
  for (const c of combatentes.lista) {
    let x = 0;
    let z = 0;
    for (let t = 0; t < 30; t++) {
      x = (Math.random() * 2 - 1) * (METADE - 14);
      z = (Math.random() * 2 - 1) * (METADE - 14);
      if (usados.every((u) => Math.hypot(u[0] - x, u[1] - z) > 18)) break;
    }
    usados.push([x, z]);
    combatentes.lancar(c, x, z, 78 + Math.random() * 14);
    c.guinada = Math.atan2(x, z); // de frente para o centro do mapa
  }
  Object.assign(jogo, { fase: 'jogando', tempo: 0, colocacao: 0, espera: 0, vitoria: false, partida: null });
  danoTela = 0;
  controle.limpar();
  controle.e.ativo = true;
  $('menu').hidden = true;
  hud.raiz.hidden = false;
  avisar('Escolha onde pousar', 3);
  if (!TESTE && !controle.e.toque) tela.requestPointerLock();
  jogo.partida = await api.iniciar();
}

function mostrarRanking(linhas: Linha[] | null, meu?: number) {
  const ol = $('ranking');
  ol.replaceChildren();
  if (!linhas || linhas.length === 0) {
    const li = document.createElement('li');
    li.className = 'vazio';
    li.textContent = linhas ? 'Ninguém pontuou ainda. Seja a primeira pessoa.' : 'Ranking indisponível: o servidor não respondeu.';
    ol.append(li);
    return;
  }
  linhas.forEach((l, i) => {
    const li = document.createElement('li');
    if (meu === i + 1) li.className = 'eu';
    const nome = document.createElement('span');
    nome.textContent = l.nome;
    const pts = document.createElement('span');
    pts.textContent = l.pontos.toLocaleString('pt-BR');
    li.append(nome, pts);
    ol.append(li);
  });
}

async function encerrar() {
  jogo.fase = 'fim';
  controle.e.ativo = false;
  document.exitPointerLock?.();
  hud.raiz.hidden = true;
  $('menu').hidden = false;
  const col = jogo.colocacao;
  $('sobre').textContent = jogo.vitoria ? 'Vitória' : `${col}º de ${TOTAL}`;
  $('titulo').innerHTML = jogo.vitoria ? 'Última <em>de pé</em>' : 'Fim de <em>partida</em>';
  $('resumo').textContent = jogo.vitoria ? 'O vale é seu. Nenhuma outra máquina sobrou funcionando.' : col <= 5 ? 'Chegou perto. Faltaram poucas máquinas para o topo.' : 'Você caiu cedo. Pouse longe dos outros e arme-se antes de brigar.';
  $('resultado').hidden = false;
  const local = jogador.abates * 100 + (TOTAL - col) * 40 + (col === 1 ? 500 : 0);
  $('rCol').textContent = `${col}º`;
  $('rAbates').textContent = String(jogador.abates);
  $('rPontos').textContent = local.toLocaleString('pt-BR');
  $('rPos').textContent = '…';
  $<HTMLButtonElement>('jogar').textContent = 'Jogar de novo';
  const nome = $<HTMLInputElement>('nome').value;
  try {
    localStorage.setItem('sucata:nome', nome);
  } catch {
    /* navegação privada: segue sem lembrar o nome */
  }
  const r = jogo.partida ? await api.finalizar(jogo.partida, { nome, abates: jogador.abates, colocacao: col }) : null;
  if (r) $('rPontos').textContent = r.pontos.toLocaleString('pt-BR');
  $('rPos').textContent = r ? `${r.posicao}º` : '—';
  mostrarRanking(r ? r.ranking : await api.ranking(), r?.posicao);
}

tela.addEventListener('mousedown', () => {
  if (jogo.fase === 'pausa') tela.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  const travado = document.pointerLockElement === tela;
  if (!travado && jogo.fase === 'jogando' && !TESTE && !controle.e.toque) {
    jogo.fase = 'pausa';
    controle.e.ativo = false;
    controle.limpar();
    avisar('Pausado · clique para continuar', 9999);
  } else if (travado && jogo.fase === 'pausa') {
    jogo.fase = 'jogando';
    controle.e.ativo = true;
    avisoTempo = 0.01;
  }
});
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  void comecar();
});
try {
  $<HTMLInputElement>('nome').value = localStorage.getItem('sucata:nome') ?? '';
} catch {
  /* sem armazenamento local */
}
if (controle.e.toque) $('teclas').innerHTML = '<li>Lado esquerdo: mover</li><li>Lado direito: mirar</li><li>Botões: tiro, pulo, recarga, pegar, troca e kit</li><li>Vire o celular na horizontal</li>';

// ---- Jogador ----
let itemPerto: Item | null = null;
function controlarJogador(dt: number) {
  const olhar = controle.ler();
  const sens = controle.e.toque ? 0.0032 : 0.0022;
  jogador.guinada -= olhar.dx * sens;
  jogador.arfagem = limitar(jogador.arfagem - olhar.dy * sens, -1.3, 1.3);
  const e = controle.e;
  const vel = jogador.estado === 'queda' ? 10 : e.correr && e.mz > 0 ? 7.6 : 5.2;
  const s = Math.sin(jogador.guinada);
  const c = Math.cos(jogador.guinada);
  let vx = -s * e.mz + c * e.mx;
  let vz = -c * e.mz - s * e.mx;
  const n = Math.hypot(vx, vz);
  if (n > 1) {
    vx /= n;
    vz /= n;
  }
  combatentes.fisica(jogador, vx * vel, vz * vel, controle.pediu('pular'), dt);
  if (jogador.estado !== 'vivo') return;

  // Itens: munição, colete e kit entram sozinhos; arma pede a tecla, a não ser que a mão esteja livre.
  itemPerto = null;
  for (const it of [...itens]) {
    const d = Math.hypot(it.x - jogador.pos.x, it.z - jogador.pos.z);
    if (d > 1.5) continue;
    if (it.tipo !== 'arma') pegar(jogador, it);
    else if (!jogador.armas[1]) pegar(jogador, it);
    else if (!itemPerto) itemPerto = it;
  }
  if (controle.pediu('pegar') && itemPerto) pegar(jogador, itemPerto);
  if (controle.pediu('recarregar')) recarregar(jogador);
  if (controle.pediu('kit')) usarKit(jogador);
  const trocar = controle.pediu('trocar');
  const s0 = controle.pediu('slot0');
  const s1 = controle.pediu('slot1');
  const novo = s0 ? 0 : s1 ? 1 : trocar ? (jogador.slot === 0 ? 1 : 0) : jogador.slot;
  if (novo !== jogador.slot && (novo === 0 || jogador.armas[1])) {
    jogador.slot = novo as 0 | 1;
    jogador.recarga = 0;
    jogador.espera = 0.25;
  }
  if (e.fogo) tiroDoJogador();
}

// ---- Câmera em terceira pessoa ----
const pivo = new THREE.Vector3();
const posCam = new THREE.Vector3();
const olhoCam = new THREE.Raycaster();
function posicionarCamera() {
  const c = jogador;
  combatentes.direcaoDeMira(c, frente);
  const dist = c.estado === 'queda' ? 8 : 3.9;
  const ombro = c.estado === 'queda' ? 0 : 1.05;
  pivo.set(c.pos.x + Math.cos(c.guinada) * ombro, c.pos.y + ALTURA_OLHOS + 0.5, c.pos.z - Math.sin(c.guinada) * ombro);
  posCam.copy(pivo).addScaledVector(frente, -dist);
  // Não atravessa parede: encurta até o primeiro obstáculo entre o ombro e a câmera.
  olhoCam.set(pivo, tmp.copy(frente).negate());
  olhoCam.far = dist;
  const bate = olhoCam.intersectObjects(mundo.paredes, false)[0];
  if (bate) posCam.copy(pivo).addScaledVector(frente, -Math.max(0.5, bate.distance - 0.25));
  posCam.y = Math.max(posCam.y, altura(posCam.x, posCam.z) + 0.35);
  camera.position.copy(posCam);
  camera.lookAt(tmp.copy(pivo).addScaledVector(frente, 30));
}

function desenharMapa() {
  const c = hud.mapa;
  const T = 150;
  const k = T / (METADE * 2);
  const m = (v: number) => (v + METADE) * k;
  c.clearRect(0, 0, T, T);
  c.fillStyle = 'rgba(241,233,218,0.26)';
  for (const b of mundo.caixas) {
    if (b.maxX - b.minX > 100 || b.maxZ - b.minZ > 100) continue;
    c.fillRect(m(b.minX), m(b.minZ), Math.max(1, (b.maxX - b.minX) * k), Math.max(1, (b.maxZ - b.minZ) * k));
  }
  const z = zona.z;
  c.lineWidth = 1.5;
  c.strokeStyle = '#ff7a1a';
  c.beginPath();
  c.arc(m(z.x), m(z.z), Math.max(1, z.raio * k), 0, 6.3);
  c.stroke();
  if (!zona.acabou()) {
    c.setLineDash([3, 3]);
    c.strokeStyle = '#f1e9da';
    c.beginPath();
    c.arc(m(z.paraX), m(z.paraZ), Math.max(1, z.paraRaio * k), 0, 6.3);
    c.stroke();
    c.setLineDash([]);
  }
  c.save();
  c.translate(m(jogador.pos.x), m(jogador.pos.z));
  c.rotate(-jogador.guinada);
  c.fillStyle = '#f1e9da';
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(4, 4);
  c.lineTo(-4, 4);
  c.closePath();
  c.fill();
  c.restore();
}

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.ceil(Math.max(0, s)) % 60).padStart(2, '0')}`;
function atualizarHud(dt: number) {
  const a = combatentes.armaAtual(jogador);
  const f = ARMAS[a.tipo];
  hud.vivos.textContent = String(combatentes.vivos().length);
  hud.abates.textContent = String(jogador.abates);
  const v = Math.ceil(jogador.vida);
  hud.vida.style.width = `${v}%`;
  hud.vida.style.background = v <= 30 ? 'var(--perigo)' : 'var(--texto)';
  hud.vidaNum.textContent = String(v);
  hud.colete.style.width = `${jogador.colete}%`;
  hud.coleteNum.textContent = String(Math.ceil(jogador.colete));
  hud.kits.textContent = `Kits de reparo: ${jogador.kits}`;
  hud.pente.textContent = String(a.pente);
  hud.reserva.textContent = `/ ${jogador.municao}`;
  hud.municao.classList.toggle('baixa', a.pente <= f.pente * 0.2);
  hud.armaNome.textContent = jogador.recarga > 0 ? 'Recarregando…' : f.nome;
  hud.slots.textContent = jogador.armas[1] ? `1 ${ARMAS.pistola.nome} · 2 ${ARMAS[jogador.armas[1].tipo].nome}` : '';
  const z = zona.z;
  const fora = zona.fora(jogador.pos.x, jogador.pos.z);
  hud.zona.textContent = zona.acabou() ? 'Zona fechada' : z.encolhendo ? `Zona encolhendo · ${mmss(z.tempo)}` : `Zona encolhe em ${mmss(z.tempo)}`;
  hud.zona.classList.toggle('alerta', z.encolhendo || fora);
  hud.tempestade.style.opacity = fora ? '1' : '0';
  if (fora && avisoTempo <= 0) avisar('Fora da zona', 1.2);
  const pronto = itemPerto && itens.includes(itemPerto) ? itemPerto : null;
  hud.dica.innerHTML = '';
  if (pronto && jogador.estado === 'vivo') {
    const k = document.createElement('kbd');
    k.textContent = controle.e.toque ? 'Pegar' : 'E';
    hud.dica.append(k, `Trocar por ${ARMAS[pronto.arma!].nome}`);
  }
  abertura = Math.max(0, abertura - dt * 2.2);
  const movendo = Math.hypot(jogador.vel.x, jogador.vel.z) > 1;
  hud.mira.style.setProperty('--a', `${5 + f.dispersao * 220 + abertura * 14 + (movendo ? 4 : 0)}px`);
  hud.mira.style.opacity = jogador.estado === 'vivo' ? '1' : '0';
  marcaTempo = Math.max(0, marcaTempo - dt);
  hud.marca.style.opacity = marcaTempo > 0 ? '1' : '0';
  danoTela = Math.max(0, danoTela - dt * 0.9);
  hud.dano.style.opacity = String(Math.max(danoTela, jogador.vida <= 30 ? 0.25 : 0));
  if (avisoTempo > 0 && (avisoTempo -= dt) <= 0) hud.aviso.classList.remove('visivel');
  desenharMapa();
}

/** Um passo da simulação. Separado do desenho para poder ser testado em tempo acelerado. */
let tiqueZona = 0;
function simular(dt: number) {
  jogo.tempo += dt;
  if (jogo.fase === 'jogando') controlarJogador(dt);
  else combatentes.fisica(jogador, 0, 0, false, dt);
  for (const c of combatentes.lista) {
    if (!c.humano) bots.atualizar(c, dt);
    tique(c, dt);
  }
  if (zona.atualizar(dt)) {
    avisar('A zona está encolhendo', 2.5);
    som.zona();
  }
  if ((tiqueZona += dt) >= 1) {
    tiqueZona = 0;
    for (const c of combatentes.lista) {
      if (c.estado !== 'vivo' || !zona.fora(c.pos.x, c.pos.z)) continue;
      if (c.humano) danoTela = Math.min(1, danoTela + 0.2);
      // o dano da zona ignora o colete
      const colete = c.colete;
      c.colete = 0;
      combatentes.ferir(c, zona.z.dano, null);
      c.colete = colete;
    }
  }
  if (jogo.fase === 'jogando' && combatentes.vivos().length === 1 && jogador.estado !== 'morto') {
    jogo.vitoria = true;
    jogo.colocacao = 1;
    jogo.fase = 'caindo';
    jogo.espera = 2.5;
    controle.e.ativo = false;
    controle.limpar();
    avisar('Vitória', 3);
    som.vitoria();
  }
  if (jogo.fase === 'caindo' && (jogo.espera -= dt) <= 0) void encerrar();
}

const relogio = new THREE.Clock();
let orbita = 0;
let revisao = 0;
function quadro() {
  const dt = Math.min(relogio.getDelta(), 0.05);
  const emJogo = jogo.fase === 'jogando' || jogo.fase === 'caindo';
  if (emJogo) {
    simular(dt);
    posicionarCamera();
    // Longe da câmera: sem pose de braços, sem sombra e, bem longe, sem desenho.
    const revisar = (revisao += dt) > 0.4;
    if (revisar) revisao = 0;
    for (const c of combatentes.lista) {
      const d = c.pos.distanceTo(camera.position);
      c.perto = d < 95;
      if (revisar && c.estado !== 'morto') {
        c.raiz.visible = d < 190;
        const sombra = d < 50;
        if (sombra !== c.sombra) {
          c.sombra = sombra;
          c.raiz.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = sombra) : 0));
        }
      }
      combatentes.animar(c, dt);
    }
    for (const it of itens) {
      const d = Math.hypot(it.x - camera.position.x, it.z - camera.position.z);
      it.malha.visible = d < 75;
      if (it.malha.visible) (it.malha.userData.corpo as THREE.Object3D).rotation.y += dt * 1.4;
    }
    atualizarHud(dt);
  } else if (jogo.fase !== 'pausa') {
    orbita += dt * 0.05;
    camera.position.set(Math.cos(orbita) * 46, 20, Math.sin(orbita) * 46 - 16);
    camera.lookAt(0, 6, -16);
  }
  for (const f of faiscas) {
    if (f.vida <= 0) continue;
    f.vida -= dt;
    f.v.y -= 14 * dt;
    f.m.position.addScaledVector(f.v, dt);
    if (f.vida <= 0) f.m.visible = false;
  }
  for (const r of rastros) {
    const m = r.material as THREE.MeshBasicMaterial;
    m.opacity = Math.max(0, m.opacity - dt * 9);
  }
  clarao.intensity = Math.max(0, clarao.intensity - dt * 420);
  mundo.atualizarSol(emJogo || jogo.fase === 'pausa' ? jogador.pos : tmp.set(0, 0, 0));
  renderer.render(cena, camera);
}
renderer.setAnimationLoop(quadro);

const botao = $<HTMLButtonElement>('jogar');
botao.disabled = false;
botao.textContent = 'Jogar';
void api.ranking().then((r) => mostrarRanking(r));

if (TESTE) Object.assign(window, { __jogo: { renderer, camera, posicionarCamera, jogo, jogador, combatentes, zona, itens, mundo, controle, simular, comecar, pegar, tiroDoJogador } });
