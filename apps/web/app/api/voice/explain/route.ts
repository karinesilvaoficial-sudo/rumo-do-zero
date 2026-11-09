import { createHash, randomUUID } from "node:crypto";
import { formatBRL } from "@rumo/contracts";
import type { NextRequest } from "next/server";
import { z } from "zod";
import * as data from "@/lib/data";
import { assertCostAllowed, assertSameOrigin, errorResponse, json, rateLimit, requireMember, reserve, settle } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { integrationStatus } from "@/lib/env";
import { eleven, VOICE_SETTINGS } from "@/lib/voice/eleven";
import { SCREEN_SCRIPTS, SCRIPT_VERSION } from "@/lib/voice/scripts";
import { estimateSpeechSeconds, mp3Seconds, normalizeForSpeech } from "@/lib/voice/speech";
import { fmtDate } from "@/lib/period";

export const runtime = "nodejs";
export const maxDuration = 60;

const In = z.object({
  workspaceId: z.uuid(), screen: z.enum(Object.keys(SCREEN_SCRIPTS) as [string, ...string[]]),
  personal: z.boolean().default(false), period: z.object({ from: z.iso.date(), to: z.iso.date(), label: z.string().max(60) }).optional(),
});

/**
 * "Explique esta tela". Sem dados pessoais: roteiro geral, gerado uma vez por versão+voz+modelo e
 * reutilizado (bucket de tutoriais). Com dados: texto montado com os valores canônicos do período/filtro
 * atual (sob RLS) e áudio privado não cacheado.
 */
export async function POST(req: NextRequest) {
  let reservation: string | null = null;
  try {
    assertSameOrigin(req);
    const body = In.parse(await req.json());
    const { user, ws } = await requireMember(body.workspaceId, "reader");
    await rateLimit(`explain:${user.id}`, 10, 60);
    await assertCostAllowed("voice");
    const { client, voiceId, ttsModel } = eleven();
    let text = SCREEN_SCRIPTS[body.screen]!;

    if (!body.personal) {
      const key = createHash("sha256").update([body.screen, SCRIPT_VERSION, voiceId, ttsModel].join("|")).digest("hex");
      const path = `tutorials/${key}.mp3`;
      if (integrationStatus().admin_db) {
        const admin = supabaseAdmin();
        const hit = await admin.storage.from("public-tutorials").createSignedUrl(path, 600);
        if (hit.data?.signedUrl) return json({ url: hit.data.signedUrl, cached: true, text });
        const audio = await client.textToSpeech.convert(voiceId, { text: normalizeForSpeech(text), modelId: ttsModel, languageCode: "pt", outputFormat: "mp3_44100_128", voiceSettings: VOICE_SETTINGS });
        const buf = new Uint8Array(await new Response(audio).arrayBuffer());
        await admin.storage.from("public-tutorials").upload(path, buf, { contentType: "audio/mpeg", upsert: false });
        await admin.from("audio_assets").upsert({ kind: "tutorial", cache_key: key, voice_id: voiceId, model_id: ttsModel, storage_path: path, duration_ms: mp3Seconds(buf.byteLength) * 1000 }, { onConflict: "cache_key" });
        const signed = await admin.storage.from("public-tutorials").createSignedUrl(path, 600);
        return json({ url: signed.data?.signedUrl ?? null, cached: false, text });
      }
    } else if (body.period) {
      const s = await data.summary(ws.id, body.period.from, body.period.to);
      text += ` No espaço ${ws.name}, de ${fmtDate(body.period.from)} a ${fmtDate(body.period.to)}, as entradas somam ${formatBRL(s.income_cents)}, as saídas ${formatBRL(s.expense_cents)} e o resultado é ${formatBRL(s.result_cents)}. O saldo calculado no fim do período é ${formatBRL(s.balance_cents)}.`;
      if (Number(s.overdue_count) > 0) text += ` Há ${s.overdue_count} compromisso${Number(s.overdue_count) > 1 ? "s" : ""} vencido${Number(s.overdue_count) > 1 ? "s" : ""}.`;
    }

    const speech = normalizeForSpeech(text);
    const est = estimateSpeechSeconds(speech);
    reservation = await reserve(ws.id, "tts_seconds", est, `explain:${user.id}:${randomUUID()}`);
    const audio = await client.textToSpeech.convert(voiceId, { text: speech, modelId: ttsModel, languageCode: "pt", outputFormat: "mp3_44100_128", voiceSettings: VOICE_SETTINGS }, { abortSignal: req.signal });
    const buf = new Uint8Array(await new Response(audio).arrayBuffer());
    await settle(reservation, Math.min(mp3Seconds(buf.byteLength), est), null, true);
    return new Response(buf, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store", "X-Explain-Text": encodeURIComponent(text.slice(0, 1500)) } });
  } catch (e) {
    if (reservation) await settle(reservation, 0).catch(() => undefined);
    return errorResponse(e);
  }
}
