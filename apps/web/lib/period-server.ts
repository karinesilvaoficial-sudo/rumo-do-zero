import "server-only";
import { cookies } from "next/headers";
import { type Period, resolvePeriod } from "./period";

export const PERIOD_COOKIE = "rumo_period";

/** Período: parâmetro da URL tem prioridade; senão o último escolhido (persiste na navegação). */
export async function getPeriod(sp: { p?: string; de?: string; ate?: string }, tz: string): Promise<Period> {
  if (sp.p) return resolvePeriod(sp.p, sp.de, sp.ate, tz);
  const c = (await cookies()).get(PERIOD_COOKIE)?.value;
  if (c) {
    const [k, f, t] = c.split("|");
    return resolvePeriod(k, f, t, tz);
  }
  return resolvePeriod("mes", undefined, undefined, tz);
}
