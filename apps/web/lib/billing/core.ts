/** Regras puras de cobrança (testáveis sem provedor). */
export type Interval = "month" | "year";
export type PaidPlan = "pro" | "max" | "unlimited";

export function addInterval(d: Date, interval: Interval): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + (interval === "year" ? 12 : 1));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

/**
 * Pix pré-pago: o novo período começa no MAIOR entre agora e o fim do acesso vigente (sem perder
 * dias pagos e sem sobreposição) e dura 1 mês ou 1 ano.
 */
export function prepaidPeriod(now: Date, currentEnd: Date | null, interval: Interval) {
  const start = currentEnd && currentEnd > now ? currentEnd : now;
  return { starts_at: start, ends_at: addInterval(start, interval) };
}

export function priceMap(env: Record<string, unknown>): Map<string, { plan: PaidPlan; interval: Interval }> {
  const m = new Map<string, { plan: PaidPlan; interval: Interval }>();
  const add = (k: string, plan: PaidPlan, interval: Interval) => { const v = env[k]; if (typeof v === "string" && v) m.set(v, { plan, interval }); };
  add("STRIPE_PRICE_PRO_MONTH", "pro", "month"); add("STRIPE_PRICE_PRO_YEAR", "pro", "year");
  add("STRIPE_PRICE_MAX_MONTH", "max", "month"); add("STRIPE_PRICE_MAX_YEAR", "max", "year");
  add("STRIPE_PRICE_UNLIMITED_MONTH", "unlimited", "month"); add("STRIPE_PRICE_UNLIMITED_YEAR", "unlimited", "year");
  return m;
}

export function priceFor(env: Record<string, unknown>, plan: PaidPlan, interval: Interval): string | null {
  const v = env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval === "year" ? "YEAR" : "MONTH"}`];
  return typeof v === "string" && v ? v : null;
}

/** Estorno/contestação: política explícita (docs/politica-cobranca.md). */
export function refundAction(amountRefunded: number, amount: number, disputed: boolean): "revoke" | "keep" {
  if (disputed) return "revoke";
  return amountRefunded >= amount ? "revoke" : "keep"; // parcial: mantém acesso, registra auditoria
}
