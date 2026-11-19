// Efeitos sintetizados com Web Audio: nenhum arquivo de som para baixar.
let ctx: AudioContext | null = null;
let saida: GainNode | null = null;
let ruido: AudioBuffer | null = null;

export function ligarAudio() {
  if (ctx) return void ctx.resume();
  ctx = new AudioContext();
  saida = ctx.createGain();
  saida.gain.value = 0.5;
  saida.connect(ctx.destination);
  ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = ruido.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function estouro(dur: number, freq: number, vol: number, tipo: BiquadFilterType = 'lowpass') {
  if (!ctx || !saida || !ruido) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = ruido;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = tipo;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.15), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(saida);
  src.start(t, Math.random() * 0.5, dur);
}

function tom(de: number, ate: number, dur: number, vol: number, forma: OscillatorType = 'sine') {
  if (!ctx || !saida) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = forma;
  o.frequency.setValueAtTime(de, t);
  o.frequency.exponentialRampToValueAtTime(ate, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(saida);
  o.start(t);
  o.stop(t + dur);
}

export const som = {
  tiro() {
    estouro(0.16, 4200, 0.9);
    tom(190, 55, 0.12, 0.6, 'triangle');
  },
  seco: () => tom(900, 700, 0.04, 0.25, 'square'),
  recarga() {
    tom(320, 240, 0.06, 0.25, 'square');
    setTimeout(() => tom(520, 400, 0.07, 0.3, 'square'), 900);
  },
  acerto: () => tom(1500, 900, 0.05, 0.22, 'square'),
  cabeca: () => tom(2300, 1500, 0.09, 0.3, 'triangle'),
  abate: () => estouro(0.35, 900, 0.5, 'bandpass'),
  dano() {
    estouro(0.22, 500, 0.7);
    tom(140, 60, 0.25, 0.5, 'sawtooth');
  },
  raio: () => tom(1200, 260, 0.22, 0.12, 'sawtooth'),
  coleta() {
    tom(660, 990, 0.09, 0.3);
    setTimeout(() => tom(990, 1320, 0.12, 0.3), 80);
  },
  onda() {
    tom(220, 330, 0.3, 0.3, 'triangle');
    setTimeout(() => tom(330, 440, 0.4, 0.3, 'triangle'), 220);
  },
};
