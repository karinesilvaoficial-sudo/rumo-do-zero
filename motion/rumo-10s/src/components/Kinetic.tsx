import React from 'react';
import {random, useCurrentFrame} from 'remotion';
import {C, FONT, easeIn, tween} from '../theme';

type LineProps = {
  text: string;
  start: number;
  size: number;
  color?: string;
  weight?: number;
  stagger?: number;
  /** "glitch" = chars settle from scattered/blurred state; "rise" = masked rise */
  mode?: 'glitch' | 'rise';
  exitAt?: number;
  seed?: string;
  tracking?: number;
  glow?: boolean;
};

/** Per-character animated line. Every glyph is its own layer. */
export const KLine: React.FC<LineProps> = ({
  text,
  start,
  size,
  color = C.white,
  weight = 800,
  stagger = 1.4,
  mode = 'rise',
  exitAt,
  seed = text,
  tracking = -0.02,
  glow,
}) => {
  const f = useCurrentFrame();
  const chars = [...text];
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.04,
        letterSpacing: `${tracking}em`,
        color,
        whiteSpace: 'pre',
        display: 'flex',
        overflow: mode === 'rise' ? 'hidden' : 'visible',
        paddingBottom: size * 0.08,
        textShadow: glow ? `0 0 28px ${C.blue}aa` : undefined,
      }}
    >
      {chars.map((ch, i) => {
        const s = start + i * stagger;
        let x = 0;
        let y = 0;
        let o = 1;
        let blur = 0;
        let skew = 0;
        if (mode === 'rise') {
          y = tween(f, [s, s + 14], [size * 1.05, 0]);
          o = tween(f, [s, s + 6], [0, 1]);
          skew = tween(f, [s, s + 14], [-8, 0]);
        } else {
          const r1 = random(`${seed}x${i}`) - 0.5;
          const r2 = random(`${seed}y${i}`) - 0.5;
          const p = tween(f, [s, s + 16], [1, 0]);
          // brief "organization glitch" jitter on 2 frames
          const jitter = f > s + 6 && f < s + 9 ? (random(`${seed}j${i}${f}`) - 0.5) * 10 : 0;
          x = r1 * 90 * p + jitter;
          y = r2 * 70 * p;
          o = tween(f, [s, s + 7], [0, 1]);
          blur = 10 * p;
        }
        if (exitAt !== undefined) {
          const e = exitAt + i * 0.6;
          y -= tween(f, [e, e + 10], [0, size * 0.9], easeIn);
          o *= tween(f, [e, e + 8], [1, 0], easeIn);
          blur += tween(f, [e, e + 10], [0, 8], easeIn);
        }
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translate(${x}px, ${y}px) skewX(${skew}deg)`,
              opacity: o,
              filter: blur > 0.2 ? `blur(${blur}px)` : undefined,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** SVG underline drawn with a trim path. */
export const TrimUnderline: React.FC<{start: number; width: number; exitAt?: number}> = ({start, width, exitAt}) => {
  const f = useCurrentFrame();
  const len = width + 40;
  const draw = tween(f, [start, start + 18], [len, 0]);
  const out = exitAt ? tween(f, [exitAt, exitAt + 10], [0, -len], easeIn) : 0;
  return (
    <svg width={width + 20} height={40} style={{overflow: 'visible'}}>
      <defs>
        <linearGradient id="ul" x1="0" x2="1">
          <stop offset="0" stopColor={C.blue} />
          <stop offset="1" stopColor={C.cyan} />
        </linearGradient>
      </defs>
      <path
        d={`M4 26 C ${width * 0.3} 14, ${width * 0.7} 30, ${width} 10`}
        stroke="url(#ul)"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={draw + out}
        style={{filter: `drop-shadow(0 0 10px ${C.blue})`}}
      />
    </svg>
  );
};
