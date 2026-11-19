import * as THREE from 'three';
import './estilo.css';
import { criarMundo, METADE, altura } from './mundo';
import { criarJogador } from './jogador';
import { criarArma } from './arma';
import { criarInimigos } from './inimigos';
import { api, type Linha } from './api';
import { ligarAudio, som } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const TESTE = new URLSearchParams(location.search).has('teste');

const renderer = new THREE.WebGLRenderer({ canvas: $<HTMLCanvasElement>('tela'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;

const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 900);
cena.add(camera);

const mundo = criarMundo(cena, renderer);
const jogador = criarJogador(camera, mundo);
const arma = criarArma(camera, cena, mundo.texturas);

function ajustar() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', ajustar);
ajustar();

type Fase = 'menu' | 'jogando' | 'pausa' | 'fim';
const jogo = { fase: 'menu' as Fase, onda: 0, pontos: 0, abates: 0, intervalo: 0, tempo: 0, partida: null as { id: string; token: string } | null };
let gatilho = false;

// Suprimentos: munição e reparo. Reaparecem a cada onda e caem de alguns robôs.
type Item = { malha: THREE.Mesh; tipo: 'municao' | 'reparo' };
const itens: Item[] = [];
const geoItem = new THREE.BoxGeometry(0.5, 0.34, 0.34);
const matItem = {
  municao: new THREE.MeshStandardMaterial({ ...mundo.texturas.metal, color: 0x6b7a3a, metalness: 0.6, roughness: 0.5, emissive: 0x2a3300 }),
  reparo: new THREE.MeshStandardMaterial({ ...mundo.texturas.metal, color: 0xd8452c, metalness: 0.4, roughness: 0.5, emissive: 0x5a1408 }),
};
function soltarItem(tipo: Item['tipo'], x: number, z: number) {
  const malha = new THREE.Mesh(geoItem, matItem[tipo]);
  malha.position.set(x, altura(x, z) + 0.55, z);
  malha.castShadow = true;
  cena.add(malha);
  itens.push({ malha, tipo });
}
function reporSuprimentos() {
  mundo.suprimentos.forEach(([x, z], i) => {
    if (!itens.some((it) => Math.hypot(it.malha.position.x - x, it.malha.position.z - z) < 1)) soltarItem(i % 3 === 2 ? 'reparo' : 'municao', x, z);
  });
}

// Faíscas de impacto reaproveitadas.
const faiscas = Array.from({ length: 48 }, () => {
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

// HUD
const hud = {
  raiz: $('hud'), onda: $('onda'), restam: $('restam'), pontos: $('pontos'), vida: $('vida'), vidaNum: $('vidaNum'), pente: $('pente'), reserva: $('reserva'),
  municao: document.querySelector<HTMLElement>('.municao')!, avisoArma: $('avisoArma'), aviso: $('aviso'), dano: $('dano'), mira: $('mira'), marca: $('marca'),
  mapa: $<HTMLCanvasElement>('mapa').getContext('2d')!,
};
let danoTela = 0;
let marcaTempo = 0;
let avisoTempo = 0;
function avisar(texto: string, seg = 2.2) {
  hud.aviso.textContent = texto;
  hud.aviso.classList.add('visivel');
  avisoTempo = seg;
}

const inimigos = await criarInimigos(cena, mundo, jogador);
inimigos.eventos.abate = (e, cabeca) => {
  jogo.abates++;
  jogo.pontos += inimigos.pontos(e) + (cabeca ? 50 : 0);
  som.abate();
  const sorte = Math.random();
  if (sorte < 0.3) soltarItem(sorte < 0.09 ? 'reparo' : 'municao', e.raiz.position.x, e.raiz.position.z);
};
inimigos.eventos.golpe = (dano) => {
  if (jogo.fase !== 'jogando') return;
  jogador.ferir(dano);
  danoTela = Math.min(1, danoTela + 0.25 + dano / 40);
  som.dano();
  if (!jogador.estado.vivo) encerrar();
};

const raycaster = new THREE.Raycaster();
const origem = new THREE.Vector3();
function disparar(dir: THREE.Vector3) {
  camera.getWorldPosition(origem);
  raycaster.set(origem, dir);
  raycaster.far = 300;
  const parede = raycaster.intersectObjects(mundo.solidos, false)[0];
  const distParede = parede ? parede.distance : 300;
  const acerto = inimigos.mirar(origem, dir, distParede);
  if (acerto) {
    const dano = 26 * (acerto.dist > 60 ? 0.7 : 1);
    const matou = inimigos.ferir(acerto, dano);
    faiscar(acerto.ponto, acerto.cabeca ? 0xfff0c0 : 0xff9a3a, matou ? 10 : 4);
    if (acerto.cabeca) som.cabeca();
    else som.acerto();
    marcaTempo = matou ? 0.3 : 0.14;
    arma.tracar(acerto.ponto);
  } else {
    const fim = parede ? parede.point : origem.clone().addScaledVector(dir, 120);
    if (parede) faiscar(fim, 0xc9b79a, 3);
    arma.tracar(fim);
  }
}

function proximaOnda() {
  jogo.onda++;
  if (jogo.onda > 1) jogo.pontos += 250 * (jogo.onda - 1);
  inimigos.gerarOnda(jogo.onda);
  reporSuprimentos();
  avisar(`Onda ${jogo.onda}`);
  som.onda();
}

async function comecar() {
  ligarAudio();
  inimigos.limpar();
  for (const it of itens) cena.remove(it.malha);
  itens.length = 0;
  jogador.reiniciar();
  arma.reiniciar();
  Object.assign(jogo, { fase: 'jogando', onda: 0, pontos: 0, abates: 0, intervalo: 1.2, tempo: 0, partida: null });
  danoTela = 0;
  $('menu').hidden = true;
  hud.raiz.hidden = false;
  if (!TESTE) renderer.domElement.requestPointerLock();
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
  gatilho = false;
  document.exitPointerLock?.();
  hud.raiz.hidden = true;
  $('menu').hidden = false;
  $('resumo').textContent = 'Você caiu. As máquinas ficaram com o vale desta vez.';
  $('resultado').hidden = false;
  $('rPontos').textContent = jogo.pontos.toLocaleString('pt-BR');
  $('rAbates').textContent = String(jogo.abates);
  $('rOnda').textContent = String(jogo.onda);
  $('rPos').textContent = '…';
  const botao = $<HTMLButtonElement>('jogar');
  botao.textContent = 'Jogar de novo';
  const nome = $<HTMLInputElement>('nome').value;
  localStorage.setItem('sucata:nome', nome);
  const r = jogo.partida ? await api.finalizar(jogo.partida, { nome, pontos: jogo.pontos, abates: jogo.abates, onda: jogo.onda }) : null;
  $('rPos').textContent = r ? `${r.posicao}º` : '—';
  mostrarRanking(r ? r.ranking : await api.ranking(), r?.posicao);
}

// Entrada
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (jogo.fase === 'pausa') return void renderer.domElement.requestPointerLock();
  gatilho = jogo.fase === 'jogando';
});
addEventListener('mouseup', (e) => e.button === 0 && (gatilho = false));
addEventListener('mousemove', (e) => {
  if (jogo.fase === 'jogando' && document.pointerLockElement === renderer.domElement) jogador.olhar(e.movementX, e.movementY);
});
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && jogo.fase === 'jogando') arma.recarregar();
  if (e.code === 'Space' && jogo.fase === 'jogando') e.preventDefault();
});
document.addEventListener('pointerlockchange', () => {
  const travado = document.pointerLockElement === renderer.domElement;
  if (!travado && jogo.fase === 'jogando' && !TESTE) {
    jogo.fase = 'pausa';
    gatilho = false;
    avisar('Pausado · clique para continuar', 9999);
  } else if (travado && jogo.fase === 'pausa') {
    jogo.fase = 'jogando';
    avisoTempo = 0.01;
  }
});
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  void comecar();
});
$<HTMLInputElement>('nome').value = localStorage.getItem('sucata:nome') ?? '';

