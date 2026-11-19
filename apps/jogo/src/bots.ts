import * as THREE from 'three';
import { ARMAS, type Item } from './armas';
import type { Combatente, Combatentes } from './combatentes';
import type { Mundo } from './mundo';
import type { Zona } from './zona';

type Acoes = {
  itens: Item[];
  pegar: (c: Combatente, item: Item) => void;
  atirar: (c: Combatente, alvo: Combatente) => void;
  recarregar: (c: Combatente) => void;
  usarKit: (c: Combatente) => void;
};

export function criarBots(combatentes: Combatentes, mundo: Mundo, zona: Zona, acoes: Acoes) {
  const para = new THREE.Vector3();
  const antes = new THREE.Vector3();

  function interessa(b: Combatente, it: Item) {
    if (it.tipo === 'arma') return !b.armas[1] || ARMAS[it.arma!].valor > ARMAS[b.armas[1].tipo].valor;
    if (it.tipo === 'municao') return b.municao < 90;
    if (it.tipo === 'colete') return b.colete < 50;
    return b.kits < 2 || b.vida < 60;
  }

  function pontoNaZona(alvo: THREE.Vector3) {
    const z = zona.z;
    const ang = Math.random() * Math.PI * 2;
    const d = Math.random() * Math.max(2, z.paraRaio * 0.7);
    return alvo.set(z.paraX + Math.cos(ang) * d, 0, z.paraZ + Math.sin(ang) * d);
  }

  function pensar(b: Combatente) {
    const ia = b.ia;
    // Alvo: o combatente visível mais próximo.
    // Sem arma principal, só reage a quem está muito perto: a prioridade é se armar.
    let melhor: Combatente | null = null;
    let md = b.armas[1] ? 36 : 12;
    if (ia.alvo && ia.alvo.estado === 'vivo' && b.vida < 100 && Math.hypot(ia.alvo.pos.x - b.pos.x, ia.alvo.pos.z - b.pos.z) < 60) md = 60; // já em combate: não larga o alvo
    for (const o of combatentes.lista) {
      if (o === b || o.estado !== 'vivo') continue;
      const d = Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z);
      if (d < md && mundo.visao(b.pos, o.pos)) {
        md = d;
        melhor = o;
      }
    }
    if (melhor !== ia.alvo) {
      ia.alvo = melhor;
      ia.reacao = 0.35 + Math.random() * 0.5;
    }
    // Arma: a principal, se tiver munição; senão a pistola.
    const principal = b.armas[1];
    b.slot = principal && (principal.pente > 0 || b.municao > 0) ? 1 : 0;

    const z = zona.z;
    const foraDaProxima = Math.hypot(b.pos.x - z.paraX, b.pos.z - z.paraZ) > z.paraRaio - 3;
    const urgente = zona.fora(b.pos.x, b.pos.z) || (foraDaProxima && (z.encolhendo || z.tempo < 14));
    if (urgente) {
      if (!ia.destino || Math.hypot(ia.destino.x - z.paraX, ia.destino.z - z.paraZ) > z.paraRaio) ia.destino = pontoNaZona(ia.destino ?? new THREE.Vector3());
      ia.item = null;
      return;
    }
    if (ia.alvo) return;
    if (b.vida < 55 && b.kits > 0) acoes.usarKit(b);
    // Item mais próximo que vale a caminhada.
    let item: Item | null = null;
    let di = 70;
    for (const it of acoes.itens) {
      if (!interessa(b, it) || zona.fora(it.x, it.z)) continue;
      const d = Math.hypot(it.x - b.pos.x, it.z - b.pos.z);
      if (d < di) {
        di = d;
        item = it;
      }
    }
    ia.item = item;
    if (item) ia.destino = (ia.destino ?? new THREE.Vector3()).set(item.x, 0, item.z);
    else if (!ia.destino || Math.hypot(ia.destino.x - b.pos.x, ia.destino.z - b.pos.z) < 2) ia.destino = pontoNaZona(ia.destino ?? new THREE.Vector3());
  }

  function atualizar(b: Combatente, dt: number) {
    if (b.estado === 'morto') return;
    const ia = b.ia;
    if (b.estado === 'queda') {
      // desce em direção a um ponto dentro da zona
      if (!ia.destino) ia.destino = pontoNaZona(new THREE.Vector3());
      para.set(ia.destino.x - b.pos.x, 0, ia.destino.z - b.pos.z);
      const d = para.length();
      if (d > 3) para.multiplyScalar(8 / d);
      else para.set(0, 0, 0);
      if (d > 3) b.guinada = Math.atan2(-para.x, -para.z);
      combatentes.fisica(b, para.x, para.z, false, dt);
      return;
    }
    if ((ia.pensar -= dt) <= 0) {
      ia.pensar = 0.3 + Math.random() * 0.25;
      pensar(b);
    }
    ia.reacao -= dt;
    const arma = combatentes.armaAtual(b);
    const ficha = ARMAS[arma.tipo];
    let vx = 0;
    let vz = 0;
    let vel = 5.4;
    const fugindoDaZona = zona.fora(b.pos.x, b.pos.z);

    if (ia.alvo && ia.alvo.estado === 'vivo') {
      const a = ia.alvo;
      para.set(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z);
      const dist = para.length() || 1;
      para.divideScalar(dist);
      const alvoGuinada = Math.atan2(-para.x, -para.z);
      let dif = alvoGuinada - b.guinada;
      dif = Math.atan2(Math.sin(dif), Math.cos(dif));
      b.guinada += dif * Math.min(1, dt * 9);
      b.arfagem = Math.atan2(a.pos.y - b.pos.y, dist);
      const ideal = Math.min(ficha.alcance * 0.55, arma.tipo === 'escopeta' ? 7 : 20);
      const avanco = dist > ideal + 3 ? 1 : dist < ideal - 4 ? -0.7 : 0;
      if (Math.random() < dt * 0.5) ia.lado *= -1;
      vx = para.x * avanco - para.z * ia.lado * 0.7;
      vz = para.z * avanco + para.x * ia.lado * 0.7;
      vel = 4.2;
      if (arma.pente === 0) acoes.recarregar(b);
      else if (ia.reacao <= 0 && Math.abs(dif) < 0.25 && dist <= ficha.alcance) {
        // rajadas curtas com pausa, para dar tempo de reação a quem leva o tiro
        ia.rajada -= dt;
        if (ia.rajada < -0.9) ia.rajada = 0.35 + Math.random() * 0.5;
        if (ia.rajada > 0 || ficha.cadencia > 0.4) acoes.atirar(b, a);
      }
    }
    if ((!ia.alvo || fugindoDaZona) && ia.destino) {
      para.set(ia.destino.x - b.pos.x, 0, ia.destino.z - b.pos.z);
      const d = para.length();
      if (d < 1.2) {
        if (ia.item) {
          const it = ia.item as Item;
          if (acoes.itens.includes(it)) acoes.pegar(b, it);
          ia.item = null;
        }
        ia.destino = null;
        ia.pensar = 0;
      } else {
        para.divideScalar(d);
        const desvio = ia.travado > 0 ? ia.lado * 0.95 : 0;
        vx = para.x - para.z * desvio;
        vz = para.z + para.x * desvio;
        vel = 5.4;
        if (!ia.alvo) {
          let dif = Math.atan2(-vx, -vz) - b.guinada;
          dif = Math.atan2(Math.sin(dif), Math.cos(dif));
          b.guinada += dif * Math.min(1, dt * 7);
          b.arfagem *= 0.9;
        }
      }
    }
    const n = Math.hypot(vx, vz);
    if (n > 0) {
      vx = (vx / n) * vel;
      vz = (vz / n) * vel;
    }
    antes.copy(b.pos);
    combatentes.fisica(b, vx, vz, ia.travado > 0.6 && b.noChao, dt);
    if (n > 0) {
      const andou = Math.hypot(b.pos.x - antes.x, b.pos.z - antes.z);
      if (andou < vel * dt * 0.3) {
        if (ia.travado <= 0) ia.lado *= -1;
        ia.travado = 0.9;
      } else ia.travado = Math.max(0, ia.travado - dt);
    }
  }

  return { atualizar };
}
