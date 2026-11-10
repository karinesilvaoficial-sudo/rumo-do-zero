/**
 * EDIT SKELETON (EDL) — "RUMO: tome jeito" · 15s · 30fps · 450 frames.
 * Every scene, camera move, text, voice line and SFX hangs off this beat sheet,
 * so re-timing the edit means changing numbers here only.
 */
export const FPS = 30;
export const DURATION = 450;

export const BEATS = {
  chaos: {from: 0, to: 90}, //    0.0–3.0s  dinheiro voando, contas caindo
  freeze: {from: 90, to: 165}, // 3.0–5.5s  tempo congela: "tome jeito"
  ai: {from: 165, to: 330}, //    5.5–11.0s celular 3D + IA (skeleton -> UI) + moedas se organizam
  brand: {from: 330, to: 450}, // 11.0–15.0s marca + CTA (hold final >= 1s)
} as const;

/** Freeze time-warp: simulation time slows to a stop between these frames. */
export const FREEZE_SLOW = {from: 92, to: 118};
/** Objects travel from frozen chaos to organized stacks. */
export const ORGANIZE = {from: 180, to: 236};
/** Phone screen: skeleton loading, then real UI resolves. */
export const SKELETON = {from: 190, to: 236};

/** Voice-over lines (seconds) — must match audio/jeito/vo_*.wav placement. */
export const VO = [
  {at: 0.1, text: 'Todo mês é a mesma história?'},
  {at: 1.55, text: 'O dinheiro some antes do mês acabar.'},
  {at: 4.15, text: 'Tá na hora de tomar jeito.'},
  {at: 5.9, text: 'Com o RUMO, a IA organiza seus gastos, monta seu plano e mostra o próximo passo.'},
  {at: 11.3, text: 'RUMO. Arrume sua vida financeira com inteligência.'},
];

/** Sound design cue sheet (seconds). */
export const SFX: [string, number, number][] = [
  ['sfx_coins.mp3', 0.0, 0.55],
  ['sfx_riser.mp3', 1.6, 0.45],
  ['sfx_freeze.mp3', 3.0, 0.75],
  ['sfx_whoosh.mp3', 5.35, 0.6],
  ['sfx_scan.mp3', 6.3, 0.45],
  ['sfx_pop.mp3', 7.85, 0.45],
  ['sfx_pop.mp3', 8.15, 0.4],
  ['sfx_pop.mp3', 8.45, 0.4],
  ['sfx_stack.mp3', 6.6, 0.5],
  ['sfx_check.mp3', 9.2, 0.45],
  ['sfx_whoosh.mp3', 10.85, 0.5],
  ['sfx_impact.mp3', 11.15, 0.75],
  ['sfx_check.mp3', 12.35, 0.5],
];
