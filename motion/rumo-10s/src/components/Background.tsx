import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {C, T, tween, easeInOut} from '../theme';

/** Navy base, perspective grid, volumetric light shafts and sparse dust particles. */
export const Background: React.FC = () => {
  const f = useCurrentFrame();
  // volumetric hue: dim/warm doubt -> electric blue clarity
  const clarity = tween(f, [T.hookEnd - 6, T.hookEnd + 30], [0, 1], easeInOut);
  const finale = tween(f, [T.productEnd, T.productEnd + 30], [0, 1], easeInOut);
  const gridShift = (f * 1.2) % 90;

  return (
    <AbsoluteFill style={{background: `linear-gradient(160deg, ${C.bg0} 0%, ${C.bg1} 52%, #030817 100%)`}}>
      {/* warm doubt glow (only in hook) */}
      <AbsoluteFill
        style={{
          background: 'radial-gradient(circle at 15% 8%, rgba(255,173,56,0.22), transparent 38%)',
          opacity: 1 - clarity * 0.85,
        }}
      />
      {/* main blue halo, drifts with the story */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${70 - clarity * 20}% ${62 - finale * 22}%, rgba(0,138,249,${
            0.18 + clarity * 0.2
          }), rgba(0,111,239,0.06) 35%, transparent 60%)`,
        }}
      />
      {/* perspective grid floor */}
      <div
        style={{
          position: 'absolute',
          left: -540,
          right: -540,
          bottom: -200,
          height: 1100,
          transform: 'perspective(900px) rotateX(68deg)',
          transformOrigin: '50% 100%',
          backgroundImage:
            'linear-gradient(rgba(54,221,255,0.10) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(54,221,255,0.10) 1.5px, transparent 1.5px)',
          backgroundSize: '90px 90px',
          backgroundPosition: `0 ${gridShift}px`,
          maskImage: 'linear-gradient(to top, black 0%, transparent 85%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 85%)',
          opacity: 0.55 + clarity * 0.3,
        }}
      />
      {/* volumetric light shafts */}
      {[0, 1, 2].map((i) => {
        const sway = Math.sin((f + i * 40) / 45) * 4;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: -400,
              left: 300 + i * 260,
              width: 180 + i * 40,
              height: 2600,
              transform: `rotate(${22 + i * 6 + sway}deg)`,
              background: 'linear-gradient(to bottom, rgba(54,180,255,0.16), rgba(10,144,255,0.03) 60%, transparent)',
              filter: 'blur(40px)',
              opacity: 0.25 + clarity * 0.55,
            }}
          />
        );
      })}
      {/* dust particles */}
      {new Array(36).fill(0).map((_, i) => {
        const x = random(`px${i}`) * 1080;
        const speed = 0.4 + random(`ps${i}`) * 1.2;
        const y = (random(`py${i}`) * 2100 - f * speed + 2100) % 2100 - 90;
        const s = 2 + random(`pr${i}`) * 4;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(f / 20 + i));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + Math.sin((f + i * 13) / 30) * 12,
              top: y,
              width: s,
              height: s,
              borderRadius: '50%',
              background: i % 7 === 0 ? C.gold : C.cyan,
              opacity: tw * (i % 7 === 0 ? 0.35 : 0.5),
              boxShadow: `0 0 ${s * 3}px ${C.cyan}`,
            }}
          />
        );
      })}
      {/* vignette */}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)'}} />
    </AbsoluteFill>
  );
};
