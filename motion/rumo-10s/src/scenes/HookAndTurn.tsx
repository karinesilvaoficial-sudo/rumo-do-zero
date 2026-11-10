import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {KLine, TrimUnderline} from '../components/Kinetic';
import {C, FONT, T, easeIn, easeInOut, glass, tween} from '../theme';
import {useShowText} from '../ShowText';

/* -------------------------------------------------------------------------- */
/* Cards: disorganized bills in the hook, realigned by the light wave and     */
/* morphed (match-motion) into the three chips of the turn.                   */
/* -------------------------------------------------------------------------- */

type CardDef = {
  title: string;
  chipNo: string;
  chip: string;
  messy: {x: number; y: number; w: number; h: number; r: number};
  chipPos: {x: number; y: number};
  kind: 'list' | 'chart' | 'receipt';
  delay: number;
};

const CHIP_W = 400;
const CHIP_H = 150;

const CARDS: CardDef[] = [
  {title: 'CONTAS', chipNo: '01', chip: 'ORGANIZE', messy: {x: 70, y: 1010, w: 420, h: 460, r: -10}, chipPos: {x: 100, y: 1000}, kind: 'list', delay: -8},
  {title: 'DESPESAS', chipNo: '02', chip: 'PLANEJE', messy: {x: 560, y: 1090, w: 420, h: 440, r: 9}, chipPos: {x: 580, y: 1150}, kind: 'chart', delay: -3},
  {title: 'FATURAS', chipNo: '03', chip: 'EVOLUA', messy: {x: 300, y: 1370, w: 360, h: 300, r: -17}, chipPos: {x: 140, y: 1330}, kind: 'receipt', delay: 3},
];

const ALIGN_START = T.hookEnd - 2; // light wave hits
const ALIGN_END = ALIGN_START + 26;

