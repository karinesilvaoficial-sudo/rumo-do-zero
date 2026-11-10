import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {KLine} from '../components/Kinetic';
import {C, FONT, easeIn, easeInOut, tween} from '../theme';
import {BEATS, FPS, SFX, VO} from './edl';
import {Scene3D} from './Scene3D';

const B = BEATS;

const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const calm = tween(f, [B.freeze.from, B.freeze.from + 30], [0, 1], easeInOut);
  const brand = tween(f, [B.brand.from, B.brand.from + 30], [0, 1], easeInOut);
  return (
    <AbsoluteFill style={{background: `linear-gradient(165deg, ${C.bg0}, ${C.bg1} 55%, #030817)`}}>
      {/* stress: warm/red pulse in the chaos */}
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 40%, rgba(255,90,60,${0.16 + Math.sin(f / 5) * 0.04}), transparent 60%)`, opacity: 1 - calm}} />
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% ${58 - brand * 18}%, rgba(10,144,255,${0.1 + calm * 0.28}), rgba(0,111,239,0.05) 40%, transparent 65%)`}} />
      <div
        style={{
          position: 'absolute', left: -540, right: -540, bottom: -200, height: 1000,
          transform: 'perspective(900px) rotateX(70deg)', transformOrigin: '50% 100%',
          backgroundImage: 'linear-gradient(rgba(54,221,255,0.12) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(54,221,255,0.12) 1.5px, transparent 1.5px)',
          backgroundSize: '90px 90px', backgroundPosition: `0 ${(f * 1.4) % 90}px`,
          WebkitMaskImage: 'linear-gradient(to top, black, transparent 85%)', opacity: 0.25 + calm * 0.5,
        }}
      />
    </AbsoluteFill>
  );
};

/** Time-freeze FX: scan line, flash, chromatic edge and "paused" vignette. */
const FreezeFX: React.FC = () => {
  const f = useCurrentFrame();
  if (f < B.freeze.from - 2 || f > B.ai.from + 10) return null;
  const scan = tween(f, [B.freeze.from, B.freeze.from + 22], [-100, 2000], easeInOut);
  const flash = tween(f, [B.freeze.from - 2, B.freeze.from + 1], [0, 1]) * tween(f, [B.freeze.from + 1, B.freeze.from + 12], [1, 0]);
  const hold = tween(f, [B.freeze.from + 4, B.freeze.from + 20], [0, 1]) * tween(f, [B.ai.from - 10, B.ai.from + 6], [1, 0]);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: 'rgba(160,230,255,1)', opacity: flash * 0.22, mixBlendMode: 'screen'}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: scan, height: 6, background: C.cyan, boxShadow: `0 0 40px 12px ${C.blue}`}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: scan - 260, height: 260, background: 'linear-gradient(to bottom, transparent, rgba(54,221,255,0.12))'}} />
      <AbsoluteFill style={{boxShadow: `inset 0 0 220px rgba(10,144,255,${0.45 * hold})`}} />
    </AbsoluteFill>
  );
};

/** Dust motes for depth. */
const Dust: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {new Array(28).fill(0).map((_, i) => {
        const s = 2 + random(`ds${i}`) * 4;
        const y = (random(`dy${i}`) * 2100 - f * (0.5 + random(`dv${i}`)) + 4200) % 2100 - 90;
        return <div key={i} style={{position: 'absolute', left: random(`dx${i}`) * 1080, top: y, width: s, height: s, borderRadius: s, background: C.cyan, opacity: 0.35, boxShadow: `0 0 ${s * 3}px ${C.cyan}`}} />;
      })}
    </AbsoluteFill>
  );
};

