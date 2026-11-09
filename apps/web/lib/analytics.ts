import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { requireIntegration } from "@/lib/env";

/** Assinatura de serviço Node → Python (ver apps/analytics/rumo_analytics/security.py). */
export function signServiceRequest(secret: string, ts: string, requestId: string, userId: string, workspaceId: string, body: string): string {
  const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
  return createHmac("sha256", secret).update([ts, requestId, userId, workspaceId, bodyHash].join(".")).digest("hex");
}

export class AnalyticsError extends Error {}

/**
 * Chama o serviço analítico com o contexto do usuário já autorizado. O Python recebe apenas
 * os dados que este servidor leu sob RLS; não recebe chave do banco.
 */
export async function analytics<T>(path: string, ctx: { userId: string; workspaceId: string }, payload: unknown,
  opts: { binary?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const e = requireIntegration("analytics");
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const rid = randomUUID().replace(/-/g, "");
  const res = await fetch(new URL(path, e.ANALYTICS_URL).toString(), {
    method: "POST",
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    headers: {
      "content-type": "application/json",
      "x-rumo-ts": ts,
      "x-rumo-request-id": rid,
      "x-rumo-user": ctx.userId,
      "x-rumo-workspace": ctx.workspaceId,
      "x-rumo-signature": signServiceRequest(e.RUMO_SERVICE_SECRET!, ts, rid, ctx.userId, ctx.workspaceId, body),
    },
  });
  if (!res.ok) throw new AnalyticsError(`analytics_${res.status}`);
  return (opts.binary ? new Uint8Array(await res.arrayBuffer()) : await res.json()) as T;
}
