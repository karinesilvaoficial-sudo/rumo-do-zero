import * as THREE from 'three';
import type { Texturas } from './texturas';

export type TipoArma = 'pistola' | 'sub' | 'fuzil' | 'escopeta' | 'precisao';

export const ARMAS: Record<TipoArma, { nome: string; dano: number; cadencia: number; pente: number; recarga: number; dispersao: number; alcance: number; balins: number; grave: number; valor: number }> = {
  pistola: { nome: 'Pistola P9', dano: 17, cadencia: 0.26, pente: 12, recarga: 1.2, dispersao: 0.012, alcance: 45, balins: 1, grave: 0.2, valor: 0 },
  sub: { nome: 'Submetralhadora Vespa', dano: 13, cadencia: 0.075, pente: 28, recarga: 1.5, dispersao: 0.028, alcance: 40, balins: 1, grave: 0.1, valor: 2 },
  escopeta: { nome: 'Escopeta Trovão', dano: 9, cadencia: 0.85, pente: 6, recarga: 2.2, dispersao: 0.07, alcance: 22, balins: 8, grave: 1, valor: 1 },
  fuzil: { nome: 'Fuzil AR-7', dano: 24, cadencia: 0.11, pente: 30, recarga: 1.8, dispersao: 0.012, alcance: 90, balins: 1, grave: 0.45, valor: 3 },
  precisao: { nome: 'Rifle Longo', dano: 72, cadencia: 1.1, pente: 5, recarga: 2.4, dispersao: 0.002, alcance: 170, balins: 1, grave: 0.9, valor: 2 },
};

export type TipoItem = 'arma' | 'municao' | 'colete' | 'kit';
export type Item = { tipo: TipoItem; arma?: TipoArma; pente?: number; malha: THREE.Object3D; x: number; z: number };

