import { cronAuthorized } from "@/lib/cron/auth";
import { processOutbox, processReports } from "@/lib/cron/workers";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Fila: e-mails e relatórios. Agendar conforme o plano da Vercel (ver docs/implantacao.md). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("unauthorized", { status: 401 });
  const [outbox, reports] = await Promise.all([processOutbox(), processReports()]);
  return Response.json({ outbox, reports, at: new Date().toISOString() });
}
