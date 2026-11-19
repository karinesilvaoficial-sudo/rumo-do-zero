import * as THREE from 'three';
import { METADE } from './mundo';

// Cada fase: a zona espera, depois encolhe até o novo raio. O dano é por segundo, fora dela.
const FASES = [
  { raio: 95, espera: 40, fecha: 30, dano: 2 },
  { raio: 60, espera: 30, fecha: 25, dano: 4 },
  { raio: 35, espera: 25, fecha: 22, dano: 6 },
  { raio: 16, espera: 20, fecha: 20, dano: 10 },
  { raio: 0, espera: 15, fecha: 20, dano: 16 },
];

export function criarZona(cena: THREE.Scene) {
  const parede = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 140, 72, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, fog: false }),
  );
  parede.position.y = 40;
  parede.renderOrder = 5;
  cena.add(parede);

  const z = { x: 0, z: 0, raio: 170, fase: 0, tempo: 0, encolhendo: false, dano: 1, deX: 0, deZ: 0, deRaio: 170, paraX: 0, paraZ: 0, paraRaio: FASES[0].raio };

  function sortearDestino() {
    const f = FASES[z.fase];
    const folga = Math.max(0, z.raio - f.raio) * 0.6;
    const ang = Math.random() * Math.PI * 2;
    const d = Math.random() * folga;
    const lim = METADE - Math.min(f.raio, 30) - 4;
    z.paraX = Math.min(lim, Math.max(-lim, z.x + Math.cos(ang) * d));
    z.paraZ = Math.min(lim, Math.max(-lim, z.z + Math.sin(ang) * d));
    z.paraRaio = f.raio;
  }

  function reiniciar() {
    Object.assign(z, { x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30, raio: 170, fase: 0, tempo: FASES[0].espera, encolhendo: false, dano: 1 });
    sortearDestino();
  }

  /** Devolve true no quadro em que a zona começa a encolher. */
  function atualizar(dt: number) {
    let comecou = false;
    if (z.fase < FASES.length) {
      const f = FASES[z.fase];
      z.tempo -= dt;
      if (!z.encolhendo && z.tempo <= 0) {
        z.encolhendo = comecou = true;
        z.tempo = f.fecha;
        z.dano = f.dano;
        Object.assign(z, { deX: z.x, deZ: z.z, deRaio: z.raio });
      } else if (z.encolhendo) {
        const t = 1 - Math.max(0, z.tempo) / f.fecha;
        z.x = z.deX + (z.paraX - z.deX) * t;
        z.z = z.deZ + (z.paraZ - z.deZ) * t;
        z.raio = z.deRaio + (z.paraRaio - z.deRaio) * t;
        if (z.tempo <= 0) {
          z.encolhendo = false;
          z.fase++;
          if (z.fase < FASES.length) {
            z.tempo = FASES[z.fase].espera;
            sortearDestino();
          }
        }
      }
    }
    parede.position.x = z.x;
    parede.position.z = z.z;
    parede.scale.set(Math.max(0.5, z.raio), 1, Math.max(0.5, z.raio));
    return comecou;
  }

  const fora = (x: number, zz: number) => Math.hypot(x - z.x, zz - z.z) > z.raio;
  const acabou = () => z.fase >= FASES.length;
  return { z, reiniciar, atualizar, fora, acabou };
}

export type Zona = ReturnType<typeof criarZona>;