export function criarFabricaDeArmas(tx: Texturas) {
  const aco = new THREE.MeshStandardMaterial({ map: tx.metal.map, color: 0x4a4e54, metalness: 0.85, roughness: 0.42 });
  const polimero = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.7 });
  const madeira = new THREE.MeshStandardMaterial({ map: tx.caixote.map, color: 0x9a6238, roughness: 0.55 });
  const laranja = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5, emissive: 0x3a1500 });
  const caixa = (lx: number, ly: number, lz: number) => new THREE.BoxGeometry(lx, ly, lz);
  const cano = (r: number, c: number) => new THREE.CylinderGeometry(r, r, c, 8).rotateX(Math.PI / 2);

  // Cada arma aponta para -Z, com a empunhadura na origem. `boca` é a ponta do cano.
  function modelo(tipo: TipoArma) {
    const g = new THREE.Group();
    const p = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, z: number, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      g.add(m);
    };
    let boca = 0.3;
    if (tipo === 'pistola') {
      p(caixa(0.035, 0.05, 0.2), aco, 0.07, -0.06);
      p(caixa(0.032, 0.11, 0.045), polimero, 0, 0, -0.2);
      p(caixa(0.01, 0.014, 0.01), laranja, 0.102, -0.14);
      boca = 0.17;
    } else if (tipo === 'sub') {
      p(caixa(0.05, 0.07, 0.3), polimero, 0.07, -0.08);
      p(cano(0.013, 0.14), aco, 0.075, -0.3);
      p(caixa(0.034, 0.2, 0.045), aco, -0.06, -0.12, 0.1);
      p(caixa(0.036, 0.1, 0.045), polimero, 0, 0, -0.25);
      p(caixa(0.02, 0.02, 0.2), aco, 0.08, 0.17);
      boca = 0.38;
    } else if (tipo === 'escopeta') {
      p(caixa(0.05, 0.07, 0.3), aco, 0.07, -0.05);
      p(cano(0.02, 0.5), aco, 0.085, -0.42);
      p(cano(0.018, 0.4), polimero, 0.045, -0.38);
      p(caixa(0.055, 0.05, 0.16), madeira, 0.045, -0.36);
      p(caixa(0.045, 0.085, 0.3), madeira, 0.04, 0.24, -0.12);
      p(caixa(0.036, 0.09, 0.045), madeira, 0, 0.02, -0.3);
      boca = 0.68;
    } else if (tipo === 'fuzil') {
      p(caixa(0.055, 0.085, 0.42), aco, 0.075, -0.05);
      p(caixa(0.05, 0.03, 0.3), polimero, 0.13, -0.08);
      p(cano(0.014, 0.34), aco, 0.087, -0.42);
      p(cano(0.022, 0.07), polimero, 0.087, -0.61);
      p(caixa(0.058, 0.06, 0.24), madeira, 0.063, -0.34);
      p(caixa(0.042, 0.18, 0.07), polimero, -0.045, -0.1, 0.22);
      p(caixa(0.044, 0.11, 0.05), polimero, 0, 0.1, -0.3);
      p(caixa(0.05, 0.075, 0.24), polimero, 0.063, 0.28);
      p(caixa(0.012, 0.03, 0.012), laranja, 0.16, -0.2);
      boca = 0.66;
    } else {
      p(caixa(0.05, 0.075, 0.5), madeira, 0.07, -0.02);
      p(cano(0.013, 0.62), aco, 0.09, -0.55);
      p(cano(0.028, 0.26), polimero, 0.15, -0.08);
      p(caixa(0.014, 0.03, 0.03), aco, 0.12, -0.02);
      p(caixa(0.014, 0.03, 0.03), aco, 0.12, -0.16);
      p(caixa(0.04, 0.09, 0.04), madeira, 0, 0.08, -0.3);
      p(caixa(0.045, 0.09, 0.3), madeira, 0.05, 0.36, -0.08);
      boca = 0.86;
    }
    g.userData.boca = boca;
    return g;
  }

  const anel = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.7, depthWrite: false }));
  const matItem = {
    municao: new THREE.MeshStandardMaterial({ map: tx.metal.map, color: 0x6b7a3a, metalness: 0.5, roughness: 0.5, emissive: 0x1c2400 }),
    colete: new THREE.MeshStandardMaterial({ color: 0x3f5f78, roughness: 0.75, emissive: 0x0a1722 }),
    kit: new THREE.MeshStandardMaterial({ color: 0xd8452c, roughness: 0.55, emissive: 0x4a1208 }),
    cruz: new THREE.MeshBasicMaterial({ color: 0xf1e9da }),
  };

  /** Objeto visual de um item no chão: gira devagar e tem um anel para ser visto de longe. */
  function visualDeItem(tipo: TipoItem, arma?: TipoArma) {
    const g = new THREE.Group();
    const corpo = new THREE.Group();
    if (tipo === 'arma' && arma) {
      const m = modelo(arma);
      m.scale.setScalar(1.5);
      m.rotation.z = 0.3;
      corpo.add(m);
    } else if (tipo === 'municao') {
      corpo.add(new THREE.Mesh(caixa(0.42, 0.26, 0.26), matItem.municao));
    } else if (tipo === 'colete') {
      corpo.add(new THREE.Mesh(caixa(0.46, 0.5, 0.2), matItem.colete));
      const gola = new THREE.Mesh(caixa(0.2, 0.12, 0.22), polimero);
      gola.position.y = 0.26;
      corpo.add(gola);
    } else {
      corpo.add(new THREE.Mesh(caixa(0.4, 0.3, 0.22), matItem.kit));
      for (const [lx, ly] of [[0.2, 0.06], [0.06, 0.2]]) {
        const c = new THREE.Mesh(caixa(lx, ly, 0.23), matItem.cruz);
        corpo.add(c);
      }
    }
    corpo.position.y = 0.55;
    corpo.traverse((o) => (o.castShadow = true));
    const a = anel.clone();
    a.position.y = 0.06;
    g.add(corpo, a);
    g.userData.corpo = corpo;
    return g;
  }

  return { modelo, visualDeItem };
}

export type FabricaDeArmas = ReturnType<typeof criarFabricaDeArmas>;
