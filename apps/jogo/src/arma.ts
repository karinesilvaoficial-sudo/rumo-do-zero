import * as THREE from 'three';
import type { Texturas } from './texturas';
import { som } from './audio';

const CADENCIA = 0.095; // segundos entre tiros
const PENTE = 30;
const RECARGA = 1.7;

export function criarArma(camera: THREE.PerspectiveCamera, cena: THREE.Scene, tx: Texturas) {
  const aco = new THREE.MeshStandardMaterial({ map: tx.metal.map, color: 0x4a4e54, metalness: 0.85, roughness: 0.42 });
  const polimero = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.7 });
  const madeira = new THREE.MeshStandardMaterial({ map: tx.caixote.map, color: 0x9a6238, roughness: 0.55 });
  const laranja = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5, emissive: 0x3a1500 });

  const arma = new THREE.Group();
  const peca = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    arma.add(m);
    return m;
  };
  peca(new THREE.BoxGeometry(0.055, 0.085, 0.42), aco, 0, 0, -0.05); // caixa da culatra
  peca(new THREE.BoxGeometry(0.05, 0.03, 0.3), polimero, 0, 0.055, -0.08); // trilho
  peca(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 10), aco, 0, 0.012, -0.42, Math.PI / 2); // cano
  peca(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 10), polimero, 0, 0.012, -0.61, Math.PI / 2); // quebra-chama
  peca(new THREE.BoxGeometry(0.058, 0.06, 0.24), madeira, 0, -0.012, -0.34); // guarda-mão
  peca(new THREE.BoxGeometry(0.042, 0.18, 0.07), polimero, 0, -0.12, -0.1, 0.22); // carregador
  peca(new THREE.BoxGeometry(0.044, 0.11, 0.05), polimero, 0, -0.085, 0.1, -0.3); // empunhadura
  peca(new THREE.BoxGeometry(0.05, 0.075, 0.24), polimero, 0, -0.012, 0.28); // coronha
  peca(new THREE.BoxGeometry(0.012, 0.03, 0.012), laranja, 0, 0.085, -0.2); // massa de mira
  peca(new THREE.BoxGeometry(0.03, 0.028, 0.02), polimero, 0, 0.082, 0.06); // alça de mira
  arma.traverse((o) => (o.castShadow = false));

  const clarao = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  clarao.position.set(0, 0.012, -0.68);
  const clarao2 = clarao.clone();
  clarao2.rotation.y = Math.PI / 2;
  clarao.add(clarao2);
  arma.add(clarao);
  const luz = new THREE.PointLight(0xffb060, 0, 14, 2);
  luz.position.set(0, 0.05, -0.7);
  arma.add(luz);

  const REPOUSO = new THREE.Vector3(0.15, -0.16, -0.36);
  arma.scale.setScalar(0.72);
  arma.rotation.order = 'YXZ';
  arma.position.copy(REPOUSO);
  camera.add(arma);

  // Rastros de bala reaproveitados.
  const rastros = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 1), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.frustumCulled = false;
    cena.add(m);
    return m;
  });
  let iRastro = 0;

  const estado = { pente: PENTE, reserva: 120, recarregando: 0, espera: 0, coice: 0, recuoCam: 0, abertura: 0 };
  const boca = new THREE.Vector3();

  function reiniciar() {
    Object.assign(estado, { pente: PENTE, reserva: 120, recarregando: 0, espera: 0, coice: 0, recuoCam: 0, abertura: 0 });
  }

  function recarregar() {
    if (estado.recarregando > 0 || estado.pente === PENTE || estado.reserva === 0) return;
    estado.recarregando = RECARGA;
    som.recarga();
  }

  /** Devolve a direção do disparo, ou null se não atirou neste quadro. */
  function tentarAtirar(gatilho: boolean, movendo: boolean): THREE.Vector3 | null {
    if (!gatilho || estado.espera > 0 || estado.recarregando > 0) return null;
    if (estado.pente === 0) {
      estado.espera = 0.25;
      som.seco();
      recarregar();
      return null;
    }
    estado.pente--;
    estado.espera = CADENCIA;
    estado.coice = 1;
    estado.recuoCam += 0.012;
    const desvio = 0.004 + estado.abertura * 0.03 + (movendo ? 0.012 : 0);
    estado.abertura = Math.min(1, estado.abertura + 0.14);
    const dir = new THREE.Vector3((Math.random() - 0.5) * desvio * 2, (Math.random() - 0.5) * desvio * 2, -1).normalize().transformDirection(camera.matrixWorld);
    (clarao.material as THREE.MeshBasicMaterial).opacity = 1;
    clarao.rotation.z = Math.random() * Math.PI;
    clarao.scale.setScalar(0.8 + Math.random() * 0.6);
    luz.intensity = 26;
    som.tiro();
    return dir;
  }

  function tracar(fim: THREE.Vector3) {
    clarao.getWorldPosition(boca);
    const r = rastros[iRastro++ % rastros.length];
    const comp = boca.distanceTo(fim);
    r.position.copy(boca).lerp(fim, 0.5);
    r.lookAt(fim);
    r.scale.set(1, 1, comp);
    (r.material as THREE.MeshBasicMaterial).opacity = 0.75;
  }

  function atualizar(dt: number, fasePasso: number, andando: boolean) {
    estado.espera = Math.max(0, estado.espera - dt);
    estado.coice = Math.max(0, estado.coice - dt * 9);
    estado.recuoCam *= Math.exp(-dt * 9);
    estado.abertura = Math.max(0, estado.abertura - dt * 2.2);
    if (estado.recarregando > 0) {
      estado.recarregando -= dt;
      if (estado.recarregando <= 0) {
        const n = Math.min(PENTE - estado.pente, estado.reserva);
        estado.pente += n;
        estado.reserva -= n;
        estado.recarregando = 0;
      }
    }
    const baixa = estado.recarregando > 0 ? Math.sin((1 - estado.recarregando / RECARGA) * Math.PI) : 0;
    const bx = andando ? Math.cos(fasePasso * 0.5) * 0.008 : 0;
    const by = andando ? Math.abs(Math.sin(fasePasso * 0.5)) * 0.008 : 0;
    arma.position.set(REPOUSO.x + bx, REPOUSO.y - by - baixa * 0.16, REPOUSO.z + estado.coice * 0.05);
    arma.rotation.set(estado.coice * 0.06 - baixa * 0.7, 0, baixa * 0.35);
    const mc = clarao.material as THREE.MeshBasicMaterial;
    mc.opacity = Math.max(0, mc.opacity - dt * 22);
    luz.intensity = Math.max(0, luz.intensity - dt * 420);
    for (const r of rastros) {
      const m = r.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, m.opacity - dt * 9);
    }
  }

  return { grupo: arma, estado, tentarAtirar, tracar, recarregar, atualizar, reiniciar, PENTE };
}

export type Arma = ReturnType<typeof criarArma>;
