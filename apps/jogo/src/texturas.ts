import * as THREE from 'three';
import { semente } from './util';

// Texturas geradas em canvas: cor + mapa de normais derivado de um mapa de altura.
// Tudo ladrilhável, para repetir no terreno e nas paredes sem emenda aparente.

type Amostra = { r: number; g: number; b: number; h: number };
export type Material = { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture };

function ruidoPeriodico(tam: number, celulas: number, rnd: () => number) {
  const grade = new Float32Array(celulas * celulas);
  for (let i = 0; i < grade.length; i++) grade[i] = rnd();
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (x: number, y: number) => {
    const fx = (x / tam) * celulas;
    const fy = (y / tam) * celulas;
    const x0 = Math.floor(fx) % celulas;
    const y0 = Math.floor(fy) % celulas;
    const x1 = (x0 + 1) % celulas;
    const y1 = (y0 + 1) % celulas;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    return lerp(lerp(grade[y0 * celulas + x0], grade[y0 * celulas + x1], sx), lerp(grade[y1 * celulas + x0], grade[y1 * celulas + x1], sx), sy);
  };
}

function fbm(tam: number, base: number, oitavas: number, rnd: () => number) {
  const camadas = Array.from({ length: oitavas }, (_, i) => ruidoPeriodico(tam, base * 2 ** i, rnd));
  return (x: number, y: number) => {
    let v = 0;
    let peso = 0.5;
    let total = 0;
    for (const c of camadas) {
      v += c(x, y) * peso;
      total += peso;
      peso *= 0.5;
    }
    return v / total;
  };
}

