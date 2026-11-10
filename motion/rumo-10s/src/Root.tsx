import React from 'react';
import {Composition} from 'remotion';
import {RumoAd} from './RumoAd';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="RumoAd" component={RumoAd} durationInFrames={300} fps={30} width={1080} height={1920} defaultProps={{showText: true}} />
    <Composition id="RumoAdSemTexto" component={RumoAd} durationInFrames={300} fps={30} width={1080} height={1920} defaultProps={{showText: false}} />
  </>
);
