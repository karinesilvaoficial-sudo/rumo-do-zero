import React from 'react';
import {AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {KLine} from '../components/Kinetic';
import {C, FONT, T, easeInOut, easeOut, tween} from '../theme';
import {useShowText} from '../ShowText';

const S = T.productEnd; // 231
const LOGO_Y = 780;
const ARC = 'M 150 760 C 330 520, 760 470, 930 690';

/** UI dissolving into particles that converge on the brand. */
const Particles: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      {new Array(70).fill(0).map((_, i) => {
        const delay = random(`fd${i}`) * 8;
        const p = tween(f, [S - 4 + delay, S + 22 + delay], [0, 1], easeInOut);
        if (p <= 0 || p >= 1) return null;
        // start: inside the phone silhouette; end: around the logo
        const sx = 270 + random(`fx${i}`) * 540;
        const sy = 500 + random(`fy${i}`) * 1080;
        const ang = random(`fa${i}`) * Math.PI * 2;
        const ex = 540 + Math.cos(ang) * (80 + random(`fr${i}`) * 260);
        const ey = LOGO_Y + Math.sin(ang) * (40 + random(`fr${i}`) * 90);
        const swirl = Math.sin(p * Math.PI) * 120 * (random(`fs${i}`) - 0.5);
        const x = interpolate(p, [0, 1], [sx, ex]) + swirl;
        const y = interpolate(p, [0, 1], [sy, ey]);
        const s = 3 + random(`fz${i}`) * 5;
        const o = Math.sin(p * Math.PI);
        return (
          <div key={i} style={{position: 'absolute', left: x, top: y, width: s, height: s * (1 + o * 2.5), borderRadius: s, background: i % 9 === 0 ? C.gold : C.cyan, opacity: o * 0.9, boxShadow: `0 0 ${s * 3}px ${C.cyan}`, transform: `rotate(${(ang * 180) / Math.PI}deg)`}} />
        );
      })}
    </AbsoluteFill>
  );
};

export const Finale: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const show = useShowText();
  if (f < S - 6) return null;

  const arcDraw = tween(f, [S + 6, S + 30], [1400, 0], easeInOut);
  const arrow = tween(f, [S + 26, S + 34], [0, 1]);
  const logoP = tween(f, [S + 12, S + 32], [0, 1], easeOut);
  const ctaP = spring({frame: f - (S + 28), fps, config: {damping: 14, stiffness: 120}});
  const shine = interpolate(f, [S + 46, S + 64], [-260, 760], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const breathe = 1 + Math.sin((f - S) / 10) * 0.012 * tween(f, [S + 40, S + 50], [0, 1]);
  const cam = interpolate(f, [S, T.total - 1], [1.08, 1.0], {easing: easeOut, extrapolateRight: 'clamp'});
  const haloO = tween(f, [S, S + 30], [0, 1]);

  return (
    <AbsoluteFill style={{transform: `scale(${cam})`}}>
      {/* volumetric halo behind logo */}
      <div style={{position: 'absolute', left: 40, top: LOGO_Y - 460, width: 1000, height: 1000, borderRadius: '50%', background: 'radial-gradient(rgba(10,144,255,0.42), rgba(0,111,239,0.12) 40%, transparent 68%)', opacity: haloO, transform: `scale(${breathe})`}} />
      <Particles />
      {/* ascending arc */}
      <svg width={1080} height={1920} style={{position: 'absolute'}}>
        <defs>
          <linearGradient id="arc" x1="0" x2="1">
            <stop offset="0" stopColor={C.deep} stopOpacity={0.2} />
            <stop offset="0.5" stopColor={C.blue} />
            <stop offset="1" stopColor={C.cyan} />
          </linearGradient>
        </defs>
        <path d={ARC} stroke="url(#arc)" strokeWidth={14} fill="none" strokeLinecap="round" strokeDasharray={1400} strokeDashoffset={arcDraw} style={{filter: `drop-shadow(0 0 16px ${C.blue})`}} />
        <g transform="translate(930 690) rotate(52)" opacity={arrow}>
          <path d="M -34 -26 L 0 0 L -34 26" stroke={C.cyan} strokeWidth={14} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`scale(${0.6 + arrow * 0.4})`} style={{filter: `drop-shadow(0 0 12px ${C.cyan})`}} />
        </g>
      </svg>

      {/* logo */}
      <div style={{position: 'absolute', top: LOGO_Y - 120, left: 0, right: 0, display: 'flex', justifyContent: 'center', fontFamily: FONT}}>
        <div style={{display: 'flex', fontSize: 230, fontWeight: 800, color: C.white, letterSpacing: `${interpolate(logoP, [0, 1], [0.45, 0.04])}em`, marginRight: `-${interpolate(logoP, [0, 1], [0.45, 0.04])}em`, opacity: logoP, filter: `blur(${(1 - logoP) * 16}px)`, textShadow: `0 0 50px rgba(10,144,255,0.6)`, transform: `scale(${breathe})`}}>
          RUMO
        </div>
      </div>

      {show && (
        <>
          <div style={{position: 'absolute', top: LOGO_Y + 150, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <KLine text="SUA VIDA FINANCEIRA" start={S + 22} size={54} weight={700} color="#CFE6FF" stagger={0.7} tracking={0.03} />
            <KLine text="NA DIREÇÃO CERTA." start={S + 26} size={54} weight={800} color={C.cyan} stagger={0.7} tracking={0.03} glow />
          </div>
          {/* CTA */}
          <div style={{position: 'absolute', top: 1240, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
            <div style={{position: 'relative', overflow: 'hidden', padding: '34px 76px', borderRadius: 70, background: `linear-gradient(90deg, ${C.cyan}, ${C.blue} 55%, ${C.deep})`, boxShadow: `0 20px 60px rgba(10,144,255,0.55), inset 0 1px 0 rgba(255,255,255,0.45)`, transform: `scale(${ctaP * breathe})`, opacity: Math.min(1, ctaP * 1.4), fontFamily: FONT, fontSize: 50, fontWeight: 800, color: C.white, letterSpacing: '0.03em'}}>
              CONHEÇA O RUMO
              <div style={{position: 'absolute', top: 0, bottom: 0, left: shine, width: 140, transform: 'skewX(-20deg)', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)'}} />
            </div>
          </div>
          <div style={{position: 'absolute', top: 1420, left: 0, right: 0, textAlign: 'center', fontFamily: FONT, fontSize: 30, fontWeight: 700, letterSpacing: '0.16em', color: '#9EC8F0', opacity: tween(f, [S + 36, S + 46], [0, 1]), transform: `translateY(${tween(f, [S + 36, S + 46], [16, 0])}px)`}}>
            ORGANIZE • PLANEJE • AVANCE
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
