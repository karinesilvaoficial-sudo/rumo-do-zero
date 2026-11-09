import "server-only";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { requireIntegration } from "@/lib/env";

export function eleven() {
  const e = requireIntegration("voice");
  return { client: new ElevenLabsClient({ apiKey: e.ELEVENLABS_API_KEY! }), voiceId: e.ELEVENLABS_VOICE_ID!, ttsModel: e.ELEVENLABS_TTS_MODEL, sttModel: e.ELEVENLABS_STT_MODEL };
}

/** Configuração de voz: executiva, firme e serena (estabilidade alta, estilo moderado). */
export const VOICE_SETTINGS = { stability: 0.55, similarityBoost: 0.8, style: 0.2, useSpeakerBoost: true, speed: 0.98 };