function desenharMapa() {
  const c = hud.mapa;
  const T = 150;
  const k = T / (METADE * 2);
  c.clearRect(0, 0, T, T);
  c.fillStyle = 'rgba(241,233,218,0.28)';
  for (const b of mundo.caixas) {
    if (b.maxX - b.minX > 100 || b.maxZ - b.minZ > 100) continue;
    c.fillRect((b.minX + METADE) * k, (b.minZ + METADE) * k, Math.max(1, (b.maxX - b.minX) * k), Math.max(1, (b.maxZ - b.minZ) * k));
  }
  c.fillStyle = '#6b7a3a';
  for (const it of itens) c.fillRect((it.malha.position.x + METADE) * k - 1.5, (it.malha.position.z + METADE) * k - 1.5, 3, 3);
  c.fillStyle = '#e5432d';
  for (const e of inimigos.lista) {
    if (e.morto >= 0) continue;
    c.beginPath();
    c.arc((e.raiz.position.x + METADE) * k, (e.raiz.position.z + METADE) * k, e.tipo === 'brutamontes' ? 3.2 : 2.2, 0, 6.3);
    c.fill();
  }
  const px = (jogador.pos.x + METADE) * k;
  const pz = (jogador.pos.z + METADE) * k;
  c.save();
  c.translate(px, pz);
  c.rotate(-camera.rotation.y);
  c.fillStyle = '#f1e9da';
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(4, 4);
  c.lineTo(-4, 4);
  c.closePath();
  c.fill();
  c.restore();
}

