import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, errorResponse, json, rateLimit, requireMember } from "@/lib/guard";

export const runtime = "nodejs";

const In = z.object({ workspaceId: z.uuid(), intentId: z.uuid(), hash: z.string().regex(/^[0-9a-f]{64}$/), decision: z.enum(["confirm", "reject"]) });

/** Confirmação vinculada a id+hash+usuário+espaço+validade; execução atômica e única no banco. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const b = In.parse(await req.json());
    const { user, sb } = await requireMember(b.workspaceId, "collaborator");
    await rateLimit(`intent:${user.id}`, 30, 60);
    if (b.decision === "reject") {
      const { error } = await sb.rpc("reject_intent", { ws: b.workspaceId, p_intent_id: b.intentId });
      if (error) throw error;
      return json({ status: "rejected" });
    }
    const { data, error } = await sb.rpc("confirm_intent", { ws: b.workspaceId, p_intent_id: b.intentId, p_payload_hash: b.hash });
    if (error) throw error;
    for (const p of ["/app", "/app/metas", "/app/lancamentos", "/app/planejamento", "/app/rendas"]) revalidatePath(p);
    return json(data);
  } catch (e) {
    return errorResponse(e);
  }
}