const Copy: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const lines = [
    {from: 182, to: 236, t: 'ORGANIZA SEUS GASTOS.'},
    {from: 236, to: 282, t: 'MONTA SEU PLANO.'},
    {from: 282, to: 328, t: 'MOSTRA O PRÓXIMO PASSO.'},
  ];
  const cta = spring({frame: f - (B.brand.from + 44), fps, config: {damping: 14, stiffness: 120}});
  const shine = interpolate(f, [B.brand.from + 70, B.brand.from + 92], [-260, 900], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const logo = tween(f, [B.brand.from + 18, B.brand.from + 40], [0, 1]);
  const breathe = 1 + Math.sin(f / 10) * 0.01 * tween(f, [B.brand.from + 60, B.brand.from + 70], [0, 1]);
  return (
    <AbsoluteFill style={{fontFamily: FONT}}>
      {/* CHAOS */}
      {f < B.freeze.from + 4 && (
        <div style={{position: 'absolute', left: 90, top: 250}}>
          {f < 50 ? (
            <>
              <KLine text="TODO MÊS É A" start={-4} size={84} mode="glitch" exitAt={42} />
              <KLine text="MESMA HISTÓRIA?" start={4} size={100} mode="glitch" exitAt={44} />
            </>
          ) : (
            <>
              <KLine text="O DINHEIRO" start={48} size={92} exitAt={B.freeze.from - 8} />
              <KLine text="SOME ANTES" start={52} size={112} color={C.gold} exitAt={B.freeze.from - 6} />
              <KLine text="DO MÊS ACABAR." start={56} size={84} exitAt={B.freeze.from - 4} />
            </>
          )}
        </div>
      )}
      {/* FREEZE */}
      {f >= B.freeze.from && f < B.ai.from + 6 && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 640, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <KLine text="TÁ NA HORA DE" start={B.freeze.from + 8} size={78} exitAt={B.ai.from - 8} />
          <KLine text="TOMAR" start={B.freeze.from + 16} size={190} color={C.cyan} glow exitAt={B.ai.from - 6} tracking={-0.03} />
          <KLine text="JEITO." start={B.freeze.from + 22} size={190} color={C.cyan} glow exitAt={B.ai.from - 4} tracking={-0.03} />
        </div>
      )}
      {/* AI */}
      {f >= B.ai.from && f < B.brand.from + 4 && (
        <div style={{position: 'absolute', left: 90, top: 200}}>
          <KLine text="A IA DO RUMO" start={B.ai.from + 6} size={56} color={C.cyan} weight={800} tracking={0.04} exitAt={B.brand.from - 6} />
          <div style={{height: 120, position: 'relative'}}>
            {lines.map((l) =>
              f >= l.from - 2 && f < l.to + 12 ? (
                <div key={l.t} style={{position: 'absolute', top: 0}}>
                  <KLine text={l.t} start={l.from + 8} size={70} exitAt={l.to - 14} stagger={0.6} />
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}
      {/* BRAND */}
      {f >= B.brand.from && (
        <>
          <div style={{position: 'absolute', top: 640, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
            <div style={{fontSize: 230, fontWeight: 800, color: '#fff', letterSpacing: `${interpolate(logo, [0, 1], [0.4, 0.04])}em`, marginRight: `-${interpolate(logo, [0, 1], [0.4, 0.04])}em`, opacity: logo, filter: `blur(${(1 - logo) * 14}px)`, textShadow: '0 0 50px rgba(10,144,255,0.7)', transform: `scale(${breathe})`}}>
              RUMO
            </div>
          </div>
          <div style={{position: 'absolute', top: 920, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <KLine text="ARRUME SUA VIDA FINANCEIRA" start={B.brand.from + 30} size={50} weight={700} color="#CFE6FF" stagger={0.6} tracking={0.02} />
            <KLine text="COM GESTÃO DE IA." start={B.brand.from + 36} size={50} weight={800} color={C.cyan} stagger={0.6} tracking={0.02} glow />
          </div>
          <div style={{position: 'absolute', top: 1200, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
            <div style={{position: 'relative', overflow: 'hidden', padding: '34px 64px', borderRadius: 70, background: `linear-gradient(90deg, ${C.cyan}, ${C.blue} 55%, ${C.deep})`, boxShadow: '0 20px 60px rgba(10,144,255,0.55), inset 0 1px 0 rgba(255,255,255,0.45)', transform: `scale(${cta * breathe})`, opacity: Math.min(1, cta * 1.4), fontSize: 46, fontWeight: 800, color: '#fff', letterSpacing: '0.03em'}}>
              COMECE HOJE COM O RUMO
              <div style={{position: 'absolute', top: 0, bottom: 0, left: shine, width: 140, transform: 'skewX(-20deg)', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)'}} />
            </div>
          </div>
          <div style={{position: 'absolute', top: 1380, left: 0, right: 0, textAlign: 'center', fontSize: 30, fontWeight: 700, letterSpacing: '0.16em', color: '#9EC8F0', opacity: tween(f, [B.brand.from + 56, B.brand.from + 68], [0, 1])}}>
            ORGANIZE • PLANEJE • AVANCE
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};

/** Music ducks under the voice. */
const musicVolume = (f: number) => {
  const s = f / FPS;
  const talking = [
    [0.1, 4.05],
    [4.15, 5.2],
    [5.9, 10.25],
    [11.3, 14.0],
  ].some(([a, b]) => s > a - 0.1 && s < b + 0.15);
  const fadeOut = interpolate(f, [420, 450], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (talking ? 0.22 : 0.5) * fadeOut;
};

export const RumoJeito: React.FC<{withAudio: boolean}> = ({withAudio}) => {
  const f = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const exitBlur = tween(f, [B.brand.from - 4, B.brand.from + 6], [0, 6], easeIn) * tween(f, [B.brand.from + 6, B.brand.from + 16], [1, 0]);
  return (
    <AbsoluteFill style={{overflow: 'hidden', fontFamily: FONT}}>
      <Backdrop />
      <AbsoluteFill style={{filter: exitBlur > 0.1 ? `blur(${exitBlur}px)` : undefined}}>
        <ThreeCanvas width={width} height={height} gl={{antialias: true, alpha: true, preserveDrawingBuffer: true}} camera={{fov: 35, near: 0.1, far: 100}}>
          <Scene3D />
        </ThreeCanvas>
      </AbsoluteFill>
      <Dust />
      <FreezeFX />
      {/* legibility scrims */}
      <AbsoluteFill style={{background: 'linear-gradient(to bottom, rgba(2,9,21,0.75), rgba(2,9,21,0) 32%)', pointerEvents: 'none'}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, rgba(2,9,21,${0.55 * tween(f, [B.freeze.from, B.freeze.from + 10], [0, 1]) * tween(f, [B.ai.from - 6, B.ai.from + 6], [1, 0])}), transparent 60%)`, pointerEvents: 'none'}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 42%, rgba(2,9,21,${0.5 * tween(f, [B.brand.from + 10, B.brand.from + 30], [0, 1])}), transparent 55%)`, pointerEvents: 'none'}} />
      <Copy />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none'}} />
      {withAudio && (
        <>
          <Audio src={staticFile('jeito/music.mp3')} volume={musicVolume} />
          {VO.map((v, i) => (
            <Sequence key={`vo${i}`} from={Math.round(v.at * FPS)} layout="none">
              <Audio src={staticFile(`jeito/vo_0${i + 1}.wav`)} volume={1} />
            </Sequence>
          ))}
          {SFX.map(([file, at, vol], i) => (
            <Sequence key={`sfx${i}`} from={Math.round(at * FPS)} layout="none">
              <Audio src={staticFile(`jeito/${file}`)} volume={vol} />
            </Sequence>
          ))}
        </>
      )}
    </AbsoluteFill>
  );
};