const CardBody: React.FC<{c: CardDef; f: number}> = ({c, f}) => {
  if (c.kind === 'chart') {
    const draw = tween(f, [c.delay + 6, c.delay + 34], [520, 0]);
    return (
      <svg width="100%" height="70%" viewBox="0 0 360 260" style={{position: 'absolute', bottom: 30, left: 20}}>
        <path
          d="M10 220 L80 140 L130 190 L200 90 L250 150 L330 50"
          stroke={C.gold}
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={520}
          strokeDashoffset={draw}
          style={{filter: `drop-shadow(0 0 12px ${C.gold}88)`}}
        />
      </svg>
    );
  }
  const rows = c.kind === 'list' ? 4 : 3;
  return (
    <div style={{position: 'absolute', top: 120, left: 38, right: 38}}>
      {new Array(rows).fill(0).map((_, i) => {
        const w = tween(f, [c.delay + 6 + i * 3, c.delay + 22 + i * 3], [0, 1]);
        // "jitter" of disorganized amounts — abstract bars, no values
        const wob = Math.sin((f + i * 17) / 6) * 0.08;
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 22, marginBottom: 46}}>
            <div style={{width: 38, height: 10, borderRadius: 6, background: i % 2 ? '#C58B4C' : '#DA9154', opacity: 0.85}} />
            <div
              style={{
                height: 10,
                borderRadius: 6,
                width: `${(55 + ((i * 23) % 35)) * w * (1 + wob)}%`,
                background: 'rgba(160,190,225,0.45)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

const Cards: React.FC = () => {
  const f = useCurrentFrame();
  if (f > T.turnEnd + 2) return null;
  const k = tween(f, [ALIGN_START, ALIGN_END], [0, 1], easeInOut); // messy -> chip
  return (
    <AbsoluteFill>
      {CARDS.map((c, i) => {
        const enter = tween(f, [c.delay, c.delay + 18], [0, 1]);
        // chaotic float while messy
        const fx = Math.sin((f + i * 30) / 14) * 14 * (1 - k);
        const fy = Math.cos((f + i * 20) / 11) * 12 * (1 - k);
        const fr = Math.sin((f + i * 10) / 9) * 3 * (1 - k);
        const x = interpolate(k, [0, 1], [c.messy.x, c.chipPos.x]) + fx;
        const y = interpolate(k, [0, 1], [c.messy.y, c.chipPos.y]) + fy + (1 - enter) * 160;
        const w = interpolate(k, [0, 1], [c.messy.w, CHIP_W]);
        const h = interpolate(k, [0, 1], [c.messy.h, CHIP_H]);
        const r = interpolate(k, [0, 1], [c.messy.r, 0]) + fr;
        const ry = interpolate(k, [0, 1], [i === 1 ? -18 : 14, 0]);
        // motion blur proxy during the fast realignment
        const vel = Math.abs(tween(f, [ALIGN_START, ALIGN_END], [0, 1], easeInOut) - tween(f - 1, [ALIGN_START, ALIGN_END], [0, 1], easeInOut));
        const exit = tween(f, [T.turnEnd - 10 + i * 2, T.turnEnd], [0, 1], easeIn);
        const chipIn = tween(f, [ALIGN_START + 14 + i * 3, ALIGN_START + 26 + i * 3], [0, 1]);
        return (
          <div
            key={c.title}
            style={{
              ...glass,
              position: 'absolute',
              left: x,
              top: y - exit * 120,
              width: w,
              height: h,
              opacity: enter * (1 - exit),
              transform: `perspective(1400px) rotate(${r}deg) rotateY(${ry}deg) scale(${1 - exit * 0.15})`,
              filter: vel > 0.02 ? `blur(${Math.min(vel * 120, 6)}px)` : undefined,
              overflow: 'hidden',
              borderColor: k > 0.6 ? 'rgba(54,221,255,0.55)' : C.glassBorder,
              boxShadow: `0 30px 80px rgba(0,0,0,0.45), 0 0 ${k * 40}px rgba(10,144,255,${k * 0.45}), inset 0 1px 0 rgba(255,255,255,0.12)`,
            }}
          >
            {/* messy content */}
            <div style={{opacity: 1 - tween(f, [ALIGN_START, ALIGN_START + 12], [0, 1])}}>
              <div style={{position: 'absolute', top: 40, left: 38, fontFamily: FONT, fontWeight: 700, fontSize: 32, letterSpacing: '0.12em', color: '#C9D8EE'}}>
                {c.title}
              </div>
              <CardBody c={c} f={f} />
            </div>
            {/* chip content */}
            <div style={{position: 'absolute', left: 34, top: 26, opacity: chipIn, transform: `translateY(${(1 - chipIn) * 18}px)`, fontFamily: FONT}}>
              <div style={{color: C.cyan, fontWeight: 800, fontSize: 36}}>{c.chipNo}</div>
              <div style={{color: C.white, fontWeight: 800, fontSize: 46, letterSpacing: '0.02em', marginTop: 2}}>{c.chip}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ---------------------------- Light wave + ribbon --------------------------- */

const RIBBON = 'M -80 1420 C 220 1330, 300 1120, 560 1160 S 900 1260, 1160 860';

const LightWave: React.FC = () => {
  const f = useCurrentFrame();
  if (f < ALIGN_START - 8 || f > T.turnEnd + 8) return null;
  const sweep = tween(f, [ALIGN_START - 8, ALIGN_START + 16], [-700, 1500], easeInOut);
  const draw = tween(f, [ALIGN_START, ALIGN_START + 30], [2000, 0]);
  const out = tween(f, [T.turnEnd - 8, T.turnEnd + 8], [0, 1], easeIn);
  const pulse = (f - ALIGN_START) * 38;
  return (
    <AbsoluteFill>
      {/* sweeping energy band */}
      <div
        style={{
          position: 'absolute',
          top: -300,
          left: sweep,
          width: 260,
          height: 2600,
          transform: 'rotate(18deg)',
          background: 'linear-gradient(90deg, transparent, rgba(54,221,255,0.10) 30%, rgba(160,235,255,0.55) 50%, rgba(54,221,255,0.10) 70%, transparent)',
          filter: 'blur(14px)',
          mixBlendMode: 'screen',
        }}
      />
      <svg width={1080} height={1920} style={{position: 'absolute', opacity: 1 - out}}>
        <defs>
          <linearGradient id="rib" x1="0" x2="1">
            <stop offset="0" stopColor={C.deep} />
            <stop offset="0.5" stopColor={C.blue} />
            <stop offset="1" stopColor={C.cyan} />
          </linearGradient>
          <filter id="ribGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>
        <path d={RIBBON} stroke={C.blue} strokeWidth={90} fill="none" opacity={0.35} filter="url(#ribGlow)" strokeDasharray={2000} strokeDashoffset={draw} />
        <path d={RIBBON} stroke="url(#rib)" strokeWidth={46} fill="none" strokeLinecap="round" strokeDasharray={2000} strokeDashoffset={draw} />
        <path d={RIBBON} stroke="#BFF3FF" strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={2000} strokeDashoffset={draw} opacity={0.9} />
        {/* energy pulse travelling along the ribbon */}
        <path
          d={RIBBON}
          stroke="#FFFFFF"
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="120 1880"
          strokeDashoffset={-pulse}
          opacity={f > ALIGN_START + 20 ? 0.9 : 0}
          style={{filter: `drop-shadow(0 0 14px ${C.cyan})`}}
        />
      </svg>
    </AbsoluteFill>
  );
};

/* --------------------------------- Texts --------------------------------- */

const Texts: React.FC = () => {
  const f = useCurrentFrame();
  const show = useShowText();
  if (!show) return null;
  const dimFirst = tween(f, [24, 38], [1, 0.42]);
  return (
    <AbsoluteFill style={{padding: '250px 100px 0'}}>
      {f < T.hookEnd + 10 && (
        <div style={{position: 'absolute', left: 100, top: 250}}>
          <div style={{opacity: dimFirst}}>
            <KLine text="SEU DINHEIRO" start={-8} size={86} mode="glitch" exitAt={T.hookEnd - 8} />
            <KLine text="ENTRA." start={-2} size={118} mode="glitch" exitAt={T.hookEnd - 6} />
          </div>
          <div style={{height: 26}} />
          <KLine text="MAS PARA" start={20} size={86} mode="glitch" exitAt={T.hookEnd - 4} />
          <KLine text="ONDE VAI?" start={26} size={124} mode="glitch" color={C.cyan} exitAt={T.hookEnd - 2} glow />
          <div style={{marginTop: -6}}>
            <TrimUnderline start={38} width={600} exitAt={T.hookEnd - 4} />
          </div>
        </div>
      )}
      {f >= T.hookEnd && (
        <div style={{position: 'absolute', left: 100, top: 300}}>
          <KLine text="TROQUE O" start={T.hookEnd + 6} size={96} exitAt={T.turnEnd - 22} />
          <KLine text="DESCONTROLE" start={T.hookEnd + 10} size={112} exitAt={T.turnEnd - 20} />
          <KLine text="POR DIREÇÃO." start={T.hookEnd + 16} size={112} color={C.cyan} exitAt={T.turnEnd - 18} glow />
        </div>
      )}
    </AbsoluteFill>
  );
};

export const HookAndTurn: React.FC = () => {
  const f = useCurrentFrame();
  if (f > T.turnEnd + 10) return null;
  // camera: slow dolly in during hook, gentle lateral drift in the turn, push into product
  const scale = interpolate(f, [0, T.hookEnd, T.turnEnd - 8, T.turnEnd + 8], [1.0, 1.07, 1.1, 1.35], {
    extrapolateRight: 'clamp',
  });
  const tx = interpolate(f, [0, T.hookEnd, T.turnEnd], [0, -10, 12], {extrapolateRight: 'clamp'});
  const blur = tween(f, [T.turnEnd - 6, T.turnEnd + 6], [0, 10], easeIn);
  const op = tween(f, [T.turnEnd - 2, T.turnEnd + 8], [1, 0], easeIn);
  return (
    <AbsoluteFill style={{transform: `translateX(${tx}px) scale(${scale})`, filter: blur ? `blur(${blur}px)` : undefined, opacity: op}}>
      <Cards />
      <LightWave />
      <Texts />
    </AbsoluteFill>
  );
};
