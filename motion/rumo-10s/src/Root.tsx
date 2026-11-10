import React from 'react';
import {Composition} from 'remotion';
import {RumoAd} from './RumoAd';
import {RumoJeito} from './jeito/RumoJeito';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="RumoAd" component={RumoAd} durationInFrames={300} fps={30} width={1080} height={1920} defaultProps={{showText: true}} />
    <Composition id="RumoAdSemTexto" component={RumoAd} durationInFrames={300} fps={30} width={1080} height={1920} defaultProps={{showText: false}} />
    <Composition id="RumoJeito" component={RumoJeito} durationInFrames={450} fps={30} width={1080} height={1920} defaultProps={{withAudio: true}} />
  </>
);
