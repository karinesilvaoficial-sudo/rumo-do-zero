import type { NextRequest } from "next/server";
import { z } from "zod";
import { buildContext, estimateCredits, providerCostMicros, runChat, type Turn } from "@/lib/ai/run";
import { assertCostAllowed, assertSameOrigin, errorResponse, HttpError, json, rateLimit, requireMember, reserve, settle } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const In = z.object({
  workspaceId: z.uuid(),
  conversationId: z.uuid().nullable(),
  message: z.string().trim().min(1).max(4000),
  inputMode: z.enum(["text", "voice"]).default("text"),
  period: z.object({ from: z.iso.date(), to: z.iso.date(), label: z.string().max(60) }),
  requestId: z.uuid(),
  confirmCredits: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  let reservation: string | null = null;
  try {
    assertSameOrigin(req);
    const body = In.parse(await req.json());
    const { user, ws, sb } = await requireMember(body.workspaceId, "reader");
    await rateLimit(`ai:${user.id}`, 12, 60);
    await assertCostAllowed("ai");

    // histórico curto da MESMA conversa, do mesmo usuário e espaço (RLS) + decisões já executadas
    let history: Turn[] = [];
    let decisions = "";
    if (body.conversationId) {
      const { data: conv } = await sb.from("conversations").select("id").eq("id", body.conversationId).eq("workspace_id", ws.id).eq("user_id", user.id).maybeSingle();
      if (!conv) throw new HttpError(404, "conversation_not_found");
      const [{ data: msgs }, { data: done }] = await Promise.all([
        sb.from("messages").select("role,content").eq("conversation_id", body.conversationId).order("created_at", { ascending: false }).limit(6),
        sb.from("ai_action_intents").select("tool,summary,executed_at").eq("conversation_id", body.conversationId).eq("status", "executed").order("executed_at").limit(10),
      ]);
      history = (msgs ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 1500) }));
      if (history[0]?.role === "assistant") history.shift();
      if (done?.length) decisions = `\nDecisões já confirmadas nesta conversa (v${done.length}): ${done.map((d) => `${d.tool}: ${d.summary}`).join("; ")}`;
    }
    const context = (await buildContext(ws, body.period)) + decisions;
    const est = await estimateCredits(context, history, body.message);
    if (est.credits > 1 && body.confirmCredits !== est.credits) {
      const { data: ent } = await sb.rpc("my_entitlements");
      const avail = ws.owner_id === user.id ? (ent as { usage?: { ai_credits?: { available?: number } } })?.usage?.ai_credits?.available ?? null : null;
      return json({ needsConfirmation: true, credits: est.credits, available: avail }, 200);
    }
    reservation = await reserve(ws.id, "ai_credits", est.credits, `ai:${user.id}:${body.requestId}`);

    let conversationId = body.conversationId;
    if (!conversationId) {
      const { data, error } = await sb.rpc("start_conversation", { ws: ws.id, p_title: body.message.slice(0, 80) });
      if (error) throw error;
      conversationId = data as string;
    }
    await sb.rpc("append_message", { ws: ws.id, p_conversation_id: conversationId, p_role: "user", p_content: body.message, p_meta: {}, p_input_mode: body.inputMode });

    const result = await runChat({ ctx: { userId: user.id, workspaceId: ws.id, conversationId }, context, history, question: body.message, credits: est.credits, signal: req.signal });
    await settle(reservation, result.usage.credits, providerCostMicros(result.usage.input, result.usage.output), providerCostMicros(1, 1) === null ? null : false);
    reservation = null;

    const text = result.text || (result.truncated ? "A resposta precisaria de mais créditos do que os reservados. Tente uma pergunta mais específica." : "");
    const meta = { workspace: ws.name, period: body.period, sources: result.sources, intents: result.intents.map((i) => ({ id: i.intent_id, tool: i.tool, summary: i.summary, hash: i.payload_hash, expires_at: i.expires_at, payload: i.payload })), documents: result.documents, credits: result.usage.credits, truncated: result.truncated };
    const { data: msgId } = await sb.rpc("append_message", { ws: ws.id, p_conversation_id: conversationId, p_role: "assistant", p_content: text, p_meta: meta, p_input_mode: "text" });
    return json({ conversationId, messageId: msgId, text, ...meta });
  } catch (e) {
    // falha do provedor: libera a reserva e NÃO registra resposta como entregue
    if (reservation) await settle(reservation, 0).catch(() => undefined);
    return errorResponse(e);
  }
}
