import {rr} from './textures';

/**
 * Draws the RUMO app screen for a given frame into a canvas (used as a live
 * texture on the 3D phone). Phase 1: skeleton loaders with shimmer while the AI
 * analyses. Phase 2: real UI resolves block by block. All data is illustrative:
 * no amounts, no percentages, no bank data.
 */
export const W = 600;
export const H = 1260;

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const prog = (f: number, a: number, b: number) => ease((f - a) / (b - a));

export const drawScreen = (g: CanvasRenderingContext2D, f: number, skFrom: number, skTo: number) => {
  g.clearRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0B2240');
  bg.addColorStop(1, '#040E1C');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // dynamic island
  g.fillStyle = '#000';
  rr(g, W / 2 - 80, 22, 160, 44, 22);
  g.fill();

  const font = (w: number, s: number) => `${w} ${s}px Inter`;
  g.fillStyle = '#fff';
  g.font = font(800, 50);
  g.fillText('RUMO', 40, 150);
  // AI status pill
  const analysing = f < skTo;
  g.fillStyle = analysing ? 'rgba(54,221,255,0.15)' : 'rgba(54,221,255,0.22)';
  rr(g, 330, 108, 230, 54, 27);
  g.fill();
  g.fillStyle = '#36DDFF';
  g.beginPath();
  g.arc(360, 135, 8 + (analysing ? Math.sin(f / 3) * 3 : 0), 0, Math.PI * 2);
  g.fill();
  g.font = font(700, 24);
  g.fillText(analysing ? 'IA analisando' : 'IA ativa', 380, 144);
  g.fillStyle = '#CFE0F5';
  g.font = font(600, 30);
  g.fillText('Vamos arrumar suas finanças', 40, 220);

  const blocks = [
    {y: 260, h: 330},
    {y: 612, h: 300},
    {y: 934, h: 250},
  ];
  const shimmerX = ((f * 22) % (W + 400)) - 200;

  blocks.forEach((b, i) => {
    const reveal = prog(f, skTo - 14 + i * 7, skTo + i * 7);
    // card bg
    g.fillStyle = 'rgba(22,64,110,0.75)';
    rr(g, 30, b.y, W - 60, b.h, 28);
    g.fill();
    g.strokeStyle = `rgba(54,190,255,${0.25 + reveal * 0.35})`;
    g.lineWidth = 2;
    g.stroke();

    // skeleton layer
    if (reveal < 1) {
      g.save();
      g.globalAlpha = 1 - reveal;
      g.fillStyle = 'rgba(160,200,240,0.16)';
      rr(g, 60, b.y + 34, 220, 24, 12);
      g.fill();
      for (let k = 0; k < 4; k++) {
        rr(g, 60, b.y + 90 + k * 52, 380 - ((k * 70) % 160), 20, 10);
        g.fill();
      }
      // shimmer sweep
      g.save();
      rr(g, 30, b.y, W - 60, b.h, 28);
      g.clip();
      const sg = g.createLinearGradient(shimmerX - 120, 0, shimmerX + 120, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(180,230,255,0.22)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg;
      g.fillRect(shimmerX - 120, b.y, 240, b.h);
      g.restore();
      g.restore();
    }
    if (reveal <= 0) return;
    g.save();
    g.globalAlpha = reveal;
    g.translate(0, (1 - reveal) * 20);
    const lab = (t: string) => {
      g.fillStyle = '#9EC8F0';
      g.font = font(700, 20);
      g.fillText(t, 60, b.y + 52);
    };
    if (i === 0) {
      lab('GASTOS ORGANIZADOS PELA IA');
      const cats = [
        ['Moradia', 0.82, '#0A90FF'],
        ['Mercado', 0.6, '#36DDFF'],
        ['Transporte', 0.42, '#5E8BFF'],
        ['Lazer', 0.3, '#FFBF55'],
      ] as const;
      cats.forEach(([name, w, col], k) => {
        const p = prog(f, skTo + k * 4, skTo + 20 + k * 4);
        g.fillStyle = '#E6F0FB';
        g.font = font(600, 24);
        g.fillText(name, 60, b.y + 104 + k * 58);
        g.fillStyle = 'rgba(120,170,220,0.18)';
        rr(g, 230, b.y + 88 + k * 58, 300, 18, 9);
        g.fill();
        g.fillStyle = col;
        rr(g, 230, b.y + 88 + k * 58, Math.max(18, 300 * w * p), 18, 9);
        g.fill();
      });
    }
    if (i === 1) {
      lab('SEU PLANO DE AÇÃO');
      ['Cortar o que não faz falta', 'Separar contas fixas', 'Criar uma reserva'].forEach((t, k) => {
        const done = prog(f, skTo + 30 + k * 9, skTo + 38 + k * 9);
        const y = b.y + 92 + k * 66;
        g.strokeStyle = '#36DDFF';
        g.lineWidth = 3;
        rr(g, 60, y, 36, 36, 10);
        g.stroke();
        if (done > 0) {
          g.fillStyle = `rgba(54,221,255,${done})`;
          rr(g, 60, y, 36, 36, 10);
          g.fill();
          g.strokeStyle = '#04101F';
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(68, y + 19);
          g.lineTo(76, y + 27);
          g.lineTo(76 + 14 * done, y + 27 - 16 * done);
          g.stroke();
        }
        g.fillStyle = '#E6F0FB';
        g.font = font(600, 26);
        g.fillText(t, 116, y + 28);
      });
    }
    if (i === 2) {
      // AI assistant bubble
      const cx = 80;
      const cy = b.y + 70;
      const og = g.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 34);
      og.addColorStop(0, '#36DDFF');
      og.addColorStop(1, '#1A43ED');
      g.fillStyle = og;
      g.beginPath();
      g.arc(cx, cy, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = font(800, 28);
      g.fillText('Assistente com IA', 128, b.y + 66);
      const msg = 'Seu próximo passo: revisar os gastos de lazer desta semana.';
      const n = Math.floor(msg.length * prog(f, skTo + 40, skTo + 80));
      g.fillStyle = '#BFD6F0';
      g.font = font(500, 25);
      const words = msg.slice(0, n).split(' ');
      let line = '';
      let ly = b.y + 140;
      words.forEach((w) => {
        if (g.measureText(line + w).width > 470) {
          g.fillText(line, 60, ly);
          line = '';
          ly += 38;
        }
        line += w + ' ';
      });
      g.fillText(line, 60, ly);
    }
    g.restore();
  });

  // glass reflection
  const rg = g.createLinearGradient(0, 0, W, H);
  rg.addColorStop(0.3, 'rgba(255,255,255,0)');
  rg.addColorStop(0.42, 'rgba(255,255,255,0.06)');
  rg.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
};
