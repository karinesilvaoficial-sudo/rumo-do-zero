import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { assertCostAllowed, assertSameOrigin, errorResponse, HttpError, json, rateLimit, requireMember, reserve, settle } from "@/lib/guard";
import { eleven } from "@/lib/voice/eleven";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_SECONDS = 90;
const TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"];

/**
 * Falar com o RUMO: transcrição ElevenLabs (Scribe) em português. A gravação bruta não é armazenada:
 * vai direto ao provedor e é descartada (retenção zero por padrão).
 */
export async function POST(req: NextRequest) {
  let reservation: string | null = null;
  try {
    assertSameOrigin(req);
    const fd = await req.formData();
    const workspaceId = String(fd.get("workspaceId") ?? "");
    const declared = Math.min(MAX_SECONDS, Math.max(1, Math.ceil(Number(fd.get("seconds") ?? MAX_SECONDS))));
    const file = fd.get("audio");
    if (!(file instanceof File)) throw new HttpError(400, "no_audio");
    if (file.size > MAX_BYTES) throw new HttpError(413, "audio_too_large", "Gravação muito longa.");
    if (!TYPES.some((t) => file.type.startsWith(t))) throw new HttpError(415, "audio_type");
    const { user } = await requireMember(workspaceId, "reader");
    await rateLimit(`stt:${user.id}`, 15, 60);
    await assertCostAllowed("voice");
    reservation = await reserve(workspaceId, "stt_seconds", declared, `stt:${user.id}:${randomUUID()}`);
    const { client, sttModel } = eleven();
    const r = await client.speechToText.convert({ file, modelId: sttModel, languageCode: "por", tagAudioEvents: false, diarize: false }, { abortSignal: req.signal });
    const res = r as { text?: string; audioDurationSecs?: number };
    const used = Math.ceil(res.audioDurationSecs ?? declared);
    await settle(reservation, Math.min(used, declared), null, res.audioDurationSecs === undefined);
    return json({ text: (res.text ?? "").trim().slice(0, 4000), seconds: used });
  } catch (e) {
    if (reservation) await settle(reservation, 0).catch(() => undefined);
    return errorResponse(e);
  }
}
