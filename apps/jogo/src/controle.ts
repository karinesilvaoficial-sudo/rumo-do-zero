// Entrada unificada: teclado e mouse no computador, alavanca e botões no celular.
export function criarControle(tela: HTMLCanvasElement) {
  const toque = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('toque');
  const teclas = new Set<string>();
  const pedidos = new Set<string>(); // ações de um toque só: pular, recarregar, pegar, trocar, kit
  const e = { toque, mx: 0, mz: 0, dx: 0, dy: 0, fogo: false, correr: false, ativo: false };

  addEventListener('keydown', (ev) => {
    if (!e.ativo) return;
    teclas.add(ev.code);
    const acao = ({ Space: 'pular', KeyR: 'recarregar', KeyE: 'pegar', KeyQ: 'kit', Digit1: 'slot0', Digit2: 'slot1', KeyF: 'trocar' } as Record<string, string>)[ev.code];
    if (acao && !ev.repeat) pedidos.add(acao);
    if (ev.code === 'Space') ev.preventDefault();
  });
  addEventListener('keyup', (ev) => teclas.delete(ev.code));
  addEventListener('blur', () => (teclas.clear(), (e.fogo = false)));
  addEventListener('mousemove', (ev) => {
    if (e.ativo && document.pointerLockElement === tela) {
      e.dx += ev.movementX;
      e.dy += ev.movementY;
    }
  });
  tela.addEventListener('mousedown', (ev) => ev.button === 0 && e.ativo && document.pointerLockElement === tela && (e.fogo = true));
  addEventListener('mouseup', (ev) => ev.button === 0 && !toque && (e.fogo = false));
  addEventListener('wheel', () => e.ativo && pedidos.add('trocar'), { passive: true });

  // Toque: metade esquerda move, metade direita mira; os botões ficam por cima.
  const painel = document.getElementById('toque')!;
  const pino = document.getElementById('pino')!;
  const base = document.getElementById('alavanca')!;
  let idMover = -1;
  let idMirar = -1;
  let ox = 0;
  let oy = 0;
  let ux = 0;
  let uy = 0;
  let tx = 0;
  let tz = 0;
  if (toque) {
    painel.hidden = false;
    tela.addEventListener('pointerdown', (ev) => {
      if (!e.ativo) return;
      if (ev.clientX < innerWidth * 0.45 && idMover < 0) {
        idMover = ev.pointerId;
        ox = ev.clientX;
        oy = ev.clientY;
        base.style.left = `${ox}px`;
        base.style.top = `${oy}px`;
        base.classList.add('ativa');
      } else if (idMirar < 0) {
        idMirar = ev.pointerId;
        ux = ev.clientX;
        uy = ev.clientY;
      }
    });
    addEventListener('pointermove', (ev) => {
      if (ev.pointerId === idMover) {
        const dx = ev.clientX - ox;
        const dy = ev.clientY - oy;
        const d = Math.hypot(dx, dy);
        const k = d > 56 ? 56 / d : 1;
        pino.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        tx = (dx * k) / 56;
        tz = (-dy * k) / 56;
      } else if (ev.pointerId === idMirar) {
        e.dx += (ev.clientX - ux) * 2.2;
        e.dy += (ev.clientY - uy) * 2.2;
        ux = ev.clientX;
        uy = ev.clientY;
      }
    });
    const soltar = (ev: PointerEvent) => {
      if (ev.pointerId === idMover) {
        idMover = -1;
        tx = tz = 0;
        pino.style.transform = '';
        base.classList.remove('ativa');
      }
      if (ev.pointerId === idMirar) idMirar = -1;
    };
    addEventListener('pointerup', soltar);
    addEventListener('pointercancel', soltar);
    for (const b of painel.querySelectorAll<HTMLElement>('[data-acao]')) {
      const acao = b.dataset.acao!;
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        if (acao === 'fogo') {
          e.fogo = true;
          // o dedo no botão de tiro também mira
          idMirar = ev.pointerId;
          ux = ev.clientX;
          uy = ev.clientY;
        } else pedidos.add(acao);
      });
      if (acao === 'fogo') for (const fim of ['pointerup', 'pointercancel'] as const) b.addEventListener(fim, () => (e.fogo = false));
    }
  }

  function ler() {
    const t = (c: string, c2: string) => (teclas.has(c) || teclas.has(c2) ? 1 : 0);
    e.mz = toque ? tz : t('KeyW', 'ArrowUp') - t('KeyS', 'ArrowDown');
    e.mx = toque ? tx : t('KeyD', 'ArrowRight') - t('KeyA', 'ArrowLeft');
    e.correr = toque ? Math.hypot(tx, tz) > 0.92 : teclas.has('ShiftLeft');
    const olhar = { dx: e.dx, dy: e.dy };
    e.dx = e.dy = 0;
    return olhar;
  }

  const pediu = (acao: string) => pedidos.delete(acao);
  const limpar = () => (pedidos.clear(), teclas.clear(), (e.fogo = false), (e.dx = e.dy = 0));
  return { e, ler, pediu, limpar };
}

export type Controle = ReturnType<typeof criarControle>;
