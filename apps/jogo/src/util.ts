// Gerador determinístico: o mundo é igual em toda partida e em todo computador.
export function semente(s: number) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const suave = (a: number, b: number, v: number) => {
  const t = limitar((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
