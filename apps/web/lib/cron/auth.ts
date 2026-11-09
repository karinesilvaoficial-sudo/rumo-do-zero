import "server-only";
import { timingSafeEqual } from "node:crypto";
import { integrationStatus, env } from "@/lib/env";

/** Endpoints de cron: segredo no cabeçalho (nunca em URL), comparação em tempo constante. */
export function cronAuthorized(req: Request): boolean {
  if (!integrationStatus().cron || !integrationStatus().admin_db) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
