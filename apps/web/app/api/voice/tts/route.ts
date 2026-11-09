import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertCostAllowed, assertSameOrigin, errorResponse, rateLimit, requireMember, reserve, settle } from "@/lib/guard";
import { eleven, VOICE_SETTINGS } from "@/lib/voice/eleven";
import { estimateSpeechSeconds, mp3Seconds, normalizeForSpeech } from "@/lib/voice/speech";

export const runtime = "nodejs";
export const maxDuration = 60;

const In = z.object({ workspaceId: z.uuid(), text: z.string().min(1).max(6000) });

/**
 * Ouvir resposta: TTS personalizado (privado, sem cache público). Reserva conservadora pelo texto,
 * cobrança pela duração realmente gerada; cancelamento do cliente interrompe a geração.
 */
export async function POST(req: NextRequest) {
  let reservation: string | null = null;
  try {
    assertSameOrigin(req);
    const body = In.parse(await req.json());
    const { user } = await requireMember(body.workspaceId, "reader");
    await rateLimit(`tts:${user.id}`, 20, 60);
    await assertCostAllowed("voice");
    const speech = normalizeForSpeech(body.text);
    const est = estimateSpeechSeconds(speech);
    reservation = await reserve(body.workspaceId, "tts_seconds", est, `tts:${user.id}:${createHash("sha256").update(speech).digest("hex").slice(0, 24)}:${randomUUID()}`);
    const { client, voiceId, ttsModel } = eleven();
    const upstream = await client.textToSpeech.stream(voiceId, { text: speech, modelId: ttsModel, languageCode: "pt", outputFormat: "mp3_44100_128", voiceSettings: VOICE_SETTINGS }, { abortSignal: req.signal });
    const rid = reservation;
    let bytes = 0;
    const counted = upstream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) { bytes += chunk.byteLength; ctl.enqueue(chunk); },
      async flush() { await settle(rid, Math.min(mp3Seconds(bytes), est), null, true); },
    }));
    req.signal.addEventListener("abort", () => { void settle(rid, mp3Seconds(bytes), null, true); });
    return new Response(counted, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store", "X-Reserved-Seconds": String(est) } });
  } catch (e) {
    if (reservation) await settle(reservation, 0).catch(() => undefined); // falha: libera a reserva
    return errorResponse(e);
  }
}