function gerar(tam: number, forca: number, fn: (x: number, y: number) => Amostra): Material {
  const cor = document.createElement('canvas');
  const normal = document.createElement('canvas');
  cor.width = cor.height = normal.width = normal.height = tam;
  const cc = cor.getContext('2d')!;
  const nc = normal.getContext('2d')!;
  const ci = cc.createImageData(tam, tam);
  const ni = nc.createImageData(tam, tam);
  const alt = new Float32Array(tam * tam);
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const a = fn(x, y);
      const i = (y * tam + x) * 4;
      ci.data[i] = a.r;
      ci.data[i + 1] = a.g;
      ci.data[i + 2] = a.b;
      ci.data[i + 3] = 255;
      alt[y * tam + x] = a.h;
    }
  }
  const h = (x: number, y: number) => alt[((y + tam) % tam) * tam + ((x + tam) % tam)];
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * forca;
      const dy = (h(x, y - 1) - h(x, y + 1)) * forca;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * tam + x) * 4;
      ni.data[i] = (dx * inv * 0.5 + 0.5) * 255;
      ni.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      ni.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
    }
  }
  cc.putImageData(ci, 0, 0);
  nc.putImageData(ni, 0, 0);
  const map = new THREE.CanvasTexture(cor);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normal);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, normalMap };
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export function criarTexturas() {
  const T = 512;

  const rg = semente(11);
  const g1 = fbm(T, 4, 5, rg);
  const g2 = fbm(T, 32, 3, rg);
  const grama = gerar(T, 3, (x, y) => {
    const n = g1(x, y);
    const fio = g2(x, y);
    const [r, g, b] = mix(mix([52, 74, 34], [104, 118, 52], n), [128, 112, 70], Math.max(0, n - 0.62) * 2.2);
    const k = 0.78 + fio * 0.44;
    return { r: r * k, g: g * k, b: b * k, h: fio * 0.7 + n * 0.3 };
  });

  const rt = semente(23);
  const t1 = fbm(T, 6, 5, rt);
  const t2 = fbm(T, 48, 2, rt);
  const terra = gerar(T, 4, (x, y) => {
    const n = t1(x, y);
    const p = t2(x, y);
    const [r, g, b] = mix([84, 62, 44], [136, 108, 78], n);
    const k = p > 0.72 ? 1.25 : 0.85 + p * 0.3;
    return { r: r * k, g: g * k, b: b * k, h: n * 0.5 + (p > 0.72 ? 0.5 : p * 0.3) };
  });

  const rc = semente(37);
  const c1 = fbm(T, 3, 5, rc);
  const c2 = fbm(T, 64, 2, rc);
  const concreto = gerar(T, 2.5, (x, y) => {
    const n = c1(x, y);
    const p = c2(x, y);
    const junta = x % 256 < 3 || y % 128 < 3 ? 0.55 : 1;
    const mancha = Math.max(0, c1(x * 2, y * 2) - 0.6) * 1.4;
    const v = (120 + n * 55 + p * 22) * junta * (1 - mancha * 0.35);
    return { r: v, g: v * 0.985, b: v * 0.95, h: (n * 0.4 + p * 0.6) * junta };
  });

  const rm = semente(53);
  const m1 = fbm(T, 4, 4, rm);
  const m2 = fbm(T, 40, 2, rm);
  // Chapa ondulada de contêiner, em tons de cinza: a cor vem do material.
  const chapa = gerar(T, 5, (x, y) => {
    const onda = Math.sin((x / T) * Math.PI * 2 * 16) * 0.5 + 0.5;
    const n = m1(x, y);
    const ferrugem = Math.max(0, m1(x * 3, y) * 1.3 - 0.72) * 3 * (0.4 + (y / T) * 0.9);
    const base = 150 + onda * 70 + m2(x, y) * 20 - n * 25;
    const [r, g, b] = mix([base, base, base], [118, 58, 26], Math.min(1, ferrugem));
    return { r, g, b, h: onda * 0.8 + m2(x, y) * 0.2 };
  });

  const rx = semente(71);
  const x1 = fbm(T, 5, 4, rx);
  const x2 = fbm(T, 80, 2, rx);
  // Caixote de madeira com tábuas, moldura e pregos.
  const caixote = gerar(T, 5, (x, y) => {
    const borda = 44;
    const naMoldura = x < borda || x > T - borda || y < borda || y > T - borda;
    const u = naMoldura ? (x < borda || x > T - borda ? y : x) : x;
    const v = naMoldura ? (x < borda || x > T - borda ? x : y) : y;
    const veio = Math.sin(u * 0.012 + x1(u, v * 0.2) * 9) * 0.5 + 0.5;
    const fresta = !naMoldura && (v - borda) % 106 < 4 ? 0.35 : 1;
    const diagonal = !naMoldura && Math.abs(x - y) < 22;
    let [r, g, b] = mix([116, 82, 46], [168, 128, 78], veio * 0.6 + x2(x, y) * 0.4);
    const escuro = (naMoldura || diagonal ? 0.82 : 1) * fresta;
    const prego = naMoldura && (x % 128) - 22 < 8 && (x % 128) - 22 > 0 && (y % 128) - 22 < 8 && (y % 128) - 22 > 0;
    if (prego) [r, g, b] = [60, 60, 64];
    return { r: r * escuro, g: g * escuro, b: b * escuro, h: (naMoldura || diagonal ? 0.9 : 0.5) * fresta + veio * 0.12 };
  });

  const rk = semente(89);
  const k1 = fbm(T, 6, 4, rk);
  const casca = gerar(256, 6, (x, y) => {
    const sulco = Math.abs(Math.sin(x * 0.11 + k1(x * 2, y * 0.5) * 7));
    const [r, g, b] = mix([44, 32, 24], [98, 76, 54], sulco);
    return { r, g, b, h: sulco };
  });

  const rf = semente(97);
  const f1 = fbm(T, 10, 4, rf);
  const f2 = fbm(T, 70, 2, rf);
  const folhas = gerar(256, 5, (x, y) => {
    const n = f1(x * 2, y * 2);
    const p = f2(x * 2, y * 2);
    const [r, g, b] = mix([26, 56, 28], [86, 128, 48], n * 0.6 + p * 0.4);
    return { r, g, b, h: p };
  });

  const rp = semente(113);
  const p1 = fbm(T, 5, 5, rp);
  const p2 = fbm(T, 50, 2, rp);
  const pedra = gerar(256, 5, (x, y) => {
    const n = p1(x * 2, y * 2);
    const v = 92 + n * 70 + p2(x * 2, y * 2) * 26;
    return { r: v, g: v * 0.98, b: v * 0.94, h: n * 0.6 + p2(x * 2, y * 2) * 0.4 };
  });

  const ra = semente(131);
  const a1 = fbm(T, 30, 3, ra);
  const metal = gerar(256, 2, (x, y) => {
    const risco = a1(x * 6, y * 0.4);
    const v = 70 + risco * 50 + a1(x, y) * 20;
    return { r: v, g: v * 1.02, b: v * 1.05, h: risco };
  });

  return { grama, terra, concreto, chapa, caixote, casca, folhas, pedra, metal };
}

export type Texturas = ReturnType<typeof criarTexturas>;

export function repetir(m: Material, rx: number, ry: number): Material {
  const map = m.map.clone();
  const normalMap = m.normalMap.clone();
  map.repeat.set(rx, ry);
  normalMap.repeat.set(rx, ry);
  return { map, normalMap };
}
