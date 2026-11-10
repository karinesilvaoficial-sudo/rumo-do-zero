import * as THREE from 'three';

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
};

export const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

/** Coin face: concentric rings + embossed "R" (bump + color). */
export const coinFace = () => {
  const [c, g] = canvas(512, 512);
  const grad = g.createRadialGradient(200, 180, 20, 256, 256, 256);
  grad.addColorStop(0, '#FFE7A8');
  grad.addColorStop(0.6, '#E8A93E');
  grad.addColorStop(1, '#B9761E');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(120,70,10,0.55)';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(256, 256, 222, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 232, 256 + Math.sin(a) * 232);
    g.lineTo(256 + Math.cos(a) * 248, 256 + Math.sin(a) * 248);
    g.stroke();
  }
  g.font = '800 250px Inter';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,240,200,0.9)';
  g.fillText('R', 262, 268);
  g.fillStyle = 'rgba(130,75,10,0.6)';
  g.fillText('R', 256, 262);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** Reeded coin edge (bump map). */
export const coinEdge = () => {
  const [c, g] = canvas(1024, 32);
  for (let i = 0; i < 1024; i += 8) {
    g.fillStyle = '#fff';
    g.fillRect(i, 0, 4, 32);
    g.fillStyle = '#333';
    g.fillRect(i + 4, 0, 4, 32);
  }
  return new THREE.CanvasTexture(c);
};

/** Credit card face — generic design, no real bank, no numbers. */
export const cardFace = (variant: number) => {
  const [c, g] = canvas(1024, 646);
  const grad = g.createLinearGradient(0, 0, 1024, 646);
  const stops = [
    ['#0A2A5C', '#0A90FF', '#36DDFF'],
    ['#101826', '#24324A', '#5E7A9E'],
    ['#2A1A05', '#B9761E', '#FFD27A'],
  ][variant % 3];
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.6, stops[1]);
  grad.addColorStop(1, stops[2]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 646);
  // waves
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 3;
  for (let k = 0; k < 9; k++) {
    g.beginPath();
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, 380 + k * 22 + Math.sin(x / 140 + k) * 40);
    g.stroke();
  }
  // chip
  const cg = g.createLinearGradient(90, 220, 230, 330);
  cg.addColorStop(0, '#F7E2A6');
  cg.addColorStop(1, '#B78A3A');
  g.fillStyle = cg;
  rr(g, 90, 220, 140, 108, 18);
  g.fill();
  g.strokeStyle = 'rgba(90,60,10,0.6)';
  g.lineWidth = 3;
  g.strokeRect(120, 240, 80, 68);
  // masked digits (no real data)
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = '600 46px Inter';
  g.fillText('••••  ••••  ••••  ••••', 90, 470);
  g.beginPath();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.arc(860, 560, 40, 0, Math.PI * 2);
  g.arc(910, 560, 40, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

/** Paper bill / receipt — abstract lines, no values. */
export const receipt = (variant: number) => {
  const [c, g] = canvas(512, 760);
  g.fillStyle = '#F2F4F7';
  g.fillRect(0, 0, 512, 760);
  g.fillStyle = '#1B2A40';
  g.font = '800 54px Inter';
  g.fillText(['CONTA', 'FATURA', 'BOLETO', 'VENCE HOJE'][variant % 4], 40, 90);
  g.fillStyle = '#C9302C';
  g.fillRect(40, 116, 150, 10);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = 'rgba(30,45,70,0.28)';
    g.fillRect(40, 180 + i * 52, 260 + ((i * 53) % 150), 14);
  }
  // barcode
  for (let x = 40; x < 470; x += 6) {
    g.fillStyle = (x * 7) % 13 > 5 ? '#111' : '#F2F4F7';
    g.fillRect(x, 660, 4, 70);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
