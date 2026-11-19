import * as THREE from 'three';
import type { Mundo } from './mundo';
import { limitar } from './util';

const RAIO = 0.4;
const OLHOS = 1.68;
const GRAVIDADE = 22;

export function criarJogador(camera: THREE.PerspectiveCamera, mundo: Mundo) {
  const pos = new THREE.Vector3(0, 0, 0); // posição dos pés
  const vel = new THREE.Vector3();
  const teclas = new Set<string>();
  let guinada = 0;
  let arfagem = 0;
  let noChao = true;
  let passo = 0;
  const estado = { vida: 100, vidaMax: 100, vivo: true, correndo: false, andando: false };

  addEventListener('keydown', (e) => teclas.add(e.code));
  addEventListener('keyup', (e) => teclas.delete(e.code));
  addEventListener('blur', () => teclas.clear());

  function olhar(dx: number, dy: number, sens = 0.0022) {
    guinada -= dx * sens;
    arfagem = limitar(arfagem - dy * sens, -1.5, 1.5);
  }

  function reiniciar() {
    pos.set(0, 0, 0);
    vel.set(0, 0, 0);
    guinada = arfagem = 0;
    estado.vida = estado.vidaMax;
    estado.vivo = true;
  }

  const desejo = new THREE.Vector3();
  function atualizar(dt: number, recuo: number) {
    const frente = (teclas.has('KeyW') || teclas.has('ArrowUp') ? 1 : 0) - (teclas.has('KeyS') || teclas.has('ArrowDown') ? 1 : 0);
    const lado = (teclas.has('KeyD') || teclas.has('ArrowRight') ? 1 : 0) - (teclas.has('KeyA') || teclas.has('ArrowLeft') ? 1 : 0);
    estado.correndo = teclas.has('ShiftLeft') && frente > 0;
    const velMax = estado.correndo ? 8.2 : 5.2;
    const s = Math.sin(guinada);
    const c = Math.cos(guinada);
    desejo.set(-s * frente + c * lado, 0, -c * frente - s * lado);
    if (desejo.lengthSq() > 0) desejo.normalize().multiplyScalar(velMax);
    estado.andando = desejo.lengthSq() > 0 && noChao;

    const acel = noChao ? 14 : 3;
    const k = 1 - Math.exp(-acel * dt);
    vel.x += (desejo.x - vel.x) * k;
    vel.z += (desejo.z - vel.z) * k;
    if (noChao && teclas.has('Space')) {
      vel.y = 7.2;
      noChao = false;
    }
    vel.y -= GRAVIDADE * dt;

    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.y += vel.y * dt;
    const piso = mundo.resolver(pos, RAIO, pos.y);
    if (pos.y <= piso) {
      pos.y = piso;
      vel.y = 0;
      noChao = true;
    } else if (pos.y - piso > 0.25) {
      noChao = false;
    } else if (noChao) {
      pos.y = piso; // gruda no chão ao descer ladeira
    }

    if (estado.andando) passo += dt * (estado.correndo ? 13 : 9);
    const balanco = estado.andando ? Math.sin(passo) * 0.035 : 0;
    camera.position.set(pos.x, pos.y + OLHOS + balanco, pos.z);
    camera.rotation.set(arfagem + recuo, guinada, 0, 'YXZ');
  }

  function ferir(dano: number) {
    if (!estado.vivo) return;
    estado.vida = Math.max(0, estado.vida - dano);
    if (estado.vida === 0) estado.vivo = false;
  }

  return { pos, vel, estado, olhar, atualizar, ferir, reiniciar, raio: RAIO, passoFase: () => passo };
}

export type Jogador = ReturnType<typeof criarJogador>;
