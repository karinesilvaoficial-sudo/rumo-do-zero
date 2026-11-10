import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {KLine} from '../components/Kinetic';
import {C, FONT, T, easeIn, easeInOut, tween} from '../theme';
import {useShowText} from '../ShowText';

const S = T.turnEnd; // 129
const E = T.productEnd; // 231

const PHONE_W = 540;
const PHONE_H = 1080;
const PHONE_X = (1080 - PHONE_W) / 2;
const PHONE_Y = 500;

/** UI panel that slides in with a mask reveal. */
const Panel: React.FC<{at: number; children: React.ReactNode; style?: React.CSSProperties; highlight?: number}> = ({
  at,
  children,
  style,
  highlight = 0,
}) => {
  const f = useCurrentFrame();
  const p = tween(f, [at, at + 16], [0, 1]);
  return (
    <div
      style={{
        borderRadius: 22,
        background: 'linear-gradient(150deg, rgba(22,64,110,0.85), rgba(8,26,48,0.9))',
        border: `1.5px solid rgba(54,190,255,${0.25 + highlight * 0.45})`,
        boxShadow: `0 0 ${highlight * 30}px rgba(10,144,255,${highlight * 0.5})`,
        opacity: p,
        transform: `translateY(${(1 - p) * 40}px)`,
        clipPath: `inset(0 0 ${(1 - p) * 100}% 0 round 22px)`,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const Label: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{fontSize: 15, fontWeight: 700, letterSpacing: '0.14em', color: '#9EC8F0'}}>{children}</div>
);

const Screen: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t0 = S + 14;
  // abstract plan progress (no values), with a travelling shimmer
  const prog = tween(f, [t0 + 22, t0 + 60], [0.08, 0.62], easeInOut);
  const shimmer = ((f - t0) * 9) % 700;
  const check = tween(f, [t0 + 38, t0 + 52], [60, 0]);
  const checkPop = spring({frame: f - (t0 + 36), fps, config: {damping: 12, stiffness: 160}});
  const assistantAt = t0 + 44;
  const msg = 'Orientação para agir';
  const typed = Math.floor(tween(f, [assistantAt + 18, assistantAt + 40], [0, msg.length], (x) => x));
  const typing = f > assistantAt + 6 && f < assistantAt + 18;
  const ringRot = (f - S) * 4;

  return (
    <div style={{position: 'absolute', inset: 18, borderRadius: 54, overflow: 'hidden', background: 'linear-gradient(170deg, #0A1E38, #04101F)', fontFamily: FONT, color: C.white}}>
      {/* notch */}
      <div style={{position: 'absolute', top: 16, left: '50%', width: 150, height: 34, marginLeft: -75, borderRadius: 20, background: '#01060D'}} />
      <div style={{padding: '78px 30px 0'}}>
        {/* header */}
        <Panel at={t0} style={{background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: 0}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div style={{fontSize: 44, fontWeight: 800, letterSpacing: '0.02em'}}>RUMO</div>
            <svg width={40} height={40} viewBox="0 0 40 40">
              <circle cx={20} cy={20} r={15} stroke={C.cyan} strokeWidth={3.5} fill="none" opacity={0.35} />
              <circle cx={20} cy={20} r={15} stroke={C.cyan} strokeWidth={3.5} fill="none" strokeDasharray="30 64" transform={`rotate(${ringRot} 20 20)`} strokeLinecap="round" />
            </svg>
          </div>
          <div style={{fontSize: 26, fontWeight: 600, marginTop: 22, color: '#DCE8F7'}}>Seu próximo passo</div>
        </Panel>

        {/* plan module */}
        <Panel at={t0 + 10} style={{marginTop: 22, padding: '22px 24px 26px'}} highlight={tween(f, [t0 + 22, t0 + 34], [0, 1]) * tween(f, [t0 + 56, t0 + 70], [1, 0])}>
          <Label>PLANO FINANCEIRO</Label>
          <div style={{fontSize: 27, fontWeight: 700, marginTop: 10}}>Clareza para avançar</div>
          <div style={{marginTop: 22, height: 12, borderRadius: 8, background: 'rgba(120,170,220,0.18)', overflow: 'hidden', position: 'relative'}}>
            <div style={{width: `${prog * 100}%`, height: '100%', borderRadius: 8, background: `linear-gradient(90deg, ${C.blue}, ${C.cyan})`, boxShadow: `0 0 14px ${C.blue}`}} />
            <div style={{position: 'absolute', top: 0, left: shimmer - 200, width: 120, height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)'}} />
          </div>
          {/* abstract step dots */}
          <div style={{display: 'flex', gap: 12, marginTop: 18}}>
            {[0, 1, 2, 3].map((i) => {
              const on = tween(f, [t0 + 26 + i * 8, t0 + 32 + i * 8], [0, 1]);
              return <div key={i} style={{width: 14, height: 14, borderRadius: 7, background: on > 0.5 ? C.cyan : 'rgba(120,170,220,0.25)', transform: `scale(${1 + on * 0.15 * (1 - on)})`, boxShadow: on > 0.5 ? `0 0 10px ${C.cyan}` : undefined}} />;
            })}
          </div>
        </Panel>

        {/* goals + debts */}
        <div style={{display: 'flex', gap: 16, marginTop: 18}}>
          <Panel at={t0 + 22} style={{flex: 1, padding: '20px 20px', height: 170}}>
            <Label>METAS</Label>
            <svg width={74} height={74} viewBox="0 0 74 74" style={{marginTop: 16, transform: `scale(${0.7 + 0.3 * Math.min(checkPop, 1.2)})`}}>
              <circle cx={37} cy={37} r={31} stroke={C.cyan} strokeWidth={5} fill="rgba(54,221,255,0.08)" />
              <path d="M22 38 L33 49 L53 27" stroke={C.cyan} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={60} strokeDashoffset={check} />
            </svg>
          </Panel>
          <Panel at={t0 + 28} style={{flex: 1, padding: '20px 20px', height: 170}}>
            <Label>DÍVIDAS</Label>
            {/* abstract bars re-ordering into a plan (no values) */}
            <div style={{marginTop: 26}}>
              {[0.9, 0.62, 0.38].map((target, i) => {
                const sortP = tween(f, [t0 + 40, t0 + 62], [0, 1], easeInOut);
                const start = [0.45, 0.95, 0.6][i];
                const w = interpolate(sortP, [0, 1], [start, target]) * tween(f, [t0 + 30 + i * 3, t0 + 44 + i * 3], [0, 1]);
                return <div key={i} style={{height: 9, borderRadius: 5, marginBottom: 18, width: `${w * 100}%`, background: i === 0 ? `linear-gradient(90deg, ${C.blue}, ${C.cyan})` : 'rgba(140,190,235,0.45)'}} />;
              })}
            </div>
          </Panel>
        </div>

        {/* AI assistant */}
        <Panel at={assistantAt} style={{marginTop: 18, padding: '22px 22px'}} highlight={tween(f, [assistantAt + 10, assistantAt + 24], [0, 1])}>
          <div style={{display: 'flex', gap: 18, alignItems: 'center'}}>
            <div style={{width: 54, height: 54, borderRadius: 27, background: `radial-gradient(circle at 35% 30%, ${C.cyan}, ${C.blue} 60%, ${C.deep})`, boxShadow: `0 0 ${18 + Math.sin(f / 4) * 8}px ${C.blue}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <svg width={28} height={28} viewBox="0 0 28 28">
                <path d="M14 3 L16.5 11.5 L25 14 L16.5 16.5 L14 25 L11.5 16.5 L3 14 L11.5 11.5 Z" fill="#fff" transform={`rotate(${(f - assistantAt) * 2} 14 14)`} />
              </svg>
            </div>
            <div>
              <div style={{fontSize: 24, fontWeight: 800}}>Assistente com IA</div>
              <div style={{fontSize: 20, fontWeight: 500, color: '#A9C6E6', marginTop: 6, height: 26, display: 'flex', alignItems: 'center'}}>
                {typing
                  ? [0, 1, 2].map((i) => <span key={i} style={{width: 9, height: 9, borderRadius: 5, background: C.cyan, marginRight: 7, opacity: 0.3 + 0.7 * Math.abs(Math.sin((f + i * 4) / 4))}} />)
                  : msg.slice(0, typed)}
                {!typing && typed < msg.length && f > assistantAt + 18 && <span style={{width: 2, height: 22, background: C.cyan, marginLeft: 3}} />}
              </div>
            </div>
          </div>
        </Panel>
        {/* next actions: abstract checklist (no data) */}
        <Panel at={assistantAt + 10} style={{marginTop: 18, padding: '20px 22px 8px'}}>
          <Label>PRÓXIMAS AÇÕES</Label>
          {['Organizar contas', 'Definir uma meta', 'Revisar o plano'].map((t, i) => {
            const at = assistantAt + 16 + i * 5;
            const p = tween(f, [at, at + 10], [0, 1]);
            const done = tween(f, [at + 8, at + 13], [0, 1]);
            return (
              <div key={t} style={{display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0', opacity: p, transform: `translateX(${(1 - p) * 30}px)`}}>
                <div style={{width: 26, height: 26, borderRadius: 8, border: `2.5px solid ${C.cyan}`, background: `rgba(54,221,255,${done * 0.9})`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                  <svg width={16} height={16} viewBox="0 0 16 16"><path d="M3 8.5 L6.5 12 L13 4.5" stroke="#04101F" strokeWidth={2.6} fill="none" strokeDasharray={16} strokeDashoffset={16 * (1 - done)} strokeLinecap="round" /></svg>
                </div>
                <div style={{fontSize: 21, fontWeight: 600, color: '#DCE8F7'}}>{t}</div>
              </div>
            );
          })}
        </Panel>
      </div>
      {/* glass reflection sweep */}
      <div style={{position: 'absolute', inset: 0, background: `linear-gradient(115deg, transparent ${30 + (f - S) * 0.5}%, rgba(255,255,255,0.07) ${38 + (f - S) * 0.5}%, transparent ${48 + (f - S) * 0.5}%)`}} />
    </div>
  );
};

/** Floating glass widgets behind the phone, moving with parallax. */
const Satellites: React.FC<{rotY: number}> = ({rotY}) => {
  const f = useCurrentFrame();
  const a = tween(f, [S + 30, S + 50], [0, 1]);
  const b = tween(f, [S + 40, S + 60], [0, 1]);
  const line = tween(f, [S + 42, S + 76], [400, 0]);
  const donut = tween(f, [S + 34, S + 70], [0, 1], easeInOut);
  const px = rotY * 6;
  return (
    <>
      <div style={{position: 'absolute', left: 30 + px * 1.6, top: 760 + Math.sin(f / 18) * 10, width: 230, height: 200, opacity: a * 0.95, transform: `translateX(${(1 - a) * -60}px) rotate(-6deg)`, borderRadius: 26, background: 'linear-gradient(150deg, rgba(20,60,105,0.55), rgba(6,20,36,0.6))', border: `1.5px solid ${C.glassBorder}`, filter: 'blur(0.6px)'}}>
        <svg width={230} height={200} viewBox="0 0 230 200">
          <circle cx={115} cy={100} r={58} stroke="rgba(120,170,220,0.2)" strokeWidth={18} fill="none" />
          {[
            [C.cyan, 0.42, 0],
            [C.blue, 0.33, 0.42],
            [C.gold, 0.13, 0.75],
          ].map(([col, len, off], i) => {
            const L = 2 * Math.PI * 58;
            return (
              <circle key={i} cx={115} cy={100} r={58} stroke={col as string} strokeWidth={18} fill="none" strokeDasharray={`${L * (len as number) * donut} ${L}`} strokeDashoffset={-L * (off as number) * donut} transform="rotate(-90 115 100)" />
            );
          })}
        </svg>
      </div>
      <div style={{position: 'absolute', right: 26 - px * 1.6, top: 1180 + Math.cos(f / 16) * 10, width: 250, height: 170, opacity: b * 0.95, transform: `translateX(${(1 - b) * 60}px) rotate(5deg)`, borderRadius: 26, background: 'linear-gradient(150deg, rgba(20,60,105,0.55), rgba(6,20,36,0.6))', border: `1.5px solid ${C.glassBorder}`, filter: 'blur(0.6px)'}}>
        <svg width={250} height={170} viewBox="0 0 250 170">
          <path d="M20 140 C 70 130, 80 90, 120 95 S 180 60, 230 30" stroke={C.cyan} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={400} strokeDashoffset={line} style={{filter: `drop-shadow(0 0 8px ${C.cyan})`}} />
        </svg>
      </div>
    </>
  );
};

export const Product: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const show = useShowText();
  if (f < S - 8 || f > E + 22) return null;

  // phone: enters from below with a 12° rotation and locks frontally
  const enter = spring({frame: f - (S - 6), fps, config: {damping: 18, stiffness: 70, mass: 1}});
  const rotY = interpolate(enter, [0, 1], [-12, 0]) + Math.sin((f - S) / 30) * 0.8 * enter;
  const rotX = interpolate(enter, [0, 1], [10, 0]);
  const y = interpolate(enter, [0, 1], [420, 0]);
  const flash = tween(f, [S - 8, S], [0, 1]) * tween(f, [S, S + 12], [1, 0]);

  // dissolve into particles at the end of the scene
  const dis = tween(f, [E - 4, E + 16], [0, 1], easeIn);
  const camScale = interpolate(f, [S, E], [1.0, 1.05], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `scale(${camScale})`}}>
        <div style={{opacity: 1 - dis}}>
          <Satellites rotY={rotY} />
        </div>
        {/* floor reflection / halo */}
        <div style={{position: 'absolute', left: 140, top: 1420, width: 800, height: 260, borderRadius: '50%', background: 'radial-gradient(rgba(10,144,255,0.45), transparent 70%)', filter: 'blur(30px)', opacity: enter * (1 - dis)}} />
        <div style={{position: 'absolute', inset: 0, perspective: 1800}}>
          <div
            style={{
              position: 'absolute',
              left: PHONE_X,
              top: PHONE_Y + y,
              width: PHONE_W,
              height: PHONE_H,
              transformStyle: 'preserve-3d',
              transform: `rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${1.06 + dis * 0.12})`,
              opacity: (f < S - 6 ? 0 : 1) * (1 - dis),
              filter: dis > 0 ? `blur(${dis * 14}px)` : undefined,
            }}
          >
            {/* body thickness */}
            <div style={{position: 'absolute', inset: 0, borderRadius: 72, background: '#0B1A2E', transform: 'translateZ(-26px)', boxShadow: '0 60px 120px rgba(0,0,0,0.6)'}} />
            <div style={{position: 'absolute', inset: 0, borderRadius: 72, background: 'linear-gradient(140deg, #7F95B4, #2B3F5C 30%, #13233A 70%, #6C84A6)', padding: 6}}>
              <div style={{position: 'absolute', inset: 6, borderRadius: 66, background: '#01060D'}} />
              <Screen />
            </div>
            {/* rim light */}
            <div style={{position: 'absolute', inset: -2, borderRadius: 74, boxShadow: `0 0 60px rgba(10,144,255,0.35), inset 0 0 0 2px rgba(150,210,255,0.35)`}} />
          </div>
        </div>
      </AbsoluteFill>

      {show && (
        <div style={{position: 'absolute', left: 100, top: 210, opacity: 1 - dis}}>
          <KLine text="ORGANIZAÇÃO" start={S + 4} size={70} />
          <div style={{display: 'flex'}}>
            <KLine text="+ " start={S + 12} size={70} color={C.cyan} />
            <KLine text="PLANO DE AÇÃO" start={S + 14} size={70} />
          </div>
          <div style={{display: 'flex'}}>
            <KLine text="+ " start={S + 22} size={70} color={C.cyan} />
            <KLine text="IA" start={S + 24} size={70} color={C.cyan} glow />
          </div>
        </div>
      )}
      {/* entrance energy flash (transition from the turn) */}
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 55%, rgba(120,220,255,0.9), rgba(10,144,255,0.35) 35%, transparent 70%)', opacity: flash * 0.8, mixBlendMode: 'screen'}} />
    </AbsoluteFill>
  );
};