function atualizarHud(dt: number) {
  const a = arma.estado;
  hud.onda.textContent = String(Math.max(1, jogo.onda));
  hud.restam.textContent = String(inimigos.vivos());
  hud.pontos.textContent = jogo.pontos.toLocaleString('pt-BR');
  const v = Math.ceil(jogador.estado.vida);
  hud.vida.style.width = `${v}%`;
  hud.vida.style.background = v <= 30 ? 'var(--perigo)' : 'var(--texto)';
  hud.vidaNum.textContent = String(v);
  hud.pente.textContent = String(a.pente);
  hud.reserva.textContent = `/ ${a.reserva}`;
  hud.municao.classList.toggle('baixa', a.pente <= 6);
  hud.avisoArma.textContent = a.recarregando > 0 ? 'Recarregando…' : a.pente === 0 && a.reserva === 0 ? 'Sem munição' : a.pente <= 6 ? 'R para recarregar' : 'Fuzil AR-7';
  hud.mira.style.setProperty('--a', `${6 + a.abertura * 14 + (jogador.estado.andando ? 4 : 0)}px`);
  marcaTempo = Math.max(0, marcaTempo - dt);
  hud.marca.style.opacity = marcaTempo > 0 ? '1' : '0';
  danoTela = Math.max(0, danoTela - dt * 0.9);
  hud.dano.style.opacity = String(Math.max(danoTela, jogador.estado.vida <= 30 ? 0.25 : 0));
  if (avisoTempo > 0 && (avisoTempo -= dt) <= 0) hud.aviso.classList.remove('visivel');
  desenharMapa();
}

const relogio = new THREE.Clock();
let orbita = 0;
function quadro() {
  const dt = Math.min(relogio.getDelta(), 0.05);
  if (jogo.fase === 'jogando') {
    jogo.tempo += dt;
    jogador.atualizar(dt, arma.estado.recuoCam);
    camera.updateMatrixWorld();
    const dir = arma.tentarAtirar(gatilho, jogador.estado.andando);
    if (dir) disparar(dir);
    arma.atualizar(dt, jogador.passoFase(), jogador.estado.andando);
    inimigos.atualizar(dt);
    if (inimigos.vivos() === 0 && jogo.fase === 'jogando') {
      if (jogo.intervalo <= 0) jogo.intervalo = jogo.onda === 0 ? 1.2 : 5;
      jogo.intervalo -= dt;
      if (jogo.intervalo <= 0) proximaOnda();
      else if (jogo.onda > 0 && avisoTempo <= 0) avisar(`Onda ${jogo.onda} vencida`, 2);
    }
    for (let i = itens.length - 1; i >= 0; i--) {
      const it = itens[i];
      it.malha.rotation.y += dt * 1.6;
      const d = Math.hypot(it.malha.position.x - jogador.pos.x, it.malha.position.z - jogador.pos.z);
      const util = it.tipo === 'municao' ? arma.estado.reserva < 240 : jogador.estado.vida < jogador.estado.vidaMax;
      if (d < 1.3 && Math.abs(it.malha.position.y - jogador.pos.y) < 2.2 && util) {
        if (it.tipo === 'municao') arma.estado.reserva = Math.min(240, arma.estado.reserva + 45);
        else jogador.estado.vida = Math.min(jogador.estado.vidaMax, jogador.estado.vida + 35);
        som.coleta();
        cena.remove(it.malha);
        itens.splice(i, 1);
      }
    }
    atualizarHud(dt);
  } else if (jogo.fase !== 'pausa') {
    // câmera de apresentação girando em volta do vale
    orbita += dt * 0.05;
    camera.position.set(Math.cos(orbita) * 34, 15, Math.sin(orbita) * 34);
    camera.lookAt(0, 4, -8);
    inimigos.atualizar(0);
  }
  for (const f of faiscas) {
    if (f.vida <= 0) continue;
    f.vida -= dt;
    f.v.y -= 14 * dt;
    f.m.position.addScaledVector(f.v, dt);
    if (f.vida <= 0) f.m.visible = false;
  }
  arma.grupo.visible = jogo.fase === 'jogando' || jogo.fase === 'pausa';
  mundo.atualizarSol(jogo.fase === 'jogando' || jogo.fase === 'pausa' ? jogador.pos : new THREE.Vector3());
  renderer.render(cena, camera);
}
renderer.setAnimationLoop(quadro);

const botao = $<HTMLButtonElement>('jogar');
botao.disabled = false;
botao.textContent = 'Jogar';
void api.ranking().then((r) => mostrarRanking(r));

if (TESTE) Object.assign(window, { __jogo: { renderer, jogo, jogador, arma, inimigos, mundo, camera, comecar, disparar, olhar: jogador.olhar, gatilho: (v: boolean) => (gatilho = v) } });
