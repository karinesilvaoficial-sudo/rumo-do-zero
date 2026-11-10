import {Easing, interpolate} from 'remotion';

export const C = {
  bg0: '#020915',
  bg1: '#07152C',
  blue: '#0A90FF',
  cyan: '#36DDFF',
  deep: '#1A43ED',
  white: '#FFFFFF',
  gold: '#FFBF55',
  muted: '#8FA8C8',
  glassBorder: 'rgba(110,190,255,0.28)',
};

export const FONT = "'Inter', 'Inter Display', system-ui, sans-serif";

// Storyboard timing (30 fps)
export const T = {
  hookEnd: 66, // 2.2s
  turnEnd: 129, // 4.3s
  productEnd: 231, // 7.7s
  total: 300,
};

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

/** Clamped interpolate shorthand with an easing. */
export const tween = (
  f: number,
  [a, b]: [number, number],
  [from, to]: [number, number],
  easing: (t: number) => number = easeOut,
) => interpolate(f, [a, b], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing});

export const glass: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgba(20,58,100,0.62), rgba(6,20,36,0.78))',
  border: `1.5px solid ${C.glassBorder}`,
  boxShadow: '0 30px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
  backdropFilter: 'blur(18px)',
  borderRadius: 28,
};
