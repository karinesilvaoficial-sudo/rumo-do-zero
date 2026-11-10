import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Background} from './components/Background';
import {HookAndTurn} from './scenes/HookAndTurn';
import {Product} from './scenes/Product';
import {Finale} from './scenes/Finale';
import {ShowTextProvider} from './ShowText';
import {C, FONT, T, tween} from './theme';

const BrandMark: React.FC = () => {
  const f = useCurrentFrame();
  const o = tween(f, [2, 14], [0, 1]) * tween(f, [T.productEnd - 10, T.productEnd], [1, 0]);
  return (
    <div style={{position: 'absolute', top: 120, left: 100, display: 'flex', alignItems: 'center', gap: 16, opacity: o, fontFamily: FONT}}>
      <div style={{width: 7, height: 40, borderRadius: 4, background: `linear-gradient(${C.cyan}, ${C.blue})`, boxShadow: `0 0 12px ${C.blue}`}} />
      <div style={{fontSize: 38, fontWeight: 800, letterSpacing: '0.08em', color: C.white}}>RUMO</div>
    </div>
  );
};

export const RumoAd: React.FC<{showText: boolean}> = ({showText}) => (
  <ShowTextProvider value={showText}>
    <AbsoluteFill style={{fontFamily: FONT, overflow: 'hidden'}}>
      <Background />
      <HookAndTurn />
      <Product />
      <Finale />
      {showText && <BrandMark />}
    </AbsoluteFill>
  </ShowTextProvider>
);
